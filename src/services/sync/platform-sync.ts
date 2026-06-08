/**
 * Direct platform sync service - used by cron to avoid HTTP overhead
 * Extracted from src/app/api/cron/sync/route.ts for Priority 2 optimization
 */

import { SupabaseClient } from '@supabase/supabase-js';

export type PlatformOutcome = {
  platform: string;
  routePlatform: string;
  success: boolean;
  status: number | null;
  durationMs: number;
  error?: string;
};

const SYNC_TIMEOUT_MS = Number(process.env.CRON_SYNC_TIMEOUT_MS || 20000);

function toSyncRoutePlatform(platform: string) {
  if (platform === 'google_calendar') return 'google-calendar';
  return platform.replace(/_/g, '-');
}

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
 * Run platform sync via HTTP (used when called from route handlers)
 * Called from sync/all/route.ts browser requests
 */
export async function runPlatformSyncViaHttp(
  baseUrl: string,
  platform: string,
  userId: string,
  secret: string
): Promise<PlatformOutcome> {
  const routePlatform = toSyncRoutePlatform(platform);
  const startedAt = Date.now();

  try {
    const response = await fetchWithTimeout(
      `${baseUrl}/api/sync/${routePlatform}`,
      {
        method: 'POST',
        headers: {
          'x-cron-secret': secret,
          'x-cron-user-id': userId,
        },
      },
      SYNC_TIMEOUT_MS
    );

    const rawBody = await response.text();
    const body = parseResponsePayload(rawBody);

    if (!response.ok) {
      return {
        platform,
        routePlatform,
        success: false,
        status: response.status,
        durationMs: Date.now() - startedAt,
        error: typeof body === 'object' && body && 'error' in body ? String(body.error) : `Sync failed (${response.status})`,
      };
    }

    return {
      platform,
      routePlatform,
      success: true,
      status: response.status,
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      platform,
      routePlatform,
      success: false,
      status: null,
      durationMs: Date.now() - startedAt,
      error: message,
    };
  }
}

/**
 * Run platform sync directly (used by cron to avoid HTTP overhead)
 * Priority 2 optimization: Direct call instead of HTTP fetch
 *
 * NOTE: This function is NOT YET IMPLEMENTED. It is a reserved stub for
 * Priority 2 work. It intentionally returns success=false so that if it is
 * accidentally wired into the cron path it fails loudly rather than silently
 * reporting success while doing nothing. Use runPlatformSyncViaHttp() instead.
 */
export async function runPlatformSyncDirect(
  supabase: SupabaseClient,
  platform: string,
  _userId: string  // Reserved for Priority 2 direct-call implementation
): Promise<PlatformOutcome> {
  void supabase; // Will be used by the direct sync implementation
  const routePlatform = toSyncRoutePlatform(platform);
  const startedAt = Date.now();

  // Priority 2 stub — direct platform invocation not yet implemented.
  // Do NOT return success=true here: the caller must use runPlatformSyncViaHttp().
  console.error(`[PlatformSync] runPlatformSyncDirect() called for '${platform}' but is not implemented. Use runPlatformSyncViaHttp() instead.`);
  return {
    platform,
    routePlatform,
    success: false,
    status: null,
    durationMs: Date.now() - startedAt,
    error: 'runPlatformSyncDirect() is not yet implemented. Use runPlatformSyncViaHttp().',
  };
}
