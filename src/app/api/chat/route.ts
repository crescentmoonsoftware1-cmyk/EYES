import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { generateEmbedding, chatCompletion, chatCompletionStream, invokeModel, invokeModelStream } from '@/services/ai/ai';

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
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  try {
    return new URL(request.url).origin;
  } catch {
    return 'http://localhost:3000';
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

    // 1. Generate real-world embedding (via abstraction)
    const retrievalStartedAt = Date.now();
    const queryResult = await invokeModel({
      capability: 'embed',
      messages: [{ role: 'user', content: message }]
    });
    
    let context = '';
    let citations: ChatCitation[] = [];
    let retrievalError: string | null = null;

    if (queryResult) {
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
          timestamp: match.event_timestamp ?? null,
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

    const diagnostics: ChatDiagnostics = {
      contextCount: citations.length,
      retrievalLatencyMs: Date.now() - retrievalStartedAt,
      confidenceScore: toConfidenceScore(citations),
      groundedScore: toGroundedScore(citations),
      rerankApplied: citations.length > 1,
      retrievalStatus: retrievalError ? 'error' : (citations.length > 0 ? 'success' : 'empty'),
      retrievalError,
    };

    const systemPrompt = `
      You are the EYES Neural Assistant. Use the following records to answer the user's question accurately.
      If the context is empty, inform the user that no relevant memories were found in their archive.
      
      CONTEXT:
      ${context || 'No relevant memory records found.'}
    `.trim();

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
