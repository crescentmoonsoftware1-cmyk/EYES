/**
 * Embeddings sync service - used by cron and can be queued
 * Extracted from src/app/api/cron/sync/route.ts for Priority 3 optimization
 */

export type EmbeddingOutcome = {
  attempted: boolean;
  success: boolean;
  status: number | null;
  durationMs: number;
  error?: string;
};

const EMBEDDINGS_TIMEOUT_MS = Number(process.env.CRON_EMBEDDINGS_TIMEOUT_MS || 25000);

function parseResponsePayload(rawBody: string) {
  if (!rawBody) return null;

  try {
    return JSON.parse(rawBody);
  } catch {
    return { message: rawBody.slice(0, 300) };
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      cache: 'no-store',
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Run embeddings sync via HTTP
 * Called from sync/all/route.ts and cron/sync/route.ts
 */
export async function runEmbeddingsSyncViaHttp(
  baseUrl: string,
  userId: string,
  secret: string
): Promise<EmbeddingOutcome> {
  const startedAt = Date.now();

  try {
    const response = await fetchWithTimeout(
      `${baseUrl}/api/sync/embeddings`,
      {
        method: 'POST',
        headers: {
          'x-cron-secret': secret,
          'x-cron-user-id': userId,
        },
      },
      EMBEDDINGS_TIMEOUT_MS
    );

    const rawBody = await response.text();
    const body = parseResponsePayload(rawBody);

    if (!response.ok) {
      return {
        attempted: true,
        success: false,
        status: response.status,
        durationMs: Date.now() - startedAt,
        error: typeof body === 'object' && body && 'error' in body ? String(body.error) : `Embeddings sync failed (${response.status})`,
      };
    }

    return {
      attempted: true,
      success: true,
      status: response.status,
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      attempted: true,
      success: false,
      status: null,
      durationMs: Date.now() - startedAt,
      error: message,
    };
  }
}

/**
 * Run embeddings sync directly (Priority 3: will be queued instead)
 * For now, this calls via HTTP; future optimization queues embeddings
 */
export async function runEmbeddingsSyncDirect(
  baseUrl: string,
  userId: string,
  secret: string
): Promise<EmbeddingOutcome> {
  // For Priority 3: This will be replaced with queue insertion
  // Currently still calls HTTP to maintain functionality
  return runEmbeddingsSyncViaHttp(baseUrl, userId, secret);
}
