import { NextResponse } from 'next/server';

import { getValidGoogleToken } from '@/services/auth/oauth';
import { upsertRawEventsSafely, upsertSyncStatusSafely } from '@/utils/supabase/upsert';
import { resolveSyncActor } from '@/utils/sync/actor';

export async function POST(request: Request) {
  if (process.env.MOCK_MODE === 'true') {
    return NextResponse.json({
      ok: true,
      syncedMeets: 4,
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
      .eq('platform', 'google_meet')
      .maybeSingle();

    const accessToken = await getValidGoogleToken(supabase, userId, 'google_meet');
    if (!accessToken) {
      return NextResponse.json({ error: 'Google Meet session expired and refresh failed.' }, { status: 401 });
    }

    // Mark as syncing
    await upsertSyncStatusSafely(supabase, {
      user_id: userId,
      platform: 'google_meet',
      status: 'syncing',
      last_sync_at: new Date().toISOString(),
    });

    // 1. Search for transcripts in Drive or Calendar Meet events
    const searchUrl = new URL('https://www.googleapis.com/drive/v3/files');
    searchUrl.searchParams.set('q', "(name contains 'Meet Transcript' or name contains 'Call Recording') and trashed = false");
    searchUrl.searchParams.set('fields', 'nextPageToken, files(id, name, modifiedTime, webViewLink)');
    searchUrl.searchParams.set('pageSize', '20');
    if (currentStatus?.cursor) {
      searchUrl.searchParams.set('pageToken', currentStatus.cursor);
    }

    const driveRes = await fetch(searchUrl.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    });

    if (!driveRes.ok) {
      throw new Error(`Drive Meet transcript search failed: ${await driveRes.text()}`);
    }

    const driveData = await driveRes.json() as { files?: Array<{ id: string; name: string; modifiedTime: string; webViewLink?: string }>; nextPageToken?: string };
    const files = driveData.files ?? [];
    const nextPageToken = driveData.nextPageToken;

    const memories = [];

    // 2. Fetch transcript texts
    for (const file of files) {
      try {
        const textRes = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: 'no-store',
        });

        if (!textRes.ok) continue;
        const text = await textRes.text();

        memories.push({
          user_id: userId,
          platform: 'google_meet',
          platform_id: file.id,
          event_type: 'meet_transcript',
          title: file.name,
          content: text.trim() || `Google Meet: ${file.name}`,
          author: 'Google Meet',
          timestamp: file.modifiedTime,
          metadata: {
            webViewLink: file.webViewLink,
            wordsCount: text.split(/\s+/).length,
          },
          is_flagged: false,
          flag_severity: 'LOW',
          flag_reason: null,
        });
      } catch (err) {
        console.warn(`[Google Meet Sync] Failed to parse transcript ${file.id}:`, err);
      }
    }

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
        platform: 'google_meet',
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
      syncedMeets: memories.length,
      hasMore: !!nextPageToken,
    });
  } catch (error: unknown) {
    console.error('[Google Meet Sync] Fatal Error:', error);
    return NextResponse.json({ error: 'Failed to sync Google Meet.' }, { status: 500 });
  }
}
