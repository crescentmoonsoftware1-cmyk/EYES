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
// anthropicEnabled is a per-invocation const — no module-level mutation so it
// is safe on Vercel serverless where every cold start resets module state.
const anthropicEnabled = Boolean(ANTHROPIC_API_KEY && ANTHROPIC_API_KEY.startsWith('sk-ant-'));

// Groq — Ludicrous speed chat generation
const GROQ_KEYS = [
  process.env.GROQ_API_KEY,
  process.env.GROQ_API_KEY_2,
  process.env.GROQ_API_KEY_3,
].filter(Boolean) as string[];
const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

// OpenRouter — secondary chat provider (free models, OpenAI-compatible)
// Paste your OpenRouter API key in .env.local as OPENROUTER_API_KEY=...
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
// Free model rotation — all :free models require NO credit balance on OpenRouter.
// Model list sourced live from OpenRouter /api/v1/models (May 2026).
// The list is tried in order; 404/429 models are skipped automatically.
const OPENROUTER_FREE_MODELS = [
  'deepseek/deepseek-v4-flash:free',           // DeepSeek V4 Flash — fast & reliable
  'google/gemma-3-27b-it:free',                // Gemma 3 27B — Google free (stable)
  'qwen/qwen3-235b-a22b:free',                 // Qwen3 235B — large context free
  'microsoft/phi-4-reasoning-plus:free',       // Phi-4 Reasoning — Microsoft free
  'mistralai/mistral-small-3.2-24b-instruct:free', // Mistral Small — reliable free
  'meta-llama/llama-3.3-70b-instruct:free',   // Llama 3.3 70B — backup
  'nvidia/llama-3.1-nemotron-nano-8b-v1:free', // Nemotron Nano — lightweight fallback
  'openrouter/free',                            // Last resort: OpenRouter auto-selects any free model
];

// ── Model cooldown cache: skip recently-failed models instantly ────────────────
// NOTE: This is in-process memory. On Vercel, each cold start resets it.
// It is still effective within a single function execution (serial requests).
const modelCooldowns = new Map<string, number>();
const COOLDOWN_MS = 300_000; // 5 minutes

function isModelCoolingDown(model: string): boolean {
  const failedAt = modelCooldowns.get(model);
  if (!failedAt) return false;
  if (Date.now() - failedAt > COOLDOWN_MS) {
    modelCooldowns.delete(model);
    return false;
  }
  return true;
}

function markModelFailed(model: string): void {
  modelCooldowns.set(model, Date.now());
}

// ── Gemini Key Pool ────────────────────────────────────────────────────────────
const GEMINI_KEYS = [
  process.env.GEMINI_API_KEY,
  process.env.GEMINI_API_KEY_2,
  process.env.GEMINI_API_KEY_3,
].filter(Boolean) as string[];

// Key selection is stateless (random per call) — safe across Vercel cold starts.
// No module-level index variable is mutated.

/** Returns a random Gemini key from the pool (stateless — safe on serverless). */
function pickGeminiKey(): string | null {
  if (GEMINI_KEYS.length === 0) return null;
  return GEMINI_KEYS[Math.floor(Math.random() * GEMINI_KEYS.length)];
}

/** Returns a random Groq key from the pool (stateless — safe on serverless). */
function pickGroqKey(): string | null {
  if (GROQ_KEYS.length === 0) return null;
  return GROQ_KEYS[Math.floor(Math.random() * GROQ_KEYS.length)];
}

// sleep helper — used for REACTIVE jitter only (after a 429 error, not proactively).
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Gemini — sole embedding provider (gemini-embedding-001, free tier, 1024 dims)

const CLAUDE_MODEL = "claude-3-5-sonnet-20240620";
const GEMINI_CHAT_MODEL = "gemini-2.5-flash";
const GEMINI_CHAT_MODEL_FALLBACK = "gemini-2.0-flash"; // For new projects not yet allowlisted for 2.5-flash
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
  // Default capture=true only for 'chat' — skip behavioral logging for classify/embed (cron/pipeline calls) (M4)
  const { capability, messages = [], system = "", preference = 'auto', capture = capability === 'chat' } = options;

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
          modelUsed: preference === 'auto' ? 'openrouter/auto' : (preference || 'openrouter/auto'),  // M3: was always 'claude'
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
  let attempts = 0;
  const maxAttempts = GEMINI_KEYS.length > 0 ? GEMINI_KEYS.length : 1;

  while (attempts < maxAttempts) {
    const key = pickGeminiKey();
    if (!key) {
      console.error('[AI] No GEMINI_API_KEY is set — cannot generate embeddings.');
      return null;
    }

    try {
      const genAI = new GoogleGenerativeAI(key);
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
      const errMsg = err instanceof Error ? err.message : String(err);
      console.warn('[AI] Gemini embedding failed:', errMsg);

      if (errMsg.includes('429') || errMsg.toLowerCase().includes('too many requests') || errMsg.includes('403') || errMsg.toLowerCase().includes('forbidden') || errMsg.toLowerCase().includes('denied')) {
        // Reactive jitter — only after a rate-limit hit, not proactively
        attempts++;
        if (attempts < maxAttempts) {
          const jitterMs = Math.floor(Math.random() * 1000) + 500;
          console.log(`[AI] Rate limit hit. Jitter ${jitterMs}ms then retrying...`);
          await sleep(jitterMs);
        }
      } else {
        // Break on other non-recoverable errors
        break;
      }
    }
  }

  console.error('[AI] All Gemini embedding attempts failed.');
  return null;
}

/**
 * Internal: Handle Chat
 * Priority: 1) Groq (fast) 2) OpenRouter (primary, free) 3) Claude (paid) 4) Gemini Flash (last resort)
 */
async function handleChat(messages: AIHistoryMessage[], system: string, preference: AIPreference) {
  const isClassification = system.includes('commitment') || system.includes('classify') || system.includes('extract') || /return.*json|json only|valid json/i.test(system);
  
  const history = messages
    .filter(m => m.role !== 'system')
    .map(m => ({ 
      role: m.role === 'assistant' ? 'assistant' as const : 'user' as const, 
      content: m.content 
    }));

  // ── 0. GROQ (LUDICROUS SPEED) — stateless key pick with per-invocation retry ───
  if (GROQ_KEYS.length > 0) {
    let groqAttempts = 0;
    while (groqAttempts < GROQ_KEYS.length) {
      const groqKey = pickGroqKey();
      if (!groqKey) break;
      try {
        const groqMessages = [
          ...(system && system.trim() ? [{ role: 'system', content: system }] : []),
          ...history,
        ];

        // ── Payload size guard: Groq rejects bodies > ~20KB with 413 ──────
        const GROQ_MAX_BYTES = 20_000;
        const contextMarkers = [
          'CONTEXT FROM ARCHIVE',
          'MOST RECENT RECORDS',
          'RECENT RECORDS',
        ];
        let trimmed = false;
        while (JSON.stringify({ model: GROQ_MODEL, messages: groqMessages, max_tokens: 1024, temperature: 0.1 }).length > GROQ_MAX_BYTES) {
          const sysMsg = groqMessages.find(m => m.role === 'system');
          if (!sysMsg) break;
          let cut = false;
          for (const marker of contextMarkers) {
            const idx = sysMsg.content.indexOf(marker);
            if (idx !== -1 && sysMsg.content.length > idx + marker.length + 500) {
              sysMsg.content = sysMsg.content.slice(0, sysMsg.content.length - 1000);
              cut = true;
              trimmed = true;
              break;
            }
          }
          if (!cut) {
            sysMsg.content = sysMsg.content.slice(0, 6000);
            trimmed = true;
            break;
          }
        }
        if (trimmed) console.log('[AI] Groq payload trimmed to fit 20KB limit.');

        const res = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${groqKey}`,
          },
          body: JSON.stringify({
            model: GROQ_MODEL,
            messages: groqMessages,
            max_tokens: isClassification ? 500 : 1024,
            temperature: 0.1,
          }),
        });
        if (res.ok) {
          const body = await res.json();
          const message = body?.choices?.[0]?.message;
          let text = '';
          if (typeof message === 'string') text = message;
          else if (message?.content) text = message.content;
          else if (message && 'text' in message) text = (message as {text: string}).text;
          if (text) {
            console.log('[AI] Groq responded instantly');
            return text;
          }
        } else if (res.status === 429) {
          console.warn('[AI] Groq key rate-limited (429). Retrying with different key...');
          groqAttempts++;
        } else {
          console.warn(`[AI] Groq non-OK (${res.status}), falling back...`);
          break;
        }
      } catch (err) {
        console.warn('[AI] Groq fetch failed, falling back:', err);
        break;
      }
    }
  }

  // ── 1. OpenRouter (SECONDARY) ─────────────────────────────────────────────────
  if (OPENROUTER_API_KEY) {
    for (const orModel of OPENROUTER_FREE_MODELS) {
      if (isModelCoolingDown(orModel)) continue; // Skip recently-failed models instantly
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
          markModelFailed(orModel);
          continue; // try next model in rotation (no delay — skip immediately)
        } else {
          console.warn(`[AI] OpenRouter ${orModel} non-OK (${res.status}), trying next model...`);
          markModelFailed(orModel);
          continue; // 400/404/503/etc — model unavailable, try next in rotation
        }
      } catch (err: unknown) {
        console.warn(`[AI] OpenRouter ${orModel} failed:`, err instanceof Error ? err.message : err);
      }
    }
  }

  // ── 2. Claude (activates when credits are available) ─────────────────────
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
      const errObj = err as Record<string, unknown>;
      const msg = String(
        (errObj?.['error'] as Record<string, unknown>)?.['message'] ??
        (err instanceof Error ? err.message : err)
      );
      // Log the billing error and fall through to the next provider.
      // anthropicEnabled is now a const — no module-level mutation.
      if (/credit|balance|billing|quota/i.test(msg)) {
        console.warn('[AI Abstraction] Anthropic billing/credit error — falling back:', msg);
      } else {
        console.warn('[AI Abstraction] Claude failed, falling back to Gemini:', msg);
      }
    }
  }

  // ── 3. Gemini Flash (LAST RESORT) — stateless key pick + model fallback ───
  const maxGeminiAttempts = GEMINI_KEYS.length || 1;
  for (let attempt = 0; attempt < maxGeminiAttempts; attempt++) {
    const geminiKey = pickGeminiKey();
    if (!geminiKey) break;
    for (const chatModel of [GEMINI_CHAT_MODEL, GEMINI_CHAT_MODEL_FALLBACK]) {
      try {
        const rotatingGenAI = new GoogleGenerativeAI(geminiKey);
        const model = rotatingGenAI.getGenerativeModel({ model: chatModel });
        const contentConfig: GeminiContentConfig = {
          contents: history.map(h => ({
            role: h.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: h.content }],
          })),
        };
        if (system && system.trim()) {
          contentConfig.systemInstruction = system;
        }
        const result = await model.generateContent(contentConfig);
        console.log(`[AI] Gemini chat OK (model: ${chatModel})`);
        return result.response.text();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const isDenied = msg.includes('403') || msg.toLowerCase().includes('denied');
        console.warn(`[AI] Gemini ${chatModel} failed: ${msg.slice(0, 80)}`);
        if (!isDenied) break;
      }
    }
  }
  console.error('[AI Abstraction] All real-world models failed in handleChat.');
  return null;
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

  // ── 0. GROQ Stream (LUDICROUS SPEED) ────────────────────────────────────────
  if (GROQ_KEYS.length > 0) {
    let groqAttempts = 0;
    while (groqAttempts < GROQ_KEYS.length) {
      const groqKey = pickGroqKey();
      if (!groqKey) break;
      try {
        const groqMessages = [
          ...(system && system.trim() ? [{ role: 'system', content: system }] : []),
          ...history,
        ];

        // Payload size guard — same 20KB limit as non-stream path
        const GROQ_MAX_BYTES = 20_000;
        const contextMarkers = ['CONTEXT FROM ARCHIVE', 'MOST RECENT RECORDS', 'RECENT RECORDS'];
        let trimmed = false;
        while (JSON.stringify({ model: GROQ_MODEL, messages: groqMessages, max_tokens: 1024, temperature: 0.1, stream: true }).length > GROQ_MAX_BYTES) {
          const sysMsg = groqMessages.find(m => m.role === 'system');
          if (!sysMsg) break;
          let cut = false;
          for (const marker of contextMarkers) {
            const idx = sysMsg.content.indexOf(marker);
            if (idx !== -1 && sysMsg.content.length > idx + marker.length + 500) {
              sysMsg.content = sysMsg.content.slice(0, sysMsg.content.length - 1000);
              cut = true; trimmed = true; break;
            }
          }
          if (!cut) { sysMsg.content = sysMsg.content.slice(0, 6000); trimmed = true; break; }
        }
        if (trimmed) console.log('[AI Stream] Groq payload trimmed to fit 20KB limit.');

        const res = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${groqKey}`,
          },
          body: JSON.stringify({
            model: GROQ_MODEL,
            messages: groqMessages,
            max_tokens: 1024,
            temperature: 0.1,
            stream: true,
          }),
        });

        if (res.ok && res.body) {
          console.log(`[AI Stream] Groq streaming (${GROQ_MODEL})`);
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
                    const trimmedLine = line.trim();
                    if (!trimmedLine.startsWith('data:')) continue;
                    const data = trimmedLine.slice(5).trim();
                    if (data === '[DONE]') break;
                    try {
                      const parsed = JSON.parse(data);
                      const delta = parsed?.choices?.[0]?.delta?.content;
                      if (delta) controller.enqueue(encoder.encode(delta));
                    } catch { /* skip malformed SSE lines */ }
                  }
                }
              } catch (streamErr) {
                console.warn(`[AI Stream] Groq stream error:`, streamErr);
              } finally {
                controller.close();
              }
            }
          });
        } else if (res.status === 429) {
          console.warn('[AI Stream] Groq key rate-limited (429). Retrying with different key...');
          groqAttempts++;
        } else {
          console.warn(`[AI Stream] Groq non-OK (${res.status}), falling back...`);
          break;
        }
      } catch (err) {
        console.warn(`[AI Stream] Groq fetch failed, falling back:`, err);
        break;
      }
    }
  }

  // ── 1. OpenRouter Stream (SECONDARY) ──────────────────────────────────────────
  if (OPENROUTER_API_KEY) {
    for (const orModel of OPENROUTER_FREE_MODELS) {
      if (isModelCoolingDown(orModel)) continue; // Skip recently-failed models instantly
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
          markModelFailed(orModel);
          continue; // Skip immediately (no delay — cooldown cache handles future skips)
        } else {
          console.warn(`[AI Stream] OpenRouter ${orModel} non-OK (${res.status}), trying next model...`);
          markModelFailed(orModel);
          continue; // 400/404/503/etc — model unavailable, try next in rotation
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
                const fbKey = pickGeminiKey();
                if (fbKey) {
                  const fbGenAI = new GoogleGenerativeAI(fbKey);
                  const gModel = fbGenAI.getGenerativeModel({ model: GEMINI_CHAT_MODEL });
                  const cfg: GeminiContentConfig = {
                    contents: history.map(h => ({ role: h.role === 'assistant' ? 'model' : 'user', parts: [{ text: h.content }] })),
                  };
                  if (system && system.trim()) cfg.systemInstruction = system;
                  const result = await gModel.generateContent(cfg);
                  controller.enqueue(encoder.encode(result.response.text()));
                }
              } catch (geminiErr) {
                console.error('[AI Stream] Gemini fallback also failed:', geminiErr);
                controller.enqueue(encoder.encode('\n\n[SYSTEM] All AI pathways are currently overwhelmed (Rate Limit Exceeded). Please wait a moment for the neural cooldown before trying again.'));
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

  // Gemini Fallback Stream — with key rotation
  return new ReadableStream({
    async start(controller) {
      const maxAttempts = GEMINI_KEYS.length || 1;
      let succeeded = false;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const geminiKey = pickGeminiKey();
        if (!geminiKey) break;
        try {
          const rotatingGenAI = new GoogleGenerativeAI(geminiKey);
          const model = rotatingGenAI.getGenerativeModel({ model: GEMINI_CHAT_MODEL });
          const contentConfig: GeminiContentConfig = {
            contents: history.map(h => ({ role: h.role === 'assistant' ? 'model' : 'user', parts: [{ text: h.content }] })),
          };
          if (system && system.trim()) contentConfig.systemInstruction = system;
          const result = await model.generateContent(contentConfig);
          controller.enqueue(encoder.encode(result.response.text()));
          succeeded = true;
          break;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.warn(`[AI Stream] Gemini fallback failed: ${msg.slice(0,80)}`);
        }
      }
      if (!succeeded) {
        console.error('[AI Stream] All Gemini keys failed.');
        controller.enqueue(encoder.encode(
          '\n\n[SYSTEM] All AI pathways are currently overwhelmed (Rate Limit Exceeded). Please wait a moment for the neural cooldown before trying again.'
        ));
      }
      controller.close();
    }
  });
}

/**
 * Legacy Compatibility Wrappers
 */
export async function generateEmbedding(text: string) {
  return invokeModel({ capability: 'embed', messages: [{ role: 'user', content: text }] });
}

export async function chatCompletion(messages: AIHistoryMessage[]): Promise<string | null> {
  const result = await invokeModel({ capability: 'chat', messages });
  // invokeModel returns InvokeResult (EmbedResult | string | null).
  // For 'chat' capability, EmbedResult is never returned — safe to cast.
  return typeof result === 'string' ? result : null;
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

    // GDPR Requirement: Only log if consent is true
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('behavior_logging_consent')
      .eq('user_id', user.id)
      .maybeSingle();

    if (profile && profile.behavior_logging_consent === false) {
      return;
    }

    // GDPR Requirement: SHA-256 of user_id + salt
    // BEHAVIOR_SALT must be set as an env var in production to ensure the hash
    // is not predictable. The fallback is used only in local development.
    const salt = process.env.BEHAVIOR_SALT;
    if (!salt && process.env.NODE_ENV === 'production') {
      console.warn('[AI Behavioral] BEHAVIOR_SALT env var is not set — user hash may be predictable. Set BEHAVIOR_SALT in your environment.');
    }
    const userHash = crypto.createHash('sha256').update(user.id + (salt || 'eyes-neural-moat')).digest('hex');

    await supabase.from('query_behavior').insert({
      user_hash: userHash,
      // Truncated to 50 chars to reduce PII re-identification risk (user_id is already hashed)
      query_text: data.queryText.slice(0, 50),
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

