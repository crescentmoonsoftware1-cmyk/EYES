import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { upsertSyncStatusSafely } from '@/utils/supabase/upsert';
import { resolveSyncActor } from '@/utils/sync/actor';

const SYNC_TIMEOUT_MS = 25000; // Increased timeout for multiple platforms

type SyncOutcome = {
  platform: string;
  routePlatform: string;
  success: boolean;
  status: number | null;
  durationMs: number;
  data?: unknown;
  error?: string;
};

export function toSyncRoutePlatform(platform: string) {
  if (platform === 'google_calendar') return 'google-calendar';
  return platform.replace(/_/g, '-');
}

function isBackgroundMode(request: Request) {
  const background = new URL(request.url).searchParams.get('background');
  if (!background) return false;
  return ['1', 'true', 'yes'].includes(background.toLowerCase());
}

function cookieHeaderValue(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  return cookieStore
    .getAll()
    .map(({ name, value }) => `${name}=${value}`)
    .join('; ');
}

function resolveBaseUrl(request: Request) {
  // If we are on localhost, always use relative or local origin to avoid hitting production
  const host = request.headers.get('host');
  if (host) {
    const protocol = host.includes('localhost') ? 'http' : 'https';
    return `${protocol}://${host}`;
  }

  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL;
  }

  return 'http://localhost:3000';
}

function parseResponsePayload(rawBody: string) {
  if (!rawBody) return null;

  try {
    return JSON.parse(rawBody);
  } catch {
    return { message: rawBody.slice(0, 300) };
  }
}

/**
 * Support manual sync triggers via browser GET requests
 */
export async function GET(request: Request) {
  return POST(request);
}

/**
 * Unified entry point to sync all connected platforms for the current user.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const depth = url.searchParams.get('depth') || 'shallow';

  try {
    const actor = await resolveSyncActor(request);
    if ('status' in actor) {
      return NextResponse.json({ error: actor.error }, { status: actor.status });
    }

    const { supabase, userId, mode } = actor;

    // Get all connected platforms with valid tokens
    const { data: tokens } = await supabase
      .from('oauth_tokens')
      .select('platform')
      .eq('user_id', userId);

    // Direct API-key platforms — no oauth_tokens row needed, include if env key is present
    const DIRECT_KEY_PLATFORMS: Array<{ platform: string; envKey: string }> = [
      { platform: 'vercel', envKey: 'VERCEL_API_TOKEN' },
      { platform: 'trello', envKey: 'TRELLO_API_KEY' },
      { platform: 'posthog', envKey: 'POSTHOG_API_KEY' },
      { platform: 'devin', envKey: 'DEVIN_API_KEY' },
      { platform: 'cursor', envKey: 'CURSOR_API_KEY' },
    ];
    const oauthPlatforms = tokens ?? [];
    const directPlatforms = DIRECT_KEY_PLATFORMS
      .filter((p) => Boolean(process.env[p.envKey]))
      .filter((p) => !oauthPlatforms.some((t) => t.platform === p.platform))
      .map((p) => ({ platform: p.platform }));
    const allPlatforms = [...oauthPlatforms, ...directPlatforms];

    if (allPlatforms.length === 0) {
      return NextResponse.json({ message: 'No connected platforms found.', results: [] });
    }

    const appBaseUrl = resolveBaseUrl(request);
    
    // Prepare headers for sub-requests
    const subHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (mode === 'cron') {
      subHeaders['x-cron-secret'] = process.env.CRON_SECRET || '';
      subHeaders['x-cron-user-id'] = userId;
    } else {
      const cookieStore = await cookies();
      subHeaders['Cookie'] = cookieHeaderValue(cookieStore);
    }

    const runPlatformSync = async (platform: string): Promise<SyncOutcome> => {
      const routePlatform = toSyncRoutePlatform(platform);
      const startedAt = Date.now();

      await upsertSyncStatusSafely(supabase, {
        user_id: userId,
        platform,
        status: 'syncing',
        sync_progress: 1,
        error_message: null,
      });

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS);

      try {
        const syncUrl = new URL(`${appBaseUrl}/api/sync/${routePlatform}`);
        syncUrl.searchParams.set('depth', depth);

        const response = await fetch(syncUrl.toString(), {
          method: 'POST',
          headers: subHeaders,
          cache: 'no-store',
          signal: controller.signal,
        });

        const rawBody = await response.text();
        const data = parseResponsePayload(rawBody);

        if (!response.ok) {
          const message = `Provider sync failed (${response.status})`;
          await upsertSyncStatusSafely(supabase, {
            user_id: userId,
            platform,
            status: 'error',
            sync_progress: 0,
            error_message: message,
          });

          return {
            platform,
            routePlatform,
            success: false,
            status: response.status,
            durationMs: Date.now() - startedAt,
            data,
            error: message,
          };
        }

        return {
          platform,
          routePlatform,
          success: true,
          status: response.status,
          durationMs: Date.now() - startedAt,
          data,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await upsertSyncStatusSafely(supabase, {
          user_id: userId,
          platform,
          status: 'error',
          sync_progress: 0,
          error_message: message.slice(0, 250),
        });

        return {
          platform,
          routePlatform,
          success: false,
          status: null,
          durationMs: Date.now() - startedAt,
          error: message,
        };
      } finally {
        clearTimeout(timeoutId);
      }
    };

    void Promise.allSettled(allPlatforms.map((token) => runPlatformSync(token.platform))).then((settled) => {
      const fulfilled = settled.filter((item): item is PromiseFulfilledResult<SyncOutcome> => item.status === 'fulfilled');
      const successCount = fulfilled.filter((item) => item.value.success).length;
      const failedCount = fulfilled.length - successCount + (settled.length - fulfilled.length);
      console.log(
        `[Sync All] Background sync complete. user=${userId} success=${successCount} failed=${failedCount}`
      );
    });

    void (async () => {
      try {
        // Queue any newly synced memories that don't have an embedding yet.
        // Uses memory_id (new unified design) — not the deprecated raw_event_id.
        const { data: unembedded } = await supabase
          .from('memories')
          .select('id')
          .eq('user_id', userId)
          .is('embedding', null)
          .not('content', 'is', null)
          .limit(200);

        if (unembedded && unembedded.length > 0) {
          const queueItems = unembedded.map((memory) => ({
            user_id: userId,
            memory_id: memory.id,
            status: 'pending',
          }));

          // onConflict: ignore duplicates — the unique index on (memory_id) WHERE pending/processing
          // ensures we never double-queue the same memory.
          const { error: insertError } = await supabase
            .from('embedding_queue')
            .insert(queueItems, { onConflict: 'memory_id' } as Record<string, unknown>);

          if (insertError) {
            console.warn('[Sync All] Failed to insert embedding queue items:', insertError.message);
          } else {
            console.log(`[Sync All] Queued ${queueItems.length} memories for embedding.`);
          }
        }
      } catch (err) {
        console.warn('[Sync All] Failed to queue embeddings:', err);
      }
    })();

    return NextResponse.json(
      {
        accepted: true,
        mode: 'background',
        message: `Sync launched for ${allPlatforms.length} platforms. Check sync_status for progress.`,
        platforms: allPlatforms.map((token) => token.platform),
      },
      { status: 202 }
    );
  } catch (err) {
    console.error('Unified Sync error:', err);
    return NextResponse.json({ error: 'Failed to initiate global sync.' }, { status: 500 });
  }
}
