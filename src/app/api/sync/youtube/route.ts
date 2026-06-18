import { NextResponse } from 'next/server';

import { getValidGoogleToken } from '@/services/auth/oauth';
import { upsertRawEventsSafely, upsertSyncStatusSafely } from '@/utils/supabase/upsert';
import { resolveSyncActor } from '@/utils/sync/actor';

export async function POST(request: Request) {
  if (process.env.MOCK_MODE === 'true') {
    return NextResponse.json({
      ok: true,
      syncedVideos: 6,
      hasMore: false,
    });
  }

  try {
    const actor = await resolveSyncActor(request);
    if ('status' in actor) {
      return NextResponse.json({ error: actor.error }, { status: actor.status });
    }

    const { supabase, userId } = actor;

    const { data: currentStatus } = await supabase
      .from('sync_status')
      .select('cursor, total_items')
      .eq('user_id', userId)
      .eq('platform', 'youtube')
      .maybeSingle();

    const accessToken = await getValidGoogleToken(supabase, userId, 'youtube');
    if (!accessToken) {
      return NextResponse.json({ error: 'YouTube session expired and refresh failed.' }, { status: 401 });
    }

    // Mark as syncing
    await upsertSyncStatusSafely(supabase, {
      user_id: userId,
      platform: 'youtube',
      status: 'syncing',
      last_sync_at: new Date().toISOString(),
    });

    // 1. Fetch user subscriptions as a proxy for interests
    const subUrl = new URL('https://www.googleapis.com/youtube/v3/subscriptions');
    subUrl.searchParams.set('part', 'snippet');
    subUrl.searchParams.set('mine', 'true');
    subUrl.searchParams.set('maxResults', '25');
    if (currentStatus?.cursor) {
      subUrl.searchParams.set('pageToken', currentStatus.cursor);
    }

    const subRes = await fetch(subUrl.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    });

    if (!subRes.ok) {
      throw new Error(`YouTube API failed: ${await subRes.text()}`);
    }

    interface YouTubeSnippet {
      title?: string;
      description?: string;
      publishedAt?: string;
      resourceId?: {
        channelId?: string;
      };
    }

    interface YouTubeSubscription {
      id: string;
      snippet?: YouTubeSnippet;
    }

    const subData = await subRes.json() as { items?: YouTubeSubscription[]; nextPageToken?: string };
    const items = subData.items ?? [];
    const nextPageToken = subData.nextPageToken;

    const memories = items.map(item => {
      const title = item.snippet?.title || 'YouTube Subscription';
      const desc = item.snippet?.description || '';
      return {
        user_id: userId,
        platform: 'youtube',
        platform_id: item.id,
        event_type: 'youtube_subscription',
        title: `Subscribed to ${title}`,
        content: `Subscribed to channel ${title}. Description: ${desc}`,
        author: 'YouTube',
        timestamp: item.snippet?.publishedAt || new Date().toISOString(),
        metadata: {
          channelId: item.snippet?.resourceId?.channelId,
          description: desc,
        },
        is_flagged: false,
        flag_severity: 'LOW',
        flag_reason: null,
      };
    });

    if (memories.length > 0) {
      await upsertRawEventsSafely(supabase, memories);
    }

    const { count: totalMemories } = await supabase
      .from('memories')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);

    await Promise.all([
      upsertSyncStatusSafely(supabase, {
        user_id: userId,
        platform: 'youtube',
        status: nextPageToken ? 'syncing' : 'connected',
        sync_progress: nextPageToken ? 50 : 100,
        total_items: (currentStatus?.total_items || 0) + memories.length,
        last_sync_at: new Date().toISOString(),
        next_sync_at: new Date(Date.now() + 1000 * 60 * 30).toISOString(),
        cursor: nextPageToken || null,
        error_message: null,
      }),
      supabase.from('user_profiles').update({
        memories_indexed: totalMemories ?? 0,
        updated_at: new Date().toISOString(),
      }).eq('user_id', userId),
    ]);

    return NextResponse.json({
      ok: true,
      syncedVideos: memories.length,
      hasMore: !!nextPageToken,
    });
  } catch (error: unknown) {
    console.error('[YouTube Sync] Fatal Error:', error);
    return NextResponse.json({ error: 'Failed to sync YouTube.' }, { status: 500 });
  }
}
