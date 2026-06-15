import { createClient } from '@/utils/supabase/server';
import crypto from 'crypto';

/**
 * AI Gateway — Unified Production Interface (K1 + K2)
 *
 * K1: Zero provider SDKs. Every call goes through LITELLM_BASE_URL via one
 *     OpenAI-compatible fetch client.
 * K2: Only the four gateway aliases appear in code — never literal model strings.
 * K3: MOCK_MODE=true returns realistic fixtures so the product runs without keys.
 */

// ── Gateway config (K1) ─────────────────────────────────────────────────────
const GATEWAY_BASE = (process.env.LITELLM_BASE_URL || '').replace(/\/$/, '');
const GATEWAY_KEY = process.env.EYES_GATEWAY_KEY || process.env.LITELLM_KEY || '';

// ── Four gateway aliases (K2) ────────────────────────────────────────────────
const ALIAS_CHAT = 'auto-chat';
const ALIAS_EXTRACT = 'auto-extract';
const ALIAS_CLASSIFY = 'auto-classify';
const ALIAS_EMBED = 'auto-embed';

// ── Mock mode (K3) ───────────────────────────────────────────────────────────
const MOCK_MODE = process.env.MOCK_MODE === 'true';

// ── No fallbacks permitted (K1) ────────────────────────────────────────────────
// All calls route via the gateway.
const EMBED_DIMS = 1536; // Updated to 1536 for auto-embed OpenAI compatible

function pickRandom<T>(arr: T[]): T | null {
  return arr.length === 0 ? null : arr[Math.floor(Math.random() * arr.length)];
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// ── Per-model cooldown (in-process, resets on cold start) ────────────────────
const cooldowns = new Map<string, number>();
const COOLDOWN_MS = 300_000;
function isCooling(m: string): boolean {
  const t = cooldowns.get(m);
  if (!t) return false;
  if (Date.now() - t > COOLDOWN_MS) { cooldowns.delete(m); return false; }
  return true;
}
function markFailed(m: string): void { cooldowns.set(m, Date.now()); }

// ── Types ────────────────────────────────────────────────────────────────────
export type AIPreference = 'claude' | 'gemini' | 'auto';
export type AICapability = 'chat' | 'embed' | 'classify' | 'extract';

export interface AIHistoryMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface AIInvokeOptions {
  capability: AICapability;
  messages?: AIHistoryMessage[];
  system?: string;
  preference?: AIPreference;
  capture?: boolean;
  maxTokens?: number;
}

export type EmbedResult = { embedding: number[] };
export type InvokeResult = EmbedResult | string | null;

// ── K3 Mock fixtures ─────────────────────────────────────────────────────────
const MOCK_CHAT_FIXTURE = `Based on your digital history, there is a **contradiction** regarding the one-pager:

1. **The Commitment**: On March 14, you received an email from John (\`john@investornet.com\`) requesting your team's one-pager "by the end of the month" [gmail_8842].
2. **The Contradiction / Missing follow-through**: On April 2, you had a follow-up meeting on your Calendar ([cal_9120]) titled "Investor Network Meeting". However, there is no record in your sent emails of the one-pager being delivered prior to this meeting.
3. **Connecting the Dots**: We found a GitHub Pull Request ([gh_1122]) merged on March 20 where the one-pager draft was updated by your developer, but it was never emailed to John.

Would you like me to draft an email to John with the merged one-pager attached?`;

const MOCK_PLANNER_FIXTURE = JSON.stringify({
  queries: [{ q: 'sample query', sources: null, date_from: null, date_to: null, entities: null }],
  need_insights: false,
  is_note: false,
});

const MOCK_EMBED_FIXTURE: number[] = Array.from({ length: EMBED_DIMS }, (_, i) => Math.sin(i) * 0.01);

function mockResponse(capability: AICapability, system: string, messages: AIHistoryMessage[] = []): InvokeResult {
  if (capability === 'embed') return { embedding: MOCK_EMBED_FIXTURE };
  // Planner / classify calls return JSON
  if (system.includes('retrieval intent') || system.includes('classify') || /json only/i.test(system)) {
    return MOCK_PLANNER_FIXTURE;
  }

  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')?.content || '';
  const query = lastUserMsg.toLowerCase();

  if (query.includes('draft') || query.includes('yes') || query.includes('send') || query.includes('reply')) {
    return `Here is the drafted email to John:

**Subject:** Re: Investor Network Introduction & One-Pager

Hi John,

Thanks for the follow-up meeting on April 2nd. I apologize for the delay on this. Please find our team's latest updated one-pager attached (incorporating the changes from our GitHub update on March 20).

Let me know when you have time for a brief review.

Best,
[User]

*I have queued this draft in your Action Queue. You can approve it from the Connectors dashboard.*`;
  }

  if (query.includes('pr') || query.includes('github') || query.includes('pull request')) {
    return `The GitHub Pull Request [gh_1122] was titled "Update one-pager draft". It was merged by your developer on March 20th and included changes fixing typos and updating team bios in the one-pager document.`;
  }

  return MOCK_CHAT_FIXTURE;
}

// ── Gateway call (K1 — single OpenAI-compatible client) ──────────────────────
async function gatewayChat(
  alias: string,
  messages: { role: string; content: string }[],
  maxTokens = 1024,
): Promise<string | null> {
  if (!GATEWAY_BASE || !GATEWAY_KEY) return null;
  try {
    const res = await fetch(`${GATEWAY_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GATEWAY_KEY}`,
      },
      body: JSON.stringify({ model: alias, messages, max_tokens: maxTokens, temperature: 0.1 }),
    });
    if (!res.ok) {
      console.warn(`[AI Gateway] ${alias} returned ${res.status}`);
      return null;
    }
    const body = await res.json();
    return body?.choices?.[0]?.message?.content ?? null;
  } catch (err) {
    console.warn('[AI Gateway] fetch failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

async function gatewayEmbed(text: string): Promise<number[] | null> {
  if (!GATEWAY_BASE || !GATEWAY_KEY) return null;
  try {
    const res = await fetch(`${GATEWAY_BASE}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GATEWAY_KEY}`,
      },
      body: JSON.stringify({ model: ALIAS_EMBED, input: text.slice(0, 8000) }),
    });
    if (!res.ok) return null;
    const body = await res.json();
    return body?.data?.[0]?.embedding ?? null;
  } catch {
    return null;
  }
}

// ── Embedding (gateway ONLY) ────────────────────────────────
async function handleEmbedding(text: string): Promise<EmbedResult | null> {
  const gatewayResult = await gatewayEmbed(text);
  if (gatewayResult) return { embedding: gatewayResult };
  console.error('[AI] Gateway embedding failed.');
  return null;
}
// ── Chat (gateway ONLY) ─────────────────────────
async function handleChat(
  messages: AIHistoryMessage[],
  system: string,
  capability: AICapability,
  overrideMaxTokens?: number
): Promise<string | null> {
  const isClassify = capability === 'classify' ||
    /return.*json|json only|valid json/i.test(system);
  const maxTokens = overrideMaxTokens ?? (isClassify ? 500 : 1024);

  const alias = isClassify ? ALIAS_CLASSIFY : (capability === 'extract' ? ALIAS_EXTRACT : ALIAS_CHAT);
  const history = messages
    .filter(m => m.role !== 'system')
    .map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));
  const fullMessages = [
    ...(system?.trim() ? [{ role: 'system', content: system }] : []),
    ...history,
  ];

  // 1. Gateway (K1)
  const gatewayResult = await gatewayChat(alias, fullMessages, maxTokens);
  if (gatewayResult) { console.log(`[AI] Gateway (${alias}) OK`); return gatewayResult; }

  console.error('[AI] Gateway chat failed.');
  return null;
}

// ── Public interface ─────────────────────────────────────────────────────────
export async function invokeModel(options: AIInvokeOptions): Promise<InvokeResult> {
  const { capability, messages = [], system = '', preference: _pref = 'auto', capture = capability === 'chat' } = options;

  // K3: Mock mode
  if (MOCK_MODE) {
    console.log(`[AI] MOCK_MODE — returning fixture for ${capability}`);
    return mockResponse(capability, system, messages);
  }

  if (capability === 'embed') {
    return handleEmbedding(messages[0]?.content || '');
  }

  const startedAt = Date.now();
  const result = await handleChat(messages, system, capability, options.maxTokens);

  if (capture && result) {
    setTimeout(() => {
      captureBehavioralData({
        queryText: messages[messages.length - 1]?.content || '',
        queryType: capability,
        modelUsed: GATEWAY_BASE ? `gateway/${capability === 'classify' ? ALIAS_CLASSIFY : ALIAS_CHAT}` : 'fallback',
        latencyMs: Date.now() - startedAt,
        resultCount: messages.length,
        responseLength: result.length,
      }).catch(err => console.warn('[AI Behavioral] log failed:', err));
    }, 0);
  }

  return result;
}

// ── Streaming (gateway SSE ONLY) ──────────────
export async function invokeModelStream(options: AIInvokeOptions): Promise<ReadableStream> {
  const { messages = [], system = '' } = options;
  const encoder = new TextEncoder();

  if (MOCK_MODE) {
    const mockText = mockResponse('chat', system, messages) as string;
    return new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(mockText));
        controller.close();
      },
    });
  }

  const history = messages
    .filter(m => m.role !== 'system')
    .map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));
  const fullMessages = [
    ...(system?.trim() ? [{ role: 'system', content: system }] : []),
    ...history,
  ];

  // 1. Gateway stream
  if (GATEWAY_BASE && GATEWAY_KEY) {
    try {
      const res = await fetch(`${GATEWAY_BASE}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GATEWAY_KEY}` },
        body: JSON.stringify({ model: ALIAS_CHAT, messages: fullMessages, max_tokens: 1024, temperature: 0.1, stream: true }),
      });
      if (res.ok && res.body) {
        console.log('[AI Stream] Gateway streaming');
        return sseToReadable(res.body, encoder);
      }
    } catch (err) {
      console.warn('[AI Stream] Gateway stream failed:', err instanceof Error ? err.message : err);
    }
  }

  return new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode('\n\n[SYSTEM] Gateway unavailable.'));
      controller.close();
    },
  });
}

/** Parse SSE stream into a ReadableStream of text deltas */
function sseToReadable(body: ReadableStream<Uint8Array>, encoder: TextEncoder): ReadableStream {
  return new ReadableStream({
    async start(controller) {
      const reader = body.getReader();
      const decoder = new TextDecoder();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          for (const line of decoder.decode(value, { stream: true }).split('\n')) {
            const t = line.trim();
            if (!t.startsWith('data:')) continue;
            const d = t.slice(5).trim();
            if (d === '[DONE]') break;
            try {
              const delta = JSON.parse(d)?.choices?.[0]?.delta?.content;
              if (delta) controller.enqueue(encoder.encode(delta));
            } catch { /* malformed SSE */ }
          }
        }
      } catch (e) { console.warn('[AI SSE] read error:', e); }
      finally { controller.close(); }
    },
  });
}

// ── Legacy wrappers ──────────────────────────────────────────────────────────
export async function generateEmbedding(text: string) {
  return invokeModel({ capability: 'embed', messages: [{ role: 'user', content: text }] });
}

export async function chatCompletion(messages: AIHistoryMessage[]): Promise<string | null> {
  const result = await invokeModel({ capability: 'chat', messages });
  return typeof result === 'string' ? result : null;
}

export async function chatCompletionStream(messages: AIHistoryMessage[]) {
  return invokeModelStream({ capability: 'chat', messages });
}

// ── Behavioural logging ──────────────────────────────────────────────────────
async function captureBehavioralData(data: {
  queryText: string; queryType: string; modelUsed: string;
  latencyMs: number; resultCount: number; responseLength: number;
}) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profile } = await supabase
      .from('user_profiles').select('behavior_logging_consent')
      .eq('user_id', user.id).maybeSingle();
    if (profile?.behavior_logging_consent === false) return;

    const salt = process.env.BEHAVIOR_SALT;
    if (!salt && process.env.NODE_ENV === 'production') {
      console.warn('[AI Behavioral] BEHAVIOR_SALT not set.');
    }
    const userHash = crypto.createHash('sha256').update(user.id + (salt || 'eyes-salt')).digest('hex');

    const hour = new Date().getHours();
    const bucket = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : hour < 21 ? 'evening' : 'night';

    await supabase.from('query_behavior').insert({
      user_hash: userHash,
      query_text: data.queryText.slice(0, 50),
      query_type: data.queryType,
      model_used: data.modelUsed,
      latency_ms: data.latencyMs,
      result_count: data.resultCount,
      response_length: data.responseLength,
      sources_used: [],
      coarse_geography: 'unknown',
      coarse_time_bucket: bucket,
    });
  } catch (err) {
    console.warn('[AI Behavioral] Logging failed:', err);
  }
}
