import { NextResponse } from 'next/server';
import { resolveSyncActor } from '@/utils/sync/actor';
import { upsertRawEventsSafely, upsertSyncStatusSafely } from '@/utils/supabase/upsert';
import { decryptToken } from '@/utils/tokens';

type ClickUpTask = { id: string; name: string; description?: string; status?: { status: string }; due_date?: string | null; date_created?: string; date_updated?: string; assignees?: Array<{ username?: string }>; list?: { name?: string }; folder?: { name?: string }; space?: { id?: string } };
type ClickUpList = { id: string; name: string; task_count?: number; folder?: { id?: string; name?: string } };
type ClickUpSpace = { id: string; name: string };
type ClickUpTeam = { id: string; name: string; members?: unknown[] };

export async function POST(request: Request) {
  const actor = await resolveSyncActor(request);
  if ('status' in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  const { supabase, userId } = actor;
  try {
    const { data: tokenRow } = await supabase.from('oauth_tokens').select('access_token').eq('user_id', userId).eq('platform', 'clickup').maybeSingle();
    if (!tokenRow?.access_token) return NextResponse.json({ error: 'ClickUp is not connected.' }, { status: 401 });
    const { data: currentStatus } = await supabase.from('sync_status').select('total_items').eq('user_id', userId).eq('platform', 'clickup').maybeSingle();
    await upsertSyncStatusSafely(supabase, { user_id: userId, platform: 'clickup', status: 'syncing', last_sync_at: new Date().toISOString() });
    const accessToken = decryptToken(tokenRow.access_token);
    const headers = { Authorization: accessToken };
    const url = new URL(request.url);
    const limit = url.searchParams.get('depth') === 'deep' ? 100 : 25;
    // Get teams (workspaces)
    const teamsResp = await fetch('https://api.clickup.com/api/v2/team', { headers, cache: 'no-store' });
    if (!teamsResp.ok) throw new Error(`ClickUp teams API (${teamsResp.status})`);
    const { teams } = await teamsResp.json() as { teams: ClickUpTeam[] };
    const events: Record<string, unknown>[] = [];
    for (const team of (teams ?? []).slice(0, 3)) {
      const spacesResp = await fetch(`https://api.clickup.com/api/v2/team/${team.id}/space?archived=false`, { headers, cache: 'no-store' });
      if (!spacesResp.ok) continue;
      const { spaces } = await spacesResp.json() as { spaces: ClickUpSpace[] };
      for (const space of (spaces ?? []).slice(0, 5)) {
        const listsResp = await fetch(`https://api.clickup.com/api/v2/space/${space.id}/list?archived=false`, { headers, cache: 'no-store' });
        if (!listsResp.ok) continue;
        const { lists } = await listsResp.json() as { lists: ClickUpList[] };
        for (const list of (lists ?? []).slice(0, 5)) {
          const tasksResp = await fetch(`https://api.clickup.com/api/v2/list/${list.id}/task?limit=${limit}&include_closed=false`, { headers, cache: 'no-store' });
          if (!tasksResp.ok) continue;
          const { tasks } = await tasksResp.json() as { tasks: ClickUpTask[] };
          for (const task of tasks ?? []) {
            const isOverdue = task.due_date && new Date(Number(task.due_date)) < new Date() && task.status?.status !== 'complete';
            events.push({
              user_id: userId, platform: 'clickup', platform_id: `task_${task.id}`,
              event_type: 'task', title: task.name,
              content: task.description ? `${task.name}: ${task.description}` : task.name,
              author: task.assignees?.[0]?.username ?? 'ClickUp',
              timestamp: task.date_updated ? new Date(Number(task.date_updated)).toISOString() : new Date().toISOString(),
              is_flagged: Boolean(isOverdue), flag_severity: isOverdue ? 'LOW' : 'LOW', flag_reason: isOverdue ? 'Overdue task' : null,
              metadata: { id: task.id, status: task.status?.status, list: list.name, space: space.name, team: team.name, due_date: task.due_date ? new Date(Number(task.due_date)).toISOString() : null },
            });
          }
        }
      }
    }
    if (events.length > 0) await upsertRawEventsSafely(supabase, events);
    const { count: totalMemories } = await supabase.from('memories').select('id', { count: 'exact', head: true }).eq('user_id', userId);
    const now = new Date().toISOString();
    await Promise.all([
      upsertSyncStatusSafely(supabase, { user_id: userId, platform: 'clickup', status: 'connected', sync_progress: 100, total_items: (currentStatus?.total_items ?? 0) + events.length, last_sync_at: now, next_sync_at: new Date(Date.now() + 3600000).toISOString(), error_message: null }),
      supabase.from('user_profiles').update({ memories_indexed: totalMemories ?? events.length, updated_at: now }).eq('user_id', userId),
    ]);
    return NextResponse.json({ success: true, count: events.length });
  } catch (err) {
    console.error('[ClickUp Sync] Error:', err);
    await upsertSyncStatusSafely(supabase, { user_id: userId, platform: 'clickup', status: 'error', error_message: String(err).slice(0, 200) });
    return NextResponse.json({ error: 'ClickUp sync failed' }, { status: 500 });
  }
}
