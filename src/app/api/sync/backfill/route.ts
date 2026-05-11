import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { upsertSyncStatusSafely } from '@/utils/supabase/memories';

/**
 * POST /api/sync/backfill
 * Triggers a full historical backfill for one or all connected platforms.
 * This should be called once when a platform is first connected.
 *
 * Body: { platform?: string }
 *   - If platform is provided: backfill that platform only
 *   - If omitted: backfill all connected platforms
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const targetPlatform: string | undefined = body.platform;

    // Get the connected platforms for this user
    let query = supabase
      .from('oauth_tokens')
      .select('platform')
      .eq('user_id', user.id);

    if (targetPlatform) {
      query = query.eq('platform', targetPlatform);
    }

    const { data: tokens, error: tokenError } = await query;

    if (tokenError || !tokens || tokens.length === 0) {
      return NextResponse.json(
        { error: targetPlatform ? `Platform '${targetPlatform}' is not connected.` : 'No connected platforms found.' },
        { status: 404 }
      );
    }

    const platforms = tokens.map((t) => t.platform);

    // Mark all target platforms as 'syncing' with 0% progress
    // and clear any existing cursor so the backfill starts from the beginning
    await Promise.all(
      platforms.map((platform) =>
        upsertSyncStatusSafely(supabase, {
          user_id: user.id,
          platform,
          status: 'syncing',
          sync_progress: 0,
          cursor: null,        // clear cursor — start from scratch
          error_message: null,
        })
      )
    );

    // Determine the base URL for sub-requests
    const origin = new URL(request.url).origin;

    // Fire backfill requests for each platform in the background (non-blocking)
    // Each platform's sync route handles the ?mode=backfill parameter
    const backfillPromises = platforms.map(async (platform) => {
      const routePlatform = platform === 'google_calendar' ? 'google-calendar' : platform.replace(/_/g, '-');
      const syncUrl = `${origin}/api/sync/${routePlatform}?mode=backfill`;

      try {
        // We use the session cookie by forwarding the Cookie header
        const cookieHeader = request.headers.get('cookie') || '';
        const response = await fetch(syncUrl, {
          method: 'POST',
          headers: { Cookie: cookieHeader },
          cache: 'no-store',
        });

        const ok = response.ok;
        const result = await response.json().catch(() => ({}));
        console.log(`[Backfill] ${platform}: ${ok ? 'started' : 'failed'}`, result);
        return { platform, ok };
      } catch (err) {
        console.error(`[Backfill] ${platform} error:`, err);
        return { platform, ok: false };
      }
    });

    // Don't await — let them run in the background
    void Promise.allSettled(backfillPromises).then((results) => {
      const succeeded = results.filter((r) => r.status === 'fulfilled' && (r as PromiseFulfilledResult<{ ok: boolean }>).value.ok).length;
      console.log(`[Backfill] Complete. ${succeeded}/${platforms.length} platforms started.`);
    });

    return NextResponse.json({
      accepted: true,
      platforms,
      message: `Historical backfill started for ${platforms.length} platform(s). Check sync_status for progress.`,
    }, { status: 202 });

  } catch (err) {
    console.error('[Backfill] Error:', err);
    return NextResponse.json({ error: 'Failed to start backfill.' }, { status: 500 });
  }
}
