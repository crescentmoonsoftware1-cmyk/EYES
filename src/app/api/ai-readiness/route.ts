import { NextResponse } from 'next/server';

type ReadinessStatus = 'online' | 'degraded' | 'offline';

type CheckStatus = 'pass' | 'fail' | 'skip';

type ReadinessCheck = {
  status: CheckStatus;
  latencyMs: number;
  error?: string;
};

type ReadinessPayload = {
  status: ReadinessStatus;
  provider: string;
  model: string;
  reason: string;
  checks: {
    claudeChat: ReadinessCheck;
    geminiChat: ReadinessCheck;
    supabase: ReadinessCheck;
  };
  lastCheckedAt: string;
};

const HEALTH_CACHE_TTL_MS = 45_000;
let cachedResult: { expiresAt: number; payload: ReadinessPayload } | null = null;

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timeout);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timeout);
        reject(error);
      });
  });
}

async function runAnthropicChatProbe(apiKey: string | undefined): Promise<ReadinessCheck> {
  if (!apiKey || !apiKey.startsWith('sk-ant-')) {
    return { status: 'skip', latencyMs: 0, error: 'Missing or invalid ANTHROPIC_API_KEY.' };
  }

  const started = Date.now();
  try {
    const response = await withTimeout(
      fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20240620',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'hi' }],
        }),
      }),
      4500
    );

    if (!response.ok) {
      const body = await response.text();
      return {
        status: 'fail',
        latencyMs: Date.now() - started,
        error: `Anthropic probe failed (${response.status}): ${body.slice(0, 160)}`,
      };
    }

    return { status: 'pass', latencyMs: Date.now() - started };
  } catch (error) {
    return {
      status: 'fail',
      latencyMs: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runGeminiProbe(apiKey: string | undefined): Promise<ReadinessCheck> {
  if (!apiKey) {
    return { status: 'skip', latencyMs: 0, error: 'Missing GEMINI_API_KEY.' };
  }

  const started = Date.now();
  try {
    const response = await withTimeout(
      fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: 'hi' }] }] }),
      }),
      4000
    );

    if (!response.ok) {
      const body = await response.text();
      return {
        status: 'fail',
        latencyMs: Date.now() - started,
        error: `Gemini probe failed (${response.status}): ${body.slice(0, 160)}`,
      };
    }

    return { status: 'pass', latencyMs: Date.now() - started };
  } catch (error) {
    return {
      status: 'fail',
      latencyMs: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runSupabaseProbe(url: string | undefined, anonKey: string | undefined): Promise<ReadinessCheck> {
  if (!url || !anonKey) {
    return { status: 'skip', latencyMs: 0, error: 'Missing Supabase configuration.' };
  }

  const started = Date.now();
  try {
    const response = await withTimeout(
      fetch(`${url}/rest/v1/`, {
        method: 'GET',
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
        },
      }),
      2500
    );

    if ([200, 401, 404].includes(response.status)) {
      return { status: 'pass', latencyMs: Date.now() - started };
    }

    return {
      status: 'fail',
      latencyMs: Date.now() - started,
      error: `Supabase probe failed with status ${response.status}`,
    };
  } catch (error) {
    return {
      status: 'fail',
      latencyMs: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function GET() {
  const now = Date.now();
  if (cachedResult && cachedResult.expiresAt > now && process.env.NODE_ENV !== 'test') {
    return NextResponse.json(cachedResult.payload, { status: 200 });
  }

  const anthropicCheck = await runAnthropicChatProbe(process.env.ANTHROPIC_API_KEY);
  const geminiCheck = await runGeminiProbe(process.env.GEMINI_API_KEY);
  const supabaseCheck = await runSupabaseProbe(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  let status: ReadinessStatus = 'online';
  let reason = 'Neural AI Core ready (Hybrid).';
  const provider = 'Anthropic + Google';
  let model = 'Claude 3.5 + Gemini 1.5';

  if (anthropicCheck.status !== 'pass' && geminiCheck.status !== 'pass') {
    status = 'offline';
    model = 'N/A';
    reason = 'Neural AI Core offline. Both Anthropic and Gemini probes failed.';
  } else if (anthropicCheck.status !== 'pass' || geminiCheck.status !== 'pass') {
    status = 'degraded';
    reason = 'Neural AI Core degraded. One or more providers are unreachable.';
  }

  if (supabaseCheck.status === 'skip' || supabaseCheck.status === 'fail') {
    if (status === 'online') status = 'degraded';
    reason = (reason || '') + ' [Supabase disconnected]';
  }

  const payload: ReadinessPayload = {
    status,
    provider,
    model,
    reason,
    checks: {
      anthropicChat: anthropicCheck,
      geminiChat: geminiCheck,
      supabase: supabaseCheck,
    } as any,
    lastCheckedAt: new Date().toISOString(),
  };

  cachedResult = {
    payload,
    expiresAt: now + HEALTH_CACHE_TTL_MS,
  };

  return NextResponse.json(payload, { status: 200 });
}

