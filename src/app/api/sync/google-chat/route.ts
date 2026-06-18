import { NextResponse } from 'next/server';

import { getValidGoogleToken } from '@/services/auth/oauth';
import { upsertRawEventsSafely, upsertSyncStatusSafely } from '@/utils/supabase/upsert';
import { resolveSyncActor } from '@/utils/sync/actor';

export async function POST(request: Request) {
  if (process.env.MOCK_MODE === 'true') {
    return NextResponse.json({
      ok: true,
      syncedMessages: 15,
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
      .eq('platform', 'google_chat')
      .maybeSingle();

    const accessToken = await getValidGoogleToken(supabase, userId, 'google_chat');
    if (!accessToken) {
      return NextResponse.json({ error: 'Google Chat session expired and refresh failed.' }, { status: 401 });
    }

    // Mark as syncing
    await upsertSyncStatusSafely(supabase, {
      user_id: userId,
      platform: 'google_chat',
      status: 'syncing',
      last_sync_at: new Date().toISOString(),
    });

    // 1. List user chat spaces
    const spacesRes = await fetch('https://chat.googleapis.com/v1/spaces', {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    });

    if (!spacesRes.ok) {
      throw new Error(`Chat spaces lookup failed: ${await spacesRes.text()}`);
    }

    const spacesData = await spacesRes.json() as { spaces?: Array<{ name: string; displayName?: string }> };
    const spaces = spacesData.spaces ?? [];
    const memories = [];

    // 2. Fetch messages in spaces
    for (const space of spaces) {
      try {
        const messagesRes = await fetch(`https://chat.googleapis.com/v1/${space.name}/messages?pageSize=20`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: 'no-store',
        });

        if (!messagesRes.ok) continue;

        const messagesData = await messagesRes.json() as { messages?: Array<{ name: string; text?: string; createTime?: string; sender?: { displayName?: string } }> };
        const messages = messagesData.messages ?? [];

        for (const message of messages) {
          if (!message.text) continue;

          memories.push({
            user_id: userId,
            platform: 'google_chat',
            platform_id: message.name,
            event_type: 'chat_message',
            title: `Message in #${space.displayName || 'Space'}`,
            content: message.text,
            author: message.sender?.displayName || 'Google Chat User',
            timestamp: message.createTime || new Date().toISOString(),
            metadata: {
              spaceName: space.name,
              displayName: space.displayName,
            },
            is_flagged: false,
            flag_severity: 'LOW',
            flag_reason: null,
          });
        }
      } catch (err) {
        console.warn(`[Google Chat Sync] Failed to parse messages for space ${space.name}:`, err);
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
        platform: 'google_chat',
        status: 'connected',
        sync_progress: 100,
        total_items: (currentStatus?.total_items || 0) + memories.length,
        last_sync_at: new Date().toISOString(),
        next_sync_at: new Date(Date.now() + 1000 * 60 * 30).toISOString(),
        cursor: null,
        error_message: null,
      }),
      supabase.from('user_profiles').update({
        memories_indexed: totalMemories ?? 0,
        updated_at: new Date().toISOString(),
      }).eq('user_id', userId),
    ]);

    return NextResponse.json({
      ok: true,
      syncedMessages: memories.length,
      hasMore: false,
    });
  } catch (error: unknown) {
    console.error('[Google Chat Sync] Fatal Error:', error);
    return NextResponse.json({ error: 'Failed to sync Google Chat.' }, { status: 500 });
  }
}
