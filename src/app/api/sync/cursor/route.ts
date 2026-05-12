import { NextResponse } from 'next/server';
import { resolveSyncActor } from '@/utils/sync/actor';
import { upsertRawEventsSafely, upsertSyncStatusSafely } from '@/utils/supabase/upsert';

// Cursor AI uses CURSOR_API_KEY (from crsr_ prefix format)
// Sessions can be read from Cursor's REST API

type CursorSession = {
  id?: string;
  sessionId?: string;
  name?: string;
  title?: string;
  createdAt?: string;
  updatedAt?: string;
  status?: string;
  messageCount?: number;
};

export async function POST(request: Request) {
  const actor = await resolveSyncActor(request);
  if ('status' in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  const { supabase, userId } = actor;

  const apiKey = process.env.CURSOR_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'CURSOR_API_KEY not configured.' }, { status: 503 });

  try {
    const { data: currentStatus } = await supabase
      .from('sync_status').select('total_items')
      .eq('user_id', userId).eq('platform', 'cursor').maybeSingle();

    await upsertSyncStatusSafely(supabase, {
      user_id: userId, platform: 'cursor', status: 'syncing', last_sync_at: new Date().toISOString(),
    });

    const url = new URL(request.url);
    const limit = url.searchParams.get('depth') === 'deep' ? 100 : 25;

    // Cursor API — fetch recent AI coding sessions
    const sessionsResp = await fetch(`https://api.cursor.com/v1/sessions?limit=${limit}`, {
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      cache: 'no-store',
    });

    if (!sessionsResp.ok) {
      const errText = (await sessionsResp.text()).slice(0, 200);
      throw new Error(`Cursor API (${sessionsResp.status}): ${errText}`);
    }

    const body = await sessionsResp.json() as { sessions?: CursorSession[]; data?: CursorSession[] };
    const sessions = body.sessions ?? body.data ?? [];

    const events: Record<string, unknown>[] = sessions.map((session) => ({
      user_id: userId, platform: 'cursor',
      platform_id: `session_${session.id ?? session.sessionId ?? Date.now()}`,
      event_type: 'session',
      title: session.title ?? session.name ?? 'Cursor AI Session',
      content: [
        session.title ?? session.name ?? 'Cursor coding session',
        session.status ? `Status: ${session.status}` : '',
        session.messageCount ? `Messages: ${session.messageCount}` : '',
      ].filter(Boolean).join(' | '),
      author: 'Cursor AI',
      timestamp: session.updatedAt ?? session.createdAt ?? new Date().toISOString(),
      is_flagged: false, flag_severity: 'LOW', flag_reason: null,
      metadata: {
        session_id: session.id ?? session.sessionId,
        status: session.status ?? null,
        message_count: session.messageCount ?? null,
      },
    }));

    if (events.length > 0) await upsertRawEventsSafely(supabase, events);

    const { count: totalMemories } = await supabase
      .from('memories').select('id', { count: 'exact', head: true }).eq('user_id', userId);
    const now = new Date().toISOString();
    await Promise.all([
      upsertSyncStatusSafely(supabase, {
        user_id: userId, platform: 'cursor', status: 'connected', sync_progress: 100,
        total_items: (currentStatus?.total_items ?? 0) + events.length,
        last_sync_at: now, next_sync_at: new Date(Date.now() + 3600000).toISOString(), error_message: null,
      }),
      supabase.from('user_profiles').update({ memories_indexed: totalMemories ?? events.length, updated_at: now }).eq('user_id', userId),
    ]);

    return NextResponse.json({ success: true, count: events.length });
  } catch (err) {
    console.error('[Cursor Sync] Error:', err);
    await upsertSyncStatusSafely(supabase, {
      user_id: userId, platform: 'cursor', status: 'error', error_message: String(err).slice(0, 200),
    });
    return NextResponse.json({ error: 'Cursor sync failed' }, { status: 500 });
  }
}
