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
  // NOTE: hybrid_search RPC returns this column as 'event_timestamp' (not 'timestamp')
  // because 'timestamp' is a reserved word in PostgreSQL.
  event_timestamp: string | null;
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
  sourceUrl: string | null;
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
    memoryId: citation.memoryId,
    platform: citation.platform,
    title: citation.title,
    snippet: citation.snippet.slice(0, 120),
    similarity: citation.similarity,
    rerankScore: citation.rerankScore,
    timestamp: citation.timestamp,
    sourceUrl: citation.sourceUrl,
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

    // 0. Query routing / Caching classification
    let needsRetrieval = true;

    // Quick regex greeting/conversational check
    const lowerMessage = message.trim().toLowerCase();
    const isGreeting = /^(hi|hello|hey|yo|greetings|good\s+(morning|afternoon|evening)|howdy|hola|namaste)(\s+(eyes|there|sabar|assistant))?\s*[,.!?]*$/i.test(lowerMessage) || 
                       /^(how\s+are\s+you|what's\s+up|how's\s+it\s+going|sup)\s*[,.!?]*$/i.test(lowerMessage) ||
                       /^(thanks|thank\s+you|ok|okay|cool|awesome|great|perfect|yes|no|bye|goodbye)\s*[,.!?]*$/i.test(lowerMessage);

    if (isGreeting) {
      needsRetrieval = false;
      console.log(`[Chat] Query routing: Skipping database retrieval for greeting/conversational message: "${message}"`);
    } else if (history && history.length > 0) {
      try {
        const classificationRaw = await invokeModel({
          capability: 'chat',
          messages: [
            {
              role: 'system',
              content: `You are an AI query router. Analyze the user's latest message and conversation history. Determine if answering requires retrieving new/different matching records from their digital archive (emails, calendar, commits, notion, chats) or if it can be fully answered using ONLY the existing conversation history (such as greetings, simple follow-up analysis of already discussed items, or clarification requests).
Return JSON only:
{ "needsRetrieval": true | false }`
            },
            ...normalizeHistory(history).slice(-4),
            { role: 'user', content: message }
          ],
          preference: 'auto'
        });

        const classificationStr = typeof classificationRaw === 'string' ? classificationRaw : '';
        const match = classificationStr.match(/\{[\s\S]*\}/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          if (parsed && typeof parsed.needsRetrieval === 'boolean') {
            needsRetrieval = parsed.needsRetrieval;
          }
        }
      } catch (err) {
        console.warn('[Chat Routing] Classification failed, defaulting to database search:', err);
      }
    }

    // Fetch cognitive context AND (conditionally) audit commitments in parallel (only if retrieval is needed)
    const isTaskQuery = needsRetrieval && /work|task|pending|commitment|promise|deadline/i.test(message);
    const cognitiveContextPromise = needsRetrieval
      ? fetchCognitiveContext(supabase as unknown as import('@supabase/supabase-js').SupabaseClient, user.id)
      : Promise.resolve(null);
    const auditCommitmentsPromise = (needsRetrieval && isTaskQuery)
      ? supabase
          .from('reputation_audits')
          .select('metadata')
          .eq('user_id', user.id)
          .eq('status', 'completed')
          .order('created_at', { ascending: false })
          .limit(1)
          .single()
      : Promise.resolve({ data: null });

    const retrievalStartedAt = Date.now();
    let context = '';
    let citations: ChatCitation[] = [];
    let retrievalError: string | null = null;

    if (needsRetrieval) {
      // 1. Generate real-world embedding (via abstraction)
      const queryResult = await invokeModel({
        capability: 'embed',
        messages: [{ role: 'user', content: message }]
      });
      
      if (queryResult && typeof queryResult === 'object' && 'embedding' in queryResult) {
        console.log(`[Chat] Embedding OK — dim=${queryResult.embedding.length}, user=${user.id.slice(0,8)}`);
      // 2. Real Hybrid Similarity Search
      const { data: matches, error: matchError } = await supabase.rpc('hybrid_search', {
        query_text: message,
        query_embedding: queryResult.embedding,
        match_count: 15,
        user_id_arg: user.id
      });

      if (matchError) {
        retrievalError = matchError.message;
        console.warn(`[Chat] hybrid_search ERROR: ${matchError.message}`);
      } else if (matches && (matches as HybridSearchRow[]).length > 0) {
        console.log(`[Chat] hybrid_search returned ${(matches as HybridSearchRow[]).length} results`);

        const rerankedRows = (matches as HybridSearchRow[])
          .filter(m => (m.similarity ?? 0) > 0.18) // Drop low-relevance noise
          .sort((a, b) => b.combined_score - a.combined_score)
          .slice(0, 8);

        citations = rerankedRows.map((match, index) => ({
          sourceId: index + 1,
          memoryId: match.id,
          platform: match.platform ?? 'unknown',
          title: match.title ?? null,
          eventType: match.event_type ?? null,
          author: match.author ?? null,
          timestamp: match.event_timestamp ?? null,  // RPC returns event_timestamp (not timestamp)
          similarity: Number((match.similarity ?? 0).toFixed(4)),
          rerankScore: Number((match.combined_score ?? 0).toFixed(4)),
          snippet: maskPII((match.content || '').slice(0, 420)),
          sourceUrl: match.source_url ?? null,
        }));

        context = citations
          .map((citation) => {
            const platform = citation.platform.toUpperCase();
            const date = citation.timestamp ? new Date(citation.timestamp).toLocaleDateString() : 'Unknown Date';
            return `[MEMORY ${citation.sourceId}] [${platform}] [${date}]\n${citation.snippet}`;
          })
          .join('\n\n---\n\n');
      }

      // 2.5: Intent-Based commitment retrieval — resolved from parallel promise
      if (isTaskQuery) {
        const { data: latestAudit } = await auditCommitmentsPromise;

        if (latestAudit?.metadata?.commitments) {
          const commitments = (latestAudit.metadata.commitments as Array<{ platform: string, date: string, text: string }>)
            .map((c, i) => `[PENDING WORK ${i + 1}] [${c.platform.toUpperCase()}] [${new Date(c.date).toLocaleDateString()}]\n${c.text}`)
            .join('\n\n');
          
          if (commitments) {
            context = `ALREADY EXTRACTED COMMITMENTS:\n${commitments}\n\nRELEVANT MEMORIES:\n${context}`;
          }
        }
      }

      // 2.6: Temporal supplemental fetch — when user asks about "today", "yesterday", etc.
      // Semantic search doesn't understand dates, so we fetch recent records directly from DB.
      const temporalMatch = message.match(/\b(today|yesterday|this week|this morning|tonight|last night|last|latest|recent|past \d+ (days?|hours?))\b/i);

      // Detect platform intent from message phrasing
      const platformIntent = (() => {
        if (/\bemail|gmail|inbox|mail\b/i.test(message)) return 'gmail';
        if (/\bcalendar|meeting|event|schedule\b/i.test(message)) return 'google-calendar';
        if (/\bgithub|pr|pull request|commit|repo\b/i.test(message)) return 'github';
        if (/\bslack|channel|dm\b/i.test(message)) return 'slack';
        if (/\bnotion|page|doc\b/i.test(message)) return 'notion';
        return null;
      })();

      if (temporalMatch) {
        const now = new Date();
        let since: Date;
        const term = temporalMatch[1].toLowerCase();
        if (term === 'today' || term === 'this morning' || term === 'tonight') {
          since = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // midnight today
        } else if (term === 'yesterday' || term === 'last night') {
          since = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        } else if (term === 'this week' || term === 'last' || term === 'latest' || term === 'recent') {
          since = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
        } else {
          // "past N days/hours"
          const numMatch = term.match(/(\d+)/);
          const n = numMatch ? parseInt(numMatch[1]) : 1;
          since = term.includes('hour') ? new Date(now.getTime() - n * 3600000) : new Date(now.getTime() - n * 86400000);
        }

        let temporalQuery = supabase
          .from('memories')
          .select('id, platform, title, content, author, timestamp, source_url')
          .eq('user_id', user.id)
          .gte('timestamp', since.toISOString())
          .order('timestamp', { ascending: false })
          .limit(15);

        if (platformIntent) temporalQuery = temporalQuery.eq('platform', platformIntent);

        const { data: recentRecords } = await temporalQuery;

        if (recentRecords && recentRecords.length > 0) {
          // Deduplicate against existing citations
          const existingIds = new Set(citations.map(c => c.memoryId));
          const newRecords = recentRecords.filter(r => !existingIds.has(r.id));
          
          if (newRecords.length > 0) {
            const temporalContext = newRecords.map((r, i) => {
              const platform = (r.platform || 'unknown').toUpperCase();
              const date = r.timestamp ? new Date(r.timestamp).toLocaleDateString() : 'Unknown Date';
              const time = r.timestamp ? new Date(r.timestamp).toLocaleTimeString() : '';
              const snippet = maskPII(`${r.title || ''}: ${r.content || ''}`.slice(0, 420));
              return `[RECENT ${i + 1}] [${platform}] [${date} ${time}]\n${snippet}`;
            }).join('\n\n---\n\n');

            context = context
              ? `RECENT RECORDS (${term.toUpperCase()}):\n${temporalContext}\n\nSEMANTIC MATCHES:\n${context}`
              : `RECENT RECORDS (${term.toUpperCase()}):\n${temporalContext}`;
              
            const temporalCitations = newRecords.map((r) => ({
              sourceId: 0,
              memoryId: r.id,
              platform: r.platform || 'unknown',
              title: r.title || null,
              eventType: null,
              author: r.author || null,
              timestamp: r.timestamp || null,
              similarity: 1.0,
              rerankScore: 1.0,
              snippet: maskPII(`${r.title || ''}: ${r.content || ''}`.slice(0, 420)),
              sourceUrl: r.source_url ?? null,
            }));
            
            citations = [...temporalCitations, ...citations];
            citations.forEach((c, idx) => c.sourceId = idx + 1);
            
            console.log(`[Chat] Temporal fetch: ${newRecords.length} records since ${since.toISOString()} for '${term}'`);
          }
        } else {
          // ── Fallback: no records for the requested time window ──────────────
          // Fetch most recent records from the detected platform so the AI
          // can answer with actual data rather than "no records found".
          console.log(`[Chat] Temporal fetch returned 0 results for '${term}'. Falling back to most recent${platformIntent ? ` ${platformIntent}` : ''} records.`);

          let fallbackQuery = supabase
            .from('memories')
            .select('id, platform, title, content, author, timestamp, source_url')
            .eq('user_id', user.id)
            .order('timestamp', { ascending: false })
            .limit(10);

          if (platformIntent) fallbackQuery = fallbackQuery.eq('platform', platformIntent);

          const { data: fallbackRecords } = await fallbackQuery;

          if (fallbackRecords && fallbackRecords.length > 0) {
            const existingIds = new Set(citations.map(c => c.memoryId));
            const newFallback = fallbackRecords.filter(r => !existingIds.has(r.id));

            if (newFallback.length > 0) {
              const fallbackContext = newFallback.map((r, i) => {
                const platform = (r.platform || 'unknown').toUpperCase();
                const date = r.timestamp ? new Date(r.timestamp).toLocaleDateString() : 'Unknown Date';
                const time = r.timestamp ? new Date(r.timestamp).toLocaleTimeString() : '';
                const snippet = maskPII(`${r.title || ''}: ${r.content || ''}`.slice(0, 420));
                return `[FALLBACK ${i + 1}] [${platform}] [${date} ${time}]\n${snippet}`;
              }).join('\n\n---\n\n');

              const note = `NOTE: No records found specifically for "${term}". The following are the most recent ${platformIntent ?? 'available'} records in the archive — inform the user of this if relevant.`;
              context = context
                ? `${note}\n\nMOST RECENT RECORDS:\n${fallbackContext}\n\nSEMANTIC MATCHES:\n${context}`
                : `${note}\n\nMOST RECENT RECORDS:\n${fallbackContext}`;

              const fallbackCitations = newFallback.map(r => ({
                sourceId: 0,
                memoryId: r.id,
                platform: r.platform || 'unknown',
                title: r.title || null,
                eventType: null,
                author: r.author || null,
                timestamp: r.timestamp || null,
                similarity: 0.8,
                rerankScore: 0.8,
                snippet: maskPII(`${r.title || ''}: ${r.content || ''}`.slice(0, 420)),
                sourceUrl: r.source_url ?? null,
              }));

              citations = [...fallbackCitations, ...citations];
              citations.forEach((c, idx) => c.sourceId = idx + 1);
            }
          }
        }
      }
    }
  } else {
    console.log(`[Chat] Query routing: Skipping database retrieval for conversational message: "${message.slice(0, 50)}..."`);
  }

    const cognitiveContext = await cognitiveContextPromise;

    const diagnostics: ChatDiagnostics = {
      contextCount: citations.length,
      retrievalLatencyMs: Date.now() - retrievalStartedAt,
      confidenceScore: toConfidenceScore(citations),
      groundedScore: toGroundedScore(citations),
      rerankApplied: citations.length > 1,
      retrievalStatus: retrievalError ? 'error' : (citations.length > 0 ? 'success' : (needsRetrieval ? 'empty' : 'skipped')),
      retrievalError,
    };

    const hasArchiveContext = context.trim().length > 0;
    const hasCognitiveContext = cognitiveContext !== null && cognitiveContext.trim().length > 0;
    const hasAnyContext = hasArchiveContext || hasCognitiveContext;

    const todayStr = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const systemPrompt = `You are EYES — a personal intelligence layer and cognitive analyst that surfaces information and behavioral patterns from the user's synced digital archive.

CURRENT DATE: ${todayStr}

STRICT RULES — follow these exactly:
1. SYNTHESIZE AND ANALYZE: Do not just act like a dumb search engine. If the user asks a subjective or behavioral question (e.g., "Why am I happy today?", "Why do I like Fridays?"), use the CONTEXT provided below combined with your deep psychological reasoning to hypothesize an answer. 
2. NO ROBOTIC FALLBACKS: If the CONTEXT doesn't contain a direct, factual answer, DO NOT say "I don't see any evidence of this." Instead, say "You haven't explicitly written about this, but looking at your digital trace..." and then infer an answer based on their overall habits, schedules, or lack thereof.
3. NEVER tell the user to manually check a website, app, or inbox. EYES is the interface — not a redirect service.
4. NEVER output [MEMORY X], [GMAIL], [GITHUB], [Unknown Date], [RECENT X] or any other internal tags. These are internal labels — strip them completely from your response.
5. Speak directly and concisely. Match the format to the question — short answers for simple questions, structured for complex ones.
6. Use **bold** only to highlight a single key fact. Do not overformat.
7. DISTINGUISH between actual emails (person-to-person) and platform notification emails.

${hasCognitiveContext ? `\nCOGNITIVE CONTEXT (user's current behavioral state — use to answer questions about behavior, loops, or state):\n${cognitiveContext}\n` : ''}
${hasArchiveContext ? `\nCONTEXT FROM ARCHIVE (internal — do NOT repeat these tags in your response):\n${context}` : '\nCONTEXT FROM ARCHIVE: No matching records found.'}`.trim();

    const messages: ChatHistoryMessage[] = [
      { role: 'system', content: systemPrompt },
      ...normalizeHistory(history),
      { role: 'user', content: message }
    ];

    if (streamRequested) {
      if (message.trim().toLowerCase() === 'test') {
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode(
              "Here is a test of the new Markdown UI:\n\n" +
              "### 📊 Activity Overview\n" +
              "| Metric | Value | Status |\n" +
              "|---|---|---|\n" +
              "| Syncs | 12 | ✅ |\n" +
              "| Errors | 0 | ✅ |\n\n" +
              "Here is a Python code block:\n" +
              "```python\n" +
              "def hello_world():\n" +
              "    print('Hello, Markdown UI!')\n" +
              "```\n\n" +
              "- Clean layout\n" +
              "- Beautiful typography\n\n" +
              "**Bold Text** and *Italics* work perfectly!"
            ));
            controller.close();
          }
        });
        return new Response(stream, {
          status: 200,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      }

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
