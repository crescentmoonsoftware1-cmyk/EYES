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
    gateway: ReadinessCheck;
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

// K2: No literal model strings — probe via gateway alias (auto-chat) when available.
async function runGatewayProbe(): Promise<ReadinessCheck> {
  const base = (process.env.LITELLM_BASE_URL || '').replace(/\/$/, '');
  const key  = process.env.LITELLM_KEY || '';
  if (!base || !key) return { status: 'skip', latencyMs: 0, error: 'LITELLM_BASE_URL or LITELLM_KEY not set.' };
  const started = Date.now();
  try {
    const res = await withTimeout(
      fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({ model: 'auto-chat', messages: [{ role: 'user', content: 'hi' }], max_tokens: 1 }),
      }),
      4500,
    );
    if (!res.ok) {
      const body = await res.text();
      return { status: 'fail', latencyMs: Date.now() - started, error: `Gateway probe failed (${res.status}): ${body.slice(0, 160)}` };
    }
    return { status: 'pass', latencyMs: Date.now() - started };
  } catch (error) {
    return { status: 'fail', latencyMs: Date.now() - started, error: error instanceof Error ? error.message : String(error) };
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

  const gatewayCheck  = await runGatewayProbe();
  const supabaseCheck = await runSupabaseProbe(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  const anyAiPass = gatewayCheck.status === 'pass';
  let status: ReadinessStatus = 'online';
  let reason = 'AI gateway ready.';
  const provider = 'LiteLLM Gateway';
  let model = gatewayCheck.status === 'pass' ? 'auto-chat (gateway)' : 'offline';

  if (!anyAiPass) {
    status = 'offline';
    model = 'N/A';
    reason = 'AI core offline. Gateway failed.';
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
      gateway: gatewayCheck,
      supabase: supabaseCheck,
    },
    lastCheckedAt: new Date().toISOString(),
  };

  cachedResult = {
    payload,
    expiresAt: now + HEALTH_CACHE_TTL_MS,
  };

  return NextResponse.json(payload, { status: 200 });
}

