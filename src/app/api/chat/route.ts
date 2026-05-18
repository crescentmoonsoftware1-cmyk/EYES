import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { invokeModel, invokeModelStream } from '@/services/ai/ai';

// ── Cognitive context injection ────────────────────────────────────────────
// Reads from cognitive_clusters, detected_loops, drift_snapshots tables.
// Returns null silently if tables are empty or don't exist yet.
async function fetchCognitiveContext(
  supabase: SupabaseClient,
  userId: string
): Promise<string | null> {
  try {
    const [clusterRes, loopsRes, driftRes] = await Promise.allSettled([
      supabase
        .from('cognitive_clusters')
        .select('cluster_label,cluster_description,days_in_cluster')
        .eq('user_id', userId)
        .eq('is_current', true)
        .limit(1)
        .single(),
      supabase
        .from('detected_loops')
        .select('loop_description,occurrence_count')
        .eq('user_id', userId)
        .eq('is_active', true)
        .limit(3),
      supabase
        .from('drift_snapshots')
        .select('gaps')
        .eq('user_id', userId)
        .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .single(),
    ]);

    const parts: string[] = [];

    if (clusterRes.status === 'fulfilled' && clusterRes.value.data) {
      const c = clusterRes.value.data;
      parts.push(
        `CURRENT COGNITIVE STATE: ${c.cluster_label}` +
        (c.days_in_cluster > 0 ? ` (${c.days_in_cluster} days in this state)` : '') +
        (c.cluster_description ? `. ${c.cluster_description}` : '')
      );
    }

    if (loopsRes.status === 'fulfilled' && Array.isArray(loopsRes.value.data) && loopsRes.value.data.length > 0) {
      const summary = loopsRes.value.data
        .map((l: { loop_description: string; occurrence_count: number }) =>
          `"${l.loop_description}" (${l.occurrence_count}x)`)
        .join('; ');
      parts.push(`ACTIVE BEHAVIORAL LOOPS: ${summary}`);
    }

    if (driftRes.status === 'fulfilled' && driftRes.value.data) {
      const gaps = driftRes.value.data.gaps as Array<{ gap_summary?: string }>;
      if (Array.isArray(gaps) && gaps.length > 0) {
        const driftSummary = gaps.slice(0, 2)
          .map(g => g.gap_summary)
          .filter(Boolean)
          .join('; ');
        if (driftSummary) parts.push(`RECENT DRIFT DETECTED: ${driftSummary}`);
      }
    }

    return parts.length > 0 ? parts.join('\n') : null;
  } catch {
    return null; // Cognitive tables may not be populated yet — safe to ignore
  }
}

type ChatHistoryMessage = { role: 'system' | 'user' | 'assistant'; content: string };
type ChatRequestBody = { message?: string; history?: ChatHistoryMessage[] };
type MatchEmbeddingRow = { id: string; content: string; similarity: number };
type RawEventCitationRow = {
  id: string;
  platform: string;
  platform_id: string;
  title: string | null;
  event_type: string | null;
  author: string | null;
  timestamp: string | null;
};

type HybridSearchRow = {
  id: string;
  platform: string;
  source_id: string;
  event_type: string | null;
  title: string | null;
  content: string;
  author: string | null;
  source_url: string | null;
  timestamp: string | null;
  metadata: Record<string, unknown>;
  is_flagged: boolean;
  similarity: number;
  keyword_rank: number;
  combined_score: number;
};

type ChatCitation = {
  sourceId: number;
  memoryId: string;
  platform: string;
  title: string | null;
  eventType: string | null;
  author: string | null;
  timestamp: string | null;
  similarity: number;
  rerankScore: number;
  snippet: string;
};

type ChatDiagnostics = {
  contextCount: number;
  retrievalLatencyMs: number;
  confidenceScore: number;
  groundedScore: number;
  rerankApplied: boolean;
  retrievalStatus: 'success' | 'empty' | 'error' | 'skipped';
  retrievalError: string | null;
};

const CHAT_ROLES = new Set<ChatHistoryMessage['role']>(['system', 'user', 'assistant']);

function normalizeHistory(history: unknown): ChatHistoryMessage[] {
  if (!Array.isArray(history)) return [];
  return history
    .filter((entry): entry is { role: unknown; content: unknown } => Boolean(entry && typeof entry === 'object'))
    .filter((entry): entry is ChatHistoryMessage => {
      const role = entry.role;
      const content = entry.content;
      return typeof role === 'string' && CHAT_ROLES.has(role as ChatHistoryMessage['role']) && typeof content === 'string';
    });
}

function isStreamRequested(request: Request) {
  const url = new URL(request.url);
  return url.searchParams.get('stream') === '1';
}

function sanitizeHeaderValue(value: string) {
  return value.replace(/[\r\n]+/g, ' ').trim().slice(0, 180);
}

function resolveBaseUrl(request: Request) {
  try {
    return new URL(request.url).origin;
  } catch {
    return process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  }
}

function toConfidenceScore(citations: ChatCitation[]) {
  if (citations.length === 0) return 0;
  const sum = citations.reduce((total, citation) => total + citation.similarity, 0);
  return Number((sum / citations.length).toFixed(3));
}

function toGroundedScore(citations: ChatCitation[]) {
  if (citations.length === 0) return 0;
  const confidence = toConfidenceScore(citations);
  const evidenceCoverage = Math.min(1, citations.length / 5);
  return Number((confidence * 0.7 + evidenceCoverage * 0.3).toFixed(3));
}

function citationsHeaderValue(citations: ChatCitation[]) {
  const compact = citations.slice(0, 4).map((citation) => ({
    sourceId: citation.sourceId,
    platform: citation.platform,
    title: citation.title,
    similarity: citation.similarity,
    rerankScore: citation.rerankScore,
  }));
  return Buffer.from(JSON.stringify(compact), 'utf8').toString('base64url');
}

function maskPII(text: string): string {
  return text
    .replace(/\b(?:\d[ -]*?){13,16}\b/g, '[REDACTED_CARD]')
    .replace(/\b\d{3}[-.]?\d{2}[-.]?\d{4}\b/g, '[REDACTED_SSN]')
    .replace(/(password|pwd|passcode)\s*[:=]\s*([^\s]+)/gi, '$1: [REDACTED]');
}

/**
 * AI Chat API: 'Ask Your Memory' - PRODUCTION REAL-WORLD ONLY
 */
export async function POST(request: Request) {
  try {
    const { message, history } = (await request.json()) as ChatRequestBody;
    if (!message) return NextResponse.json({ error: 'No query provided' }, { status: 400 });
    const streamRequested = isStreamRequested(request);

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch cognitive context in parallel with embedding generation
    const cognitiveContextPromise = fetchCognitiveContext(supabase as unknown as import('@supabase/supabase-js').SupabaseClient, user.id);

    // 1. Generate real-world embedding (via abstraction)
    const retrievalStartedAt = Date.now();
    const queryResult = await invokeModel({
      capability: 'embed',
      messages: [{ role: 'user', content: message }]
    });
    
    let context = '';
    let citations: ChatCitation[] = [];
    let retrievalError: string | null = null;

    if (queryResult && typeof queryResult === 'object' && 'embedding' in queryResult) {
      // 2. Real Hybrid Similarity Search
      const { data: matches, error: matchError } = await supabase.rpc('hybrid_search', {
        query_text: message,
        query_embedding: queryResult.embedding,
        match_count: 15,
        user_id_arg: user.id
      });

      if (matchError) {
        retrievalError = matchError.message;
      } else if (matches && (matches as HybridSearchRow[]).length > 0) {
        const rerankedRows = (matches as HybridSearchRow[])
          .sort((a, b) => b.combined_score - a.combined_score)
          .slice(0, 8);

        citations = rerankedRows.map((match, index) => ({
          sourceId: index + 1,
          memoryId: match.id,
          platform: match.platform ?? 'unknown',
          title: match.title ?? null,
          eventType: match.event_type ?? null,
          author: match.author ?? null,
          timestamp: match.timestamp ?? null,
          similarity: Number((match.similarity ?? 0).toFixed(4)),
          rerankScore: Number((match.combined_score ?? 0).toFixed(4)),
          snippet: maskPII((match.content || '').slice(0, 420)),
        }));

        context = citations
          .map((citation) => {
            const platform = citation.platform.toUpperCase();
            const date = citation.timestamp ? new Date(citation.timestamp).toLocaleDateString() : 'Unknown Date';
            return `[MEMORY ${citation.sourceId}] [${platform}] [${date}]\n${citation.snippet}`;
          })
          .join('\n\n---\n\n');
      }

      // 2.5: Intent-Based commitment retrieval (If asking about tasks/work)
      const isTaskQuery = /work|task|pending|commitment|promise|deadline/i.test(message);
      if (isTaskQuery) {
        const { data: latestAudit } = await supabase
          .from('reputation_audits')
          .select('metadata')
          .eq('user_id', user.id)
          .eq('status', 'completed')
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (latestAudit?.metadata?.commitments) {
          const commitments = (latestAudit.metadata.commitments as Array<{ platform: string, date: string, text: string }>)
            .map((c, i) => `[PENDING WORK ${i + 1}] [${c.platform.toUpperCase()}] [${new Date(c.date).toLocaleDateString()}]\n${c.text}`)
            .join('\n\n');
          
          if (commitments) {
            context = `ALREADY EXTRACTED COMMITMENTS:\n${commitments}\n\nRELEVANT MEMORIES:\n${context}`;
          }
        }
      }
    }

    const cognitiveContext = await cognitiveContextPromise;

    const diagnostics: ChatDiagnostics = {
      contextCount: citations.length,
      retrievalLatencyMs: Date.now() - retrievalStartedAt,
      confidenceScore: toConfidenceScore(citations),
      groundedScore: toGroundedScore(citations),
      rerankApplied: citations.length > 1,
      retrievalStatus: retrievalError ? 'error' : (citations.length > 0 ? 'success' : 'empty'),
      retrievalError,
    };

    const hasContext = context.trim().length > 0;

    const systemPrompt = `You are EYES — a personal intelligence layer that surfaces information and behavioral patterns from the user's synced digital archive.

STRICT RULES — follow these exactly:
1. ONLY answer from the CONTEXT records provided below. Do not use general knowledge or make things up.
2. If the context is empty OR the records are not relevant to the question, say ONLY: "I don't have any records matching that in your synced archive. This could mean the data hasn't been synced yet, or it doesn't exist in your connected platforms." Do NOT show unrelated records.
3. NEVER tell the user to manually check a website, app, or inbox. EYES is the interface — not a redirect service.
4. NEVER output [MEMORY X], [GMAIL], [GITHUB], [Unknown Date] or any other internal tags. These are internal labels — strip them completely from your response.
5. Speak directly and concisely. Match the format to the question — short answers for simple questions, structured for complex ones.
6. Use **bold** only to highlight a single key fact (a name, date, or number). Do not overformat.
7. When the user's cognitive state, active loops, or drift are known and RELEVANT to the question, briefly reference them. Otherwise ignore them.
${cognitiveContext ? `\nCOGNITIVE CONTEXT (user's current behavioral state — use when relevant):\n${cognitiveContext}\n` : ''}
${hasContext ? `CONTEXT FROM ARCHIVE (internal — do NOT repeat these tags in your response):\n${context}` : 'CONTEXT: No matching records found in the user\'s archive.'}`.trim();

    const messages: ChatHistoryMessage[] = [
      { role: 'system', content: systemPrompt },
      ...normalizeHistory(history),
      { role: 'user', content: message }
    ];

    if (streamRequested) {
      const stream = await invokeModelStream({
        capability: 'chat',
        messages,
        system: systemPrompt,
        preference: 'auto'
      });
      const citationsHeader = citations.length > 0 ? citationsHeaderValue(citations) : '';
      return new Response(stream, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'X-Context-Used': (citations.length > 0).toString(),
          'X-Context-Count': diagnostics.contextCount.toString(),
          'X-Retrieval-Status': diagnostics.retrievalStatus,
          'X-Grounded-Score': diagnostics.groundedScore.toString(),
          ...(citationsHeader ? { 'X-Citations': citationsHeader } : {}),
        },
      });
    }

    const answer = await invokeModel({
      capability: 'chat',
      messages,
      system: systemPrompt,
      preference: 'auto'
    });
    return NextResponse.json({
      answer: answer || 'I was unable to generate a neural response based on your memories.',
      contextUsed: citations.length > 0,
      citations,
      diagnostics,
      timestamp: new Date().toISOString(),
    });

  } catch (err) {
    console.error('[Chat API] PRODUCTION FAILURE:', err);
    return NextResponse.json({ error: 'Real-world neural execution failed.' }, { status: 500 });
  }
}
