import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { invokeModel, invokeModelStream } from '@/services/ai/ai';

// Vercel function timeout — must be <= plan limit (Pro = 300s, Hobby = 10s)
export const maxDuration = 60;

// ── Constants ────────────────────────────────────────────────────────────────
/** Minimum cosine similarity to include a memory record in evidence (0–1 scale). */
const SIMILARITY_THRESHOLD = 0.18;
/** Maximum allowed message length in characters — prevents token-bomb attacks. */
const MAX_MESSAGE_LENGTH = 8_000;

// ── Types ─────────────────────────────────────────────────────────────────────
type Role = 'user' | 'assistant' | 'system';
type Msg  = { role: Role; content: string };

type PlannerResult = {
  search_queries: string[];
  keyword_filters: string[];
  connectors: Array<'gmail' | 'github' | 'slack' | 'notion' | 'all'>;
  time_window_days: number | null;
  semantic_weight: number;
  intent: 'lookup' | 'pattern' | 'contradiction' | 'open_reflection';
  needs_history: boolean;
};

type EyesCitation = {
  recordId: string;
  memoryId: string;
  platform: string;
  title: string | null;
  timestamp: string | null;
  snippet: string;
  sourceUrl: string | null;
  sourceId?: number;
};

type MemoryRow = {
  id: string;
  platform: string;
  title: string | null;
  content: string;
  author: string | null;
  source_url: string | null;
  event_timestamp: string | null;
  similarity: number;
  combined_score: number;
};

type FtsMemoryRow = {
  id: string;
  platform: string;
  source_id: string;
  event_type: string;
  title: string | null;
  content: string | null;
  author: string | null;
  source_url: string | null;
  timestamp: string | null;
  metadata: unknown;
  is_flagged: boolean;
};

// ── Section 4.5 — Retrieval Planner prompt ────────────────────────────────────
function buildPlannerPrompt(
  turn: string,
  summary: string,
  today: string,
): string {
  return `Given the user's message and the rolling conversation summary, output ONLY a JSON object describing the retrieval plan. No prose, no markdown fences.
Today's date: ${today}
Conversation summary: ${summary || 'No prior context.'}
User turn: ${turn}

Schema:
{
  "search_queries": [ "semantic query string", ... ],
  "keyword_filters": [ "exact term", ... ],
  "connectors": [ "gmail" | "github" | "slack" | "notion" | "all" ],
  "time_window_days": integer or null,
  "semantic_weight": float 0.0-1.0,
  "intent": "lookup" | "pattern" | "contradiction" | "open_reflection",
  "needs_history": boolean
}

Rules:
1. Choose semantic_weight high for conceptual questions, low for exact-term lookups.
2. Set intent to 'pattern' or 'contradiction' when the user is asking about themselves over time — these require wider retrieval.
3. Set needs_history true when the message refers back to the current conversation.`;
}

// ── Section 4.4 — EYES Conversational Core persona ───────────────────────────
function buildSystemPrompt(
  userName: string,
  userRole: string | null,
  userGoals: string[],
  userPersona: string | null,
  connectedSources: string[],
  evidence: string,
  insights: string,
  summary: string,
  today: string,
  userMessage: string,
  graph: string,
): string {
  const evidenceBlock = [
    evidence ? `EVIDENCE:\n${evidence}` : 'EVIDENCE: No matching records found in your connected sources.',
    graph ? `KNOWLEDGE GRAPH:\n${graph}` : ''
  ].filter(Boolean).join('\n\n');

  return `You are EYES — an intelligence that has read everything this person has ever said across their connected accounts. You are not a search engine and not a generic assistant. You are the one entity that remembers their digital life in full and reflects it back to them with honesty.

GROUNDING — absolute rule. Every factual claim you make about this person must come from a retrieved record in the evidence provided. Never invent a memory, a date, a quote, or a pattern. If the evidence does not support a claim, you do not make it. If you have no relevant evidence, say so plainly and ask, rather than guessing. Every factual statement carries its citation.

CONTRADICTION — your signature. When the evidence shows the person's words and actions diverge — they said one thing and did another, or say something repeatedly and never act — name it directly but without cruelty. You are the friend who tells the truth, not the assistant who flatters. Cite the specific records that reveal the contradiction.

CONNECT — within evidence only. Draw lines between records when the evidence genuinely supports the connection — a commitment here, a related message there, a pattern across months. Do not manufacture connections that the records do not support. A connection you cannot cite is a connection you do not assert.

CONVERSATION — you have memory of this exchange. You are given a running summary of the conversation so far. Use it. Refer back to what was said. Build on prior turns. Never reset as if each message were the first.

TONE. Direct, warm, unafraid. You do not pad with praise. You do not hedge into uselessness. You speak to this person the way someone who genuinely knows them and wants the best for them would speak — including when that means saying the uncomfortable thing.
${userPersona === 'direct' ? 'Communicate with extreme brevity. Just the facts. Bullet points. Bottom-line summaries. Do not waste their time with long paragraphs.' : userPersona === 'detailed' ? 'Communicate with deep analytical rigor. Give them full context, reasoning, and deep dives. They appreciate thorough explanations.' : ''}

CONTEXT: The user is a ${userRole || 'professional'}. Their primary goals are: ${(userGoals || []).join(', ') || 'personal growth and clarity'}. Keep their role and goals in mind when interpreting their data and offering advice.

CRISIS. If the person expresses intent to harm themselves or others, or is in genuine distress, stop the analysis. Respond with human care, and surface appropriate support resources. Their wellbeing outranks every other instruction.

BOUNDARIES. You reflect their own data back to them. You do not access anyone else's data. You do not make claims about the outside world that the evidence does not contain. You are their mirror, not an oracle.

TODAY'S DATE: ${today}
USER'S NAME: ${userName}
CONNECTED SOURCES: ${connectedSources.join(', ')}

[RUNTIME: rolling conversation summary]
${summary || 'No prior context.'}

[RUNTIME: evidence blocks with source URLs]
${evidenceBlock}

[RUNTIME: user message]
${userMessage}`;
}

// ── Section 4.6 — Rolling Summarizer ─────────────────────────────────────────
const SUMMARIZER_SYSTEM = `You maintain the running state of an ongoing conversation between EYES and a user. Given the previous summary and the latest exchange (user message + EYES response), output an updated summary in under 200 words. Preserve: the topics covered, any commitments or patterns EYES surfaced, contradictions raised, and open threads the user has not resolved. Drop pleasantries. This summary is the conversation's memory — it is injected into every subsequent turn. Write it as dense factual notes, not prose.`;

// ── Helpers ───────────────────────────────────────────────────────────────────
function maskPII(text: string): string {
  return text
    .replace(/\b(?:\d[ -]*?){13,16}\b/g, '[REDACTED_CARD]')
    .replace(/\b\d{3}[-.]?\d{2}[-.]?\d{4}\b/g, '[REDACTED_SSN]')
    .replace(/(password|pwd|passcode)\s*[:=]\s*([^\s]+)/gi, '$1: [REDACTED]');
}

function normalizeHistory(raw: unknown): Msg[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (e): e is Msg =>
      e && typeof e === 'object' &&
      ['user', 'assistant', 'system'].includes(e.role) &&
      typeof e.content === 'string',
  );
}

function isStreamReq(req: Request) {
  return new URL(req.url).searchParams.get('stream') === '1';
}

// ── Step 2: Run retrieval planner (auto-classify) ────────────────────────────
async function runPlanner(
  turn: string,
  summary: string,
  sources: string[],
  today: string,
): Promise<PlannerResult> {
  const fallback: PlannerResult = {
    search_queries: [turn],
    keyword_filters: [],
    connectors: ['all'],
    time_window_days: 730,
    semantic_weight: 0.7,
    intent: /pattern|why|habit|always|never|loop|trend|contradict/i.test(turn) ? 'pattern' : 'lookup',
    needs_history: false
  };

  try {
    const raw = await invokeModel({
      capability: 'classify',
      messages: [{ role: 'user', content: buildPlannerPrompt(turn, summary, today) }],
      system: 'You are a retrieval planner. Return JSON only.',
      capture: false,
    });
    if (typeof raw !== 'string') return fallback;
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return fallback;
    const parsed = JSON.parse(match[0]) as PlannerResult;
    return parsed.search_queries !== undefined ? parsed : fallback;
  } catch {
    return fallback;
  }
}

// ── Steps 3–4: Retrieve and assemble evidence (≤7000 tokens) ─────────────────
async function retrieveEvidence(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  plan: PlannerResult,
  userTurn: string,
): Promise<{ evidence: string; citations: EyesCitation[]; insightsText: string; graphText: string }> {
  if (process.env.MOCK_MODE === 'true') {
    const mockCitations: EyesCitation[] = [
      {
        sourceId: 1,
        recordId: 'gmail_8842',
        memoryId: 'gmail_8842_mock',
        platform: 'gmail',
        title: 'Re: Investor Network Introduction & One-Pager',
        timestamp: '2026-03-14T10:00:00Z',
        snippet: 'Hi, thank you for the introduction. Can you please send over your team\'s one-pager by the end of the month? Looking forward to review.',
        sourceUrl: 'https://mail.google.com/mail/u/0/#inbox/gmail_8842',
      },
      {
        sourceId: 2,
        recordId: 'cal_9120',
        memoryId: 'cal_9120_mock',
        platform: 'google-calendar',
        title: 'Investor Network Meeting',
        timestamp: '2026-04-02T15:00:00Z',
        snippet: 'Follow-up meeting to discuss the one-pager and investor network introduction.',
        sourceUrl: 'https://calendar.google.com/calendar/r/eventedit/cal_9120',
      },
      {
        sourceId: 3,
        recordId: 'gh_1122',
        memoryId: 'gh_1122_mock',
        platform: 'github',
        title: 'Update one-pager draft',
        timestamp: '2026-03-20T14:30:00Z',
        snippet: 'Fixed typos and updated team bios in the project one-pager document.',
        sourceUrl: 'https://github.com/company/repo/pull/1',
      }
    ];

    const evidence = mockCitations.map(c => `[${c.recordId}] [${c.platform.toUpperCase()}] [${new Date(c.timestamp!).toLocaleDateString()}]\n${c.snippet}`).join('\n\n---\n\n');
    return {
      evidence,
      citations: mockCitations,
      insightsText: '[INSIGHT:REPUTATION] Commitment inconsistency detected: requested one-pager has no matching email attachment or delivery record prior to follow-up.',
      graphText: ''
    };
  }

  const citations: EyesCitation[] = [];
  const evidenceParts: string[] = [];
  let insightsText = '';
  let graphText = '';

  // Calculate start_date if time_window_days is provided
  let start_date: string | undefined = undefined;
  if (typeof plan.time_window_days === 'number') {
    start_date = new Date(Date.now() - plan.time_window_days * 24 * 60 * 60 * 1000).toISOString();
  }

  // Widen match count for pattern/contradiction queries
  const isWide = plan.intent === 'pattern' || plan.intent === 'contradiction';
  const matchCount = isWide ? 20 : 10;

  // Run embedding for the first query (primary search intent) & fetch insights in parallel
  const primaryQ = plan.search_queries?.[0] || userTurn;
  const needsInsights = plan.intent === 'pattern' || plan.intent === 'contradiction';
  
  let embedding: number[] | null = null;
  
  const [embedResult, insightsResult, graphResult] = await Promise.all([
    invokeModel({
      capability: 'embed',
      messages: [{ role: 'user', content: primaryQ }],
      capture: false,
    }).catch(err => {
      console.warn('[Chat] Embedding generation failed/throttled:', err);
      return null;
    }),
    needsInsights 
      ? supabase
          .from('insights')
          .select('kind, title, body, citations, strength')
          .eq('user_id', userId)
          .eq('is_current', true)
          .order('strength', { ascending: false })
          .limit(5)
      : Promise.resolve({ data: null }),
    supabase
      .from('chronic_edges')
      .select('head_node_id, relation_label, tail_node_id, is_contradicted_by')
      .eq('user_id', userId)
      .is('valid_to', null)
      .limit(30)
  ]);

  if (embedResult && typeof embedResult === 'object' && 'embedding' in embedResult) {
    embedding = embedResult.embedding;
  }
  
  if (insightsResult && insightsResult.data && insightsResult.data.length > 0) {
    insightsText = insightsResult.data.map((r: { kind: string; title: string; body: string; citations: string[]; strength: number }) =>
      `[INSIGHT:${r.kind.toUpperCase()}] ${r.title}\n${r.body}\nCitations: ${(r.citations || []).join(', ')}`
    ).join('\n\n');
  }

  // Parse Graph Edges
  if (graphResult && graphResult.data && graphResult.data.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    graphText = graphResult.data.map((e: any) => `[${e.head_node_id.replace(/_/g, ' ')}] ${e.relation_label} [${e.tail_node_id.replace(/_/g, ' ')}]`).join('\n');
  }

  const queries = plan.search_queries && plan.search_queries.length > 0
    ? plan.search_queries.slice(0, 4)
    : [userTurn];

  const allowedConnectors = (plan.connectors || ['all']).map(c => c.toLowerCase());
  const filterByConnector = !allowedConnectors.includes('all');

  // Concurrently execute database search for each query
  const queryPromises = queries.map(async (q) => {
    let rows: MemoryRow[] | null = null;
    let hasHighQualityEmbeddingMatches = false;

    if (embedding) {
      const { data, error } = await supabase.rpc('hybrid_search', {
        query_text: q,
        query_embedding: embedding,
        match_count: matchCount,
        user_id_arg: userId,
        start_date: start_date,
      });
      if (error) {
        console.warn('[Chat] hybrid_search error:', error.message);
      } else if (data && data.length > 0) {
        rows = data;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        hasHighQualityEmbeddingMatches = data.some((r: any) => (r.similarity ?? 0) > SIMILARITY_THRESHOLD);
      }
    }

    // Fallback FTS/Keyword
    if (!rows || rows.length === 0 || !hasHighQualityEmbeddingMatches) {
      const ftsQuery = q.trim().split(/\s+/).filter(Boolean).join(' & ');
      let ftsData: FtsMemoryRow[] | null = null;
      
      if (ftsQuery) {
        let ftsBuilder = supabase
          .from('memories')
          .select('id, platform, source_id, event_type, title, content, author, source_url, timestamp, metadata, is_flagged')
          .eq('user_id', userId)
          .textSearch('fts', ftsQuery, { config: 'english' });

        if (start_date) {
          ftsBuilder = ftsBuilder.gte('timestamp', start_date);
        }

        const { data, error } = await ftsBuilder.limit(matchCount);
        if (!error && data && data.length > 0) {
          ftsData = data;
        }
      }
      
      if (!ftsData || ftsData.length === 0) {
        const safeQ = q.replace(/[,()]/g, ' ');
        let queryBuilder = supabase
          .from('memories')
          .select('id, platform, source_id, event_type, title, content, author, source_url, timestamp, metadata, is_flagged')
          .eq('user_id', userId)
          .or(`title.ilike.%${safeQ}%,content.ilike.%${safeQ}%`);

        if (start_date) {
          queryBuilder = queryBuilder.gte('timestamp', start_date);
        }

        const { data, error } = await queryBuilder.limit(matchCount);
        if (!error && data) {
          ftsData = data;
        }
      }
      
      if (ftsData) {
        rows = ftsData.map((r) => ({
          ...r,
          event_timestamp: r.timestamp,
          similarity: 0.5,
          combined_score: 1.0,
          title: r.title,
          content: r.content || '',
          author: r.author,
          source_url: r.source_url,
        }));
      }
    }

    return rows || [];
  });

  const allQueryResults = await Promise.all(queryPromises);

  // Sequentially process the parallel results to deduplicate and assemble evidence/citations
  for (const rows of allQueryResults) {
    if (!rows) continue;

    const filtered = rows
      .filter(r => (r.similarity ?? 0) > SIMILARITY_THRESHOLD)
      .sort((a, b) => b.combined_score - a.combined_score);

    for (const r of filtered) {
      if (citations.some(c => c.memoryId === r.id)) continue; // dedupe
      
      // Filter by connector if applicable (always allow eyes_chat)
      if (filterByConnector && r.platform.toLowerCase() !== 'eyes_chat' && !allowedConnectors.includes(r.platform.toLowerCase())) {
        continue;
      }

      const date = r.event_timestamp ? new Date(r.event_timestamp).toLocaleDateString() : 'unknown date';
      const snippet = maskPII((r.content || '').slice(0, 420));
      const recordId = `${r.platform.toLowerCase()}_${r.id.slice(0, 6)}`;
      evidenceParts.push(`[${recordId}] [${r.platform.toUpperCase()}] [${date}]\n${snippet}`);
      
      const nextSourceId = citations.length + 1;
      citations.push({
        sourceId: nextSourceId,
        recordId,
        memoryId: r.id,
        platform: r.platform,
        title: r.title,
        timestamp: r.event_timestamp,
        snippet,
        sourceUrl: r.source_url,
      });
    }
  }

  // Token cap: ~7000 input tokens ≈ 28000 chars
  const evidence = evidenceParts.join('\n\n---\n\n').slice(0, 28000);
  return { evidence, citations, insightsText, graphText };
}

// EyesCitation is declared at top of file — see line 5 block

// ── Step 7: Update rolling summary (background, non-blocking) ─────────────────
async function updateSummary(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  threadId: string | null,
  prevSummary: string,
  userTurn: string,
  assistantReply: string,
): Promise<void> {
  try {
    const raw = await invokeModel({
      capability: 'classify',
      messages: [
        { role: 'user', content: `Previous summary:\n${prevSummary}\n\nNewest exchange:\nUSER: ${userTurn}\nEYES: ${assistantReply}` },
      ],
      system: SUMMARIZER_SYSTEM,
      capture: false,
    });
    const newSummary = typeof raw === 'string' ? raw.slice(0, 1500) : prevSummary;
    if (!threadId) return;
    await supabase.from('chat_threads').update({ summary: newSummary }).eq('id', threadId);
  } catch (err) {
    console.warn('[Chat] Summary update failed:', err);
  }
}

// ── Note storage (Section 04 — "Take notes") ─────────────────────────────────
async function storeNote(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  text: string,
): Promise<string> {
  const noteId = `note_${Date.now().toString(36)}`;
  try {
    const embedResult = await invokeModel({
      capability: 'embed',
      messages: [{ role: 'user', content: text }],
      capture: false,
    });
    const embedding = embedResult && typeof embedResult === 'object' && 'embedding' in embedResult
      ? embedResult.embedding : null;

    await supabase.from('memories').insert({
      user_id: userId,
      platform: 'note',
      source_id: noteId,
      event_type: 'journal',
      title: text.slice(0, 80),
      content: text,
      timestamp: new Date().toISOString(),
      embedding: embedding ? JSON.stringify(embedding) : null,
      metadata: { source: 'note', created_via: 'chat' },
    });
  } catch (err) {
    console.warn('[Chat] Note storage failed:', err);
  }
  return noteId;
}

const CHAT_TIMEOUT_MS = 60_000;

async function handleChat(request: Request): Promise<Response> {
  try {
    const body = await request.json();
    const message: string = (body.message || '').slice(0, MAX_MESSAGE_LENGTH);
    const history: unknown = body.history;
    const threadId: string | null = body.threadId || null;
    const prevSummary: string = body.summary || '';

    if (!message.trim()) return NextResponse.json({ error: 'No message provided' }, { status: 400 });
    if (body.message && body.message.length > MAX_MESSAGE_LENGTH) {
      console.warn(`[Chat] Message truncated from ${body.message.length} to ${MAX_MESSAGE_LENGTH} chars.`);
    }

    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const historyMsgs = normalizeHistory(history).slice(-8); // last 4 turns

    // ── Fetch connected sources & user profile in parallel ───────────────
    const [tokensResult, profileResult] = await Promise.all([
      supabase.from('oauth_tokens').select('platform').eq('user_id', user.id),
      supabase.from('user_profiles').select('display_name, role, goals, persona').eq('user_id', user.id).maybeSingle()
    ]);

    const connectedSources = [...new Set((tokensResult.data || []).map((t: { platform: string }) => t.platform))];
    const userName: string = profileResult.data?.display_name || 'you';
    const userRole: string | null = profileResult.data?.role || null;
    const userGoals: string[] = profileResult.data?.goals || [];
    const userPersona: string | null = profileResult.data?.persona || null;

    // ── Step 2: Planner (auto-classify) ──────────────────────────────────────
    const plan = await runPlanner(message, prevSummary, connectedSources, today);

    // ── Handle note storage (Section 04 — is_note) ───────────────────────────
    const isNote = /^(note:|journal:|remember:)/i.test(message.trim());
    if (isNote) {
      const noteId = await storeNote(supabase, user.id, message.replace(/^(note:|journal:|remember:)\s*/i, '').trim());
      const noteAck = `Noted, sir. I've saved that note.`;

      // Update summary in background
      setTimeout(() => {
        updateSummary(supabase, user.id, threadId, prevSummary, message, noteAck).catch(() => {});
      }, 0);

      if (isStreamReq(request)) {
        const encoder = new TextEncoder();
        return new Response(
          new ReadableStream({ start(c) { c.enqueue(encoder.encode(noteAck)); c.close(); } }),
          { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Note-Id': noteId } },
        );
      }
      return NextResponse.json({ answer: noteAck, noteId, citations: [] });
    }

    // ── Steps 3–4: Retrieve and assemble evidence ─────────────────────────────
    const { evidence, citations, insightsText, graphText } = await retrieveEvidence(supabase, user.id, plan, message);

    // ── Step 5: EYES persona system prompt ────────────────────────────────────
    const systemPrompt = buildSystemPrompt(
      userName, userRole, userGoals, userPersona, connectedSources, evidence, insightsText, prevSummary, today, message, graphText
    );

    const fullMessages: Msg[] = [
      ...historyMsgs,
      { role: 'user', content: message },
    ];

    // ── Citation header for client ────────────────────────────────────────────
    const citationHeader = citations.length > 0
      ? Buffer.from(JSON.stringify(citations.slice(0, 5)), 'utf8').toString('base64url')
      : '';

    const needInsights = plan.intent === 'pattern' || plan.intent === 'contradiction';
    const commonHeaders: Record<string, string> = {
      'X-Citations': citationHeader,
      'X-Context-Used': (citations.length > 0).toString(),
      'X-Context-Count': citations.length.toString(),
      'X-Retrieval-Status': 'success',
      'X-Grounded-Score': (citations.length > 0 ? 0.95 : 0.0).toString(),
      'X-Plan-Queries': plan.search_queries.length.toString(),
      'X-Need-Insights': needInsights.toString(),
    };

    // ── Step 6: Render (streaming) ────────────────────────────────────────────
    if (isStreamReq(request)) {
      const stream = await invokeModelStream({
        capability: 'chat',
        messages: fullMessages,
        system: systemPrompt,
        preference: 'auto',
      });

      // Step 7: update summary after stream completes (best-effort, background)
      // We buffer the stream to get the reply text for summary, then re-stream
      // to the client without blocking. We use a TransformStream for this.
      let bufferedReply = '';
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const encoder = new TextEncoder();
      const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
      const writer = writable.getWriter();

      (async () => {
        const reader = stream.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            bufferedReply += new TextDecoder().decode(value);
            await writer.write(value);
          }
        } finally {
          await writer.close();
          // Step 7: non-blocking summary update
          setTimeout(() => {
            updateSummary(supabase, user.id, threadId, prevSummary, message, bufferedReply).catch(() => {});
          }, 0);
        }
      })();

      return new Response(readable, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no',
          ...commonHeaders
        },
      });
    }

    // ── Non-streaming path ────────────────────────────────────────────────────
    const raw = await invokeModel({
      capability: 'chat',
      messages: fullMessages,
      system: systemPrompt,
      preference: 'auto',
    });
    const answer = typeof raw === 'string' ? raw : 'No response generated.';

    // Step 7: update summary in background
    setTimeout(() => {
      updateSummary(supabase, user.id, threadId, prevSummary, message, answer).catch(() => {});
    }, 0);

    return NextResponse.json({
      answer,
      citations,
      contextUsed: citations.length > 0,
      diagnostics: {
        contextCount: citations.length,
        retrievalStatus: 'success',
        confidenceScore: citations.length > 0 ? 0.95 : 0.0,
      },
      timestamp: new Date().toISOString()
    }, {
      headers: commonHeaders
    });

  } catch (err) {
    console.error('[Chat API] Orchestration failed:', err);
    return NextResponse.json({ error: 'Chat failed. Please try again.' }, { status: 500 });
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────
export async function POST(request: Request) {
  const timeout = new Promise<Response>((_, reject) =>
    setTimeout(() => reject(new Error('Chat request timed out')), CHAT_TIMEOUT_MS)
  );
  try {
    return await Promise.race([handleChat(request), timeout]);
  } catch (err) {
    const isTimeout = err instanceof Error && err.message.includes('timed out');
    console.error('[Chat API] ' + (isTimeout ? 'Timeout' : 'Fatal error') + ':', err);
    return NextResponse.json(
      { error: isTimeout ? 'Request timed out. Please try again.' : 'Chat failed. Please try again.' },
      { status: isTimeout ? 504 : 500 }
    );
  }
}

