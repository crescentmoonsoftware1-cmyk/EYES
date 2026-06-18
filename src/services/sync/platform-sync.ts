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
 * This function dynamically imports the corresponding route module and executes
 * the POST handler in-process, bypassing the network interface.
 */
export async function runPlatformSyncDirect(
  supabase: SupabaseClient,
  platform: string,
  userId: string
): Promise<PlatformOutcome> {
  void supabase;
  const routePlatform = toSyncRoutePlatform(platform);
  const startedAt = Date.now();

  try {
    let handler: ((request: Request) => Promise<Response>) | null = null;

    switch (routePlatform) {
      case 'github': {
        const mod = await import('@/app/api/sync/github/route');
        handler = mod.POST;
        break;
      }
      case 'gmail': {
        const mod = await import('@/app/api/sync/gmail/route');
        handler = mod.POST;
        break;
      }
      case 'google-calendar': {
        const mod = await import('@/app/api/sync/google-calendar/route');
        handler = mod.POST;
        break;
      }
      case 'notion': {
        const mod = await import('@/app/api/sync/notion/route');
        handler = mod.POST;
        break;
      }
      case 'reddit': {
        const mod = await import('@/app/api/sync/reddit/route');
        handler = mod.POST;
        break;
      }
      case 'slack': {
        const mod = await import('@/app/api/sync/slack/route');
        handler = mod.POST;
        break;
      }
      case 'discord': {
        const mod = await import('@/app/api/sync/discord/route');
        handler = mod.POST;
        break;
      }
    }

    if (!handler) {
      // Fallback for newer platforms or platforms without direct imports
      const secret = process.env.CRON_SECRET || '';
      const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
      return await runPlatformSyncViaHttp(baseUrl, platform, userId, secret);
    }

    const requestUrl = `http://localhost:3000/api/sync/${routePlatform}`;
    const req = new Request(requestUrl, {
      method: 'POST',
      headers: {
        'x-cron-secret': process.env.CRON_SECRET || '',
        'x-cron-user-id': userId,
      },
    });

    const response = await handler(req);
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
