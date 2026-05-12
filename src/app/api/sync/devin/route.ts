import { NextResponse } from 'next/server';
import { resolveSyncActor } from '@/utils/sync/actor';
import { upsertRawEventsSafely, upsertSyncStatusSafely } from '@/utils/supabase/upsert';

type DevinSession = {
  session_id: string; status?: string; title?: string;
  created_at?: string; updated_at?: string; snapshot_id?: string;
  session_url?: string; playbook_id?: string | null;
};
type DevinSessionsResponse = { sessions?: DevinSession[] };

export async function POST(request: Request) {
  const actor = await resolveSyncActor(request);
  if ('status' in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  const { supabase, userId } = actor;

  // Devin uses a direct API key — no OAuth handshake needed
  const apiKey = process.env.DEVIN_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'DEVIN_API_KEY not configured.' }, { status: 503 });

  try {
    const { data: currentStatus } = await supabase
      .from('sync_status').select('total_items')
      .eq('user_id', userId).eq('platform', 'devin').maybeSingle();

    await upsertSyncStatusSafely(supabase, { user_id: userId, platform: 'devin', status: 'syncing', last_sync_at: new Date().toISOString() });

    const url = new URL(request.url);
    const limit = url.searchParams.get('depth') === 'deep' ? 100 : 20;
    const headers = { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' };

    // Fetch Devin sessions
    const sessionsResp = await fetch(`https://api.cognition.ai/v1/sessions?limit=${limit}`, {
      headers, cache: 'no-store',
    });
    if (!sessionsResp.ok) throw new Error(`Devin API (${sessionsResp.status}): ${(await sessionsResp.text()).slice(0, 200)}`);
    const body = (await sessionsResp.json()) as DevinSessionsResponse;
    const sessions = body.sessions ?? [];

    const events: Record<string, unknown>[] = sessions.map((session) => {
      const isFailed = session.status === 'failed' || session.status === 'error';
      const isRunning = session.status === 'running' || session.status === 'in_progress';
      return {
        user_id: userId, platform: 'devin',
        platform_id: `session_${session.session_id}`,
        event_type: 'session',
        title: session.title || `Devin Session ${session.session_id.slice(0, 8)}`,
        content: [
          session.title || 'Devin AI session',
          `Status: ${session.status ?? 'unknown'}`,
          session.session_url ? `URL: ${session.session_url}` : '',
          session.playbook_id ? `Playbook: ${session.playbook_id}` : '',
        ].filter(Boolean).join(' | '),
        author: 'Devin AI',
        timestamp: session.updated_at || session.created_at || new Date().toISOString(),
        is_flagged: isFailed,
        flag_severity: isFailed ? 'DIRECT' : 'LOW',
        flag_reason: isFailed ? 'Devin session failed' : null,
        metadata: {
          session_id: session.session_id,
          status: session.status,
          session_url: session.session_url ?? null,
          snapshot_id: session.snapshot_id ?? null,
          playbook_id: session.playbook_id ?? null,
          is_running: isRunning,
        },
      };
    });

    if (events.length > 0) await upsertRawEventsSafely(supabase, events);

    const { count: totalMemories } = await supabase
      .from('memories').select('id', { count: 'exact', head: true }).eq('user_id', userId);
    const now = new Date().toISOString();
    await Promise.all([
      upsertSyncStatusSafely(supabase, {
        user_id: userId, platform: 'devin', status: 'connected',
        sync_progress: 100, total_items: (currentStatus?.total_items ?? 0) + events.length,
        last_sync_at: now, next_sync_at: new Date(Date.now() + 3600000).toISOString(), error_message: null,
      }),
      supabase.from('user_profiles').update({ memories_indexed: totalMemories ?? events.length, updated_at: now }).eq('user_id', userId),
    ]);

    return NextResponse.json({ success: true, count: events.length });
  } catch (err) {
    console.error('[Devin Sync] Error:', err);
    await upsertSyncStatusSafely(supabase, { user_id: userId, platform: 'devin', status: 'error', error_message: String(err).slice(0, 200) });
    return NextResponse.json({ error: 'Devin sync failed' }, { status: 500 });
  }
}
