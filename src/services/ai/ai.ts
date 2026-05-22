import { GoogleGenerativeAI, TaskType } from "@google/generative-ai";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from '@/utils/supabase/server';
import crypto from 'crypto';

/**
 * AI Brain Core: Unified Production Interface
 * All model invocations must route through the unified 'invokeModel' interface.
 */

// Paste your Anthropic API key in .env.local as ANTHROPIC_API_KEY=...
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const anthropic = ANTHROPIC_API_KEY ? new Anthropic({ apiKey: ANTHROPIC_API_KEY }) : null;
let anthropicEnabled = Boolean(ANTHROPIC_API_KEY && ANTHROPIC_API_KEY.startsWith('sk-ant-'));

// OpenRouter — primary chat provider (free models, OpenAI-compatible)
// Paste your OpenRouter API key in .env.local as OPENROUTER_API_KEY=...
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
// Free model rotation — all :free models require NO credit balance on OpenRouter.
// Model list sourced live from OpenRouter /api/v1/models (May 2026).
// The list is tried in order; 404/429 models are skipped automatically.
const OPENROUTER_FREE_MODELS = [
  'deepseek/deepseek-v4-flash:free',           // DeepSeek V4 Flash — fast & reliable
  'google/gemma-4-27b-it:free',                // Gemma 4 27B — Google free
  'google/gemma-4-31b-it:free',                // Gemma 4 31B — Google free (larger)
  'nvidia/nemotron-3-super-120b-a12b:free',    // Nvidia 120B — strong free model
  'minimax/minimax-m2.5:free',                 // MiniMax M2.5 — reliable free
  'meta-llama/llama-3.3-70b-instruct:free',   // Llama 3.3 70B — backup
  'openrouter/free',                            // Last resort: OpenRouter auto-selects any free model
];

// Paste your Gemini API key in .env.local as GEMINI_API_KEY=...
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || ''; 
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// Gemini — sole embedding provider (gemini-embedding-001, free tier, 1024 dims)

const CLAUDE_MODEL = "claude-3-5-sonnet-20240620";
const GEMINI_CHAT_MODEL = "gemini-2.0-flash"; // Stable Gemini 2.0 Flash model
const EMBED_MODEL = "gemini-embedding-001";
const EMBED_DIMS = 1024; // Must match vector(1024) column — voyage-context-3 native, Gemini via outputDimensionality

export type AIPreference = 'claude' | 'gemini' | 'auto';
export type AICapability = 'chat' | 'embed' | 'classify';

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
}

export type EmbedResult = { embedding: number[] };
export type InvokeResult = EmbedResult | string | null;

/** Gemini generateContent config shape — avoids `any` on contentConfig */
interface GeminiContentConfig {
  contents: Array<{ role: string; parts: Array<{ text: string }> }>;
  systemInstruction?: string;
}

/** OpenRouter message part — text or non-text */
interface OpenRouterPart {
  type: string;
  text?: string;
}

/**
 * Unified Model Invocation Interface - REAL WORLD ONLY (NO DEMO)
 */
export async function invokeModel(options: AIInvokeOptions): Promise<InvokeResult> {
  const { capability, messages = [], system = "", preference = 'auto', capture = true } = options;

  if (capability === 'embed') {
    return handleEmbedding(messages[0]?.content || "");
  }

  if (capability === 'chat' || capability === 'classify') {
    const startedAt = Date.now();
    const result = await handleChat(messages, system, preference);
    
    if (capture && result) {
      // Background logging (optimized)
      setTimeout(() => {
        captureBehavioralData({
          queryText: messages[messages.length - 1]?.content || "",
          queryType: capability,
          modelUsed: preference === 'auto' ? 'claude' : (preference || 'claude'),
          latencyMs: Date.now() - startedAt,
          resultCount: messages.length,
          responseLength: result?.length || 0
        }).catch(err => console.warn('[AI Behavioral] Background log failed:', err));
      }, 0);
    }

    return result;
  }

  throw new Error(`AI Capability ${capability} not supported.`);
}

/**
 * Internal: Handle 1024d Embeddings
 * Uses Gemini embedding-001 exclusively (free tier, 1024 dims).
 * Cohere and Voyage removed — Gemini alone is sufficient for this workload.
 */
async function handleEmbedding(text: string) {
  const input = text.slice(0, 8000);

  if (!GEMINI_API_KEY) {
    console.error('[AI] GEMINI_API_KEY is not set — cannot generate embeddings.');
    return null;
  }

  try {
    const model = genAI.getGenerativeModel({ model: EMBED_MODEL });
    const result = await model.embedContent({
      content: { role: 'user', parts: [{ text: input }] },
      taskType: TaskType.RETRIEVAL_QUERY,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      outputDimensionality: EMBED_DIMS,
    } as Parameters<typeof model.embedContent>[0]);
    console.log('[AI] Gemini embedding OK');
    return { embedding: Array.from(result.embedding.values) };
  } catch (err: unknown) {
    console.error('[AI] Gemini embedding failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Internal: Handle Chat
 * Priority: 1) OpenRouter (primary, free)  2) Claude (when credits available)  3) Gemini Flash (last resort)
 */
async function handleChat(messages: AIHistoryMessage[], system: string, preference: AIPreference) {
  const isClassification = system.includes('commitment') || system.includes('classify') || system.includes('extract') || system.includes('json');
  
  const history = messages
    .filter(m => m.role !== 'system')
    .map(m => ({ 
      role: m.role === 'assistant' ? 'assistant' as const : 'user' as const, 
      content: m.content 
    }));

  // ── 1. OpenRouter (PRIMARY) ─────────────────────────────────────────────────
  if (OPENROUTER_API_KEY) {
    for (const orModel of OPENROUTER_FREE_MODELS) {
      try {
        const openRouterMessages = [
          ...(system && system.trim() ? [{ role: 'system', content: system }] : []),
          ...history,
        ];
        const res = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
            'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
            'X-Title': 'EYES Neural Memory OS',
          },
          body: JSON.stringify({
            model: orModel,
            messages: openRouterMessages,
            max_tokens: isClassification ? 500 : 1024,
            temperature: 0.1,
          }),
        });
        if (res.ok) {
          const body = await res.json();
          const message = body?.choices?.[0]?.message;
          let text = '';

          if (typeof message?.content === 'string') {
            text = message.content;
          } else if (Array.isArray(message?.content)) {
            // Standard array-of-parts format
            text = (message.content as OpenRouterPart[]).filter(p => p.type === 'text').map(p => p.text ?? '').join('');
          } else if (message?.multi_modal_data?.multi_modal_parts) {
            // Non-standard multimodal format (e.g. DeepSeek on OpenRouter)
            text = (message.multi_modal_data.multi_modal_parts as OpenRouterPart[])
              .filter(p => p.type === 'text')
              .map(p => p.text ?? '')
              .join('');
          }

          if (text) {
            console.log(`[AI] OpenRouter responded (${orModel})`);
            return text;
          }
          console.warn(`[AI] OpenRouter ${orModel} returned empty content, trying next model...`);
        } else if (res.status === 429) {
          // Honour the upstream retry-after and try next model
          const errBody = await res.json().catch(() => ({}));
          const retryAfter = errBody?.error?.metadata?.retry_after_seconds || 0;
          console.warn(`[AI] OpenRouter model ${orModel} rate-limited (retry in ${retryAfter}s), trying next model...`);
          if (retryAfter > 0 && retryAfter < 30) await new Promise(r => setTimeout(r, retryAfter * 1000));
          continue; // try next model in rotation
        } else {
          console.warn(`[AI] OpenRouter ${orModel} non-OK (${res.status}), trying next model...`);
          continue; // 404/503/etc — model unavailable, try next in rotation
        }
      } catch (err: unknown) {
        console.warn(`[AI] OpenRouter ${orModel} failed:`, err instanceof Error ? err.message : err);
      }
    }
  }

  // ── 2. Claude (SECONDARY — unchanged, activates when credits are restored) ──
  const targetProvider = (preference === 'auto' || preference === 'claude') ? 'claude' : 'gemini';

  if (targetProvider === 'claude' && anthropicEnabled && anthropic) {
    try {
      const response = await anthropic.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: isClassification ? 500 : 1024,
        temperature: 0,
        system: system,
        messages: history,
      });

      const contentBlock = response.content[0];
      if (contentBlock && contentBlock.type === 'text') return contentBlock.text;
    } catch (err: unknown) {
      // If Anthropic reports billing/credit errors, disable it for the runtime to avoid noisy failures
      const errObj = err as Record<string, unknown>;
      const msg = String(
        (errObj?.['error'] as Record<string, unknown>)?.['message'] ??
        (err instanceof Error ? err.message : err)
      );
      if (/credit|balance|billing|quota/i.test(msg)) {
        anthropicEnabled = false;
        console.warn('[AI Abstraction] Disabling Anthropic (billing/credit issue):', msg);
      } else {
        console.warn('[AI Abstraction] Claude failed, falling back to Gemini:', msg);
      }
    }
  }

  // ── 3. Gemini Flash (LAST RESORT) ───────────────────────────────────────────
  try {
    const model = genAI.getGenerativeModel({ model: GEMINI_CHAT_MODEL });
    const contentConfig: GeminiContentConfig = {
      contents: history.map(h => ({
        role: h.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: h.content }],
      })),
    };
    // Only set systemInstruction if non-empty (Gemini API requirement)
    if (system && system.trim()) {
      contentConfig.systemInstruction = system;
    }
    const result = await model.generateContent(contentConfig);
    return result.response.text();
  } catch (err) {
    console.error('[AI Abstraction] All real-world models failed in handleChat:', err);
    return null; // Return null to indicate failure (No Demo)
  }
}

/**
 * Streaming version of the unified interface
 */
export async function invokeModelStream(options: AIInvokeOptions): Promise<ReadableStream> {
  const { messages = [], system = "", preference: _preference = 'auto' } = options;
  const encoder = new TextEncoder();

  const history = messages
    .filter(m => m.role !== 'system')
    .map(m => ({ 
      role: m.role === 'assistant' ? 'assistant' as const : 'user' as const, 
      content: m.content 
    }));

  // ── 1. OpenRouter Stream (PRIMARY) ──────────────────────────────────────────
  if (OPENROUTER_API_KEY) {
    for (const orModel of OPENROUTER_FREE_MODELS) {
      try {
        const openRouterMessages = [
          ...(system && system.trim() ? [{ role: 'system', content: system }] : []),
          ...history,
        ];
        const res = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
            'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
            'X-Title': 'EYES Neural Memory OS',
          },
          body: JSON.stringify({
            model: orModel,
            messages: openRouterMessages,
            max_tokens: 1024,
            temperature: 0.1,
            stream: true,
          }),
        });

        if (res.ok && res.body) {
          console.log(`[AI Stream] OpenRouter streaming (${orModel})`);
          return new ReadableStream({
            async start(controller) {
              const reader = res.body!.getReader();
              const decoder = new TextDecoder();
              try {
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  const chunk = decoder.decode(value, { stream: true });
                  for (const line of chunk.split('\n')) {
                    const trimmed = line.trim();
                    if (!trimmed.startsWith('data:')) continue;
                    const data = trimmed.slice(5).trim();
                    if (data === '[DONE]') break;
                    try {
                      const parsed = JSON.parse(data);
                      const delta = parsed?.choices?.[0]?.delta?.content;
                      if (delta) controller.enqueue(encoder.encode(delta));
                    } catch { /* skip malformed SSE lines */ }
                  }
                }
              } catch (streamErr: unknown) {
                console.warn(`[AI Stream] OpenRouter ${orModel} stream error:`, streamErr instanceof Error ? streamErr.message : streamErr);
              } finally {
                controller.close();
              }
            }
          });
        } else if (res.status === 429) {
          // Honour upstream retry-after delay, try next model
          const errBody = await res.json().catch(() => ({}));
          const retryAfter = errBody?.error?.metadata?.retry_after_seconds || 0;
          console.warn(`[AI Stream] OpenRouter ${orModel} rate-limited (retry in ${retryAfter}s), trying next model...`);
          if (retryAfter > 0 && retryAfter < 30) await new Promise(r => setTimeout(r, retryAfter * 1000));
          continue;
        } else {
          console.warn(`[AI Stream] OpenRouter ${orModel} non-OK (${res.status}), trying next model...`);
          continue; // 404/503/etc — model unavailable, try next in rotation
        }
      } catch (err: unknown) {
        console.warn(`[AI Stream] OpenRouter ${orModel} fetch failed:`, err instanceof Error ? err.message : err);
      }
    }
  }

  // ── 2. Claude Stream (SECONDARY — unchanged) ────────────────────────────────
  if (anthropicEnabled && anthropic) {
    try {
      const stream = await anthropic.messages.stream({
        model: CLAUDE_MODEL,
        max_tokens: 1024,
        temperature: 0.1,
        system: system,
        messages: history,
      });

      return new ReadableStream({
        async start(controller) {
          let wroteAnything = false;
          try {
            for await (const chunk of stream) {
              if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
                controller.enqueue(encoder.encode(chunk.delta.text));
                wroteAnything = true;
              }
            }
          } catch (e: unknown) {
            console.warn('[AI Stream] Claude loop error, falling back to Gemini:', e instanceof Error ? e.message : e);
            // If Claude failed mid-stream (e.g. 400 credit error), pipe Gemini output instead
            if (!wroteAnything) {
              try {
                const gModel = genAI.getGenerativeModel({ model: GEMINI_CHAT_MODEL });
                const cfg: GeminiContentConfig = {
                  contents: history.map(h => ({ role: h.role === 'assistant' ? 'model' : 'user', parts: [{ text: h.content }] })),
                };
                if (system && system.trim()) cfg.systemInstruction = system;
                const result = await gModel.generateContent(cfg);
                controller.enqueue(encoder.encode(result.response.text()));
              } catch (geminiErr) {
                console.error('[AI Stream] Gemini fallback also failed:', geminiErr);
              }
            }
          } finally {
            controller.close();
          }
        }
      });
    } catch (err: unknown) {
      console.warn(`[AI Stream] Claude stream init failed, using Gemini:`, err instanceof Error ? err.message : err);
    }
  }

  // Gemini Fallback Stream
  return new ReadableStream({
    async start(controller) {
      try {
        const model = genAI.getGenerativeModel({ model: GEMINI_CHAT_MODEL });
        const contentConfig: GeminiContentConfig = {
          contents: history.map(h => ({ role: h.role === 'assistant' ? 'model' : 'user', parts: [{ text: h.content }] })),
        };
        if (system && system.trim()) {
          contentConfig.systemInstruction = system;
        }
        const result = await model.generateContent(contentConfig);
        controller.enqueue(encoder.encode(result.response.text()));
      } catch (err) {
        console.error('[AI Stream] Gemini fallback failed:', err);
        // Enqueue a visible error so the chat bubble shows something instead of blank
        controller.enqueue(encoder.encode(
          'I\'m having trouble connecting to my AI providers right now. ' +
          'Please check that GEMINI_API_KEY, OPENROUTER_API_KEY, or ANTHROPIC_API_KEY ' +
          'is set in your Vercel environment variables and try again.'
        ));
      } finally {
        controller.close();
      }
    }
  });
}

/**
 * Legacy Compatibility Wrappers
 */
export async function generateEmbedding(text: string) {
  return invokeModel({ capability: 'embed', messages: [{ role: 'user', content: text }] });
}

export async function chatCompletion(messages: AIHistoryMessage[]) {
  return invokeModel({ capability: 'chat', messages });
}

export async function chatCompletionStream(messages: AIHistoryMessage[]) {
  return invokeModelStream({ capability: 'chat', messages });
}

/**
 * Section 07.Decision 2: Anonymized Behavioral Logging
 */
async function captureBehavioralData(data: {
  queryText: string;
  queryType: string;
  modelUsed: string;
  latencyMs: number;
  resultCount: number;
  responseLength: number;
}) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // GDPR Requirement: SHA-256 of user_id + salt
    const salt = process.env.BEHAVIOR_SALT || 'eyes-neural-moat';
    const userHash = crypto.createHash('sha256').update(user.id + salt).digest('hex');

    await supabase.from('query_behavior').insert({
      user_hash: userHash,
      query_text: data.queryText,
      query_type: data.queryType,
      model_used: data.modelUsed,
      latency_ms: data.latencyMs,
      result_count: data.resultCount,
      response_length: data.responseLength,
      sources_used: [], 
      coarse_geography: 'unknown',
      coarse_time_bucket: getTimeBucket()
    });
  } catch (err) {
    console.warn('[AI Behavioral] Logging failed:', err);
  }
}

function getTimeBucket(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}
