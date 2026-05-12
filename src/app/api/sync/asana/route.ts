import { NextResponse } from 'next/server';
import { resolveSyncActor } from '@/utils/sync/actor';
import { upsertRawEventsSafely, upsertSyncStatusSafely } from '@/utils/supabase/upsert';
import { decryptToken } from '@/utils/tokens';

type AsanaTask = {
  gid: string; name: string; notes?: string; completed?: boolean;
  due_on?: string | null; created_at?: string; modified_at?: string;
  assignee?: { name?: string } | null;
  projects?: Array<{ gid: string; name: string }>;
  tags?: Array<{ name: string }>;
};
type AsanaProject = { gid: string; name: string; notes?: string; created_at?: string; modified_at?: string };

export async function POST(request: Request) {
  const actor = await resolveSyncActor(request);
  if ('status' in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  const { supabase, userId } = actor;

  try {
    const { data: tokenRow } = await supabase.from('oauth_tokens').select('access_token').eq('user_id', userId).eq('platform', 'asana').maybeSingle();
    if (!tokenRow?.access_token) return NextResponse.json({ error: 'Asana is not connected.' }, { status: 401 });

    const { data: currentStatus } = await supabase.from('sync_status').select('total_items').eq('user_id', userId).eq('platform', 'asana').maybeSingle();
    await upsertSyncStatusSafely(supabase, { user_id: userId, platform: 'asana', status: 'syncing', last_sync_at: new Date().toISOString() });

    const accessToken = decryptToken(tokenRow.access_token);
    const headers = { Authorization: `Bearer ${accessToken}`, 'Asana-Enable': 'new_user_task_lists' };
    const url = new URL(request.url);
    const limit = url.searchParams.get('depth') === 'deep' ? 100 : 25;

    // Get current user's workspace
    const meResp = await fetch('https://app.asana.com/api/1.0/users/me?opt_fields=gid,name,workspaces', { headers, cache: 'no-store' });
    if (!meResp.ok) throw new Error(`Asana user API (${meResp.status})`);
    const me = (await meResp.json()).data as { gid: string; name: string; workspaces: Array<{ gid: string; name: string }> };
    const workspaces = me.workspaces ?? [];

    const events: Record<string, unknown>[] = [];

    for (const workspace of workspaces.slice(0, 3)) {
      // Fetch projects
      const projResp = await fetch(
        `https://app.asana.com/api/1.0/projects?workspace=${workspace.gid}&opt_fields=gid,name,notes,created_at,modified_at&limit=50`,
        { headers, cache: 'no-store' }
      );
      const projects: AsanaProject[] = projResp.ok ? ((await projResp.json()).data ?? []) : [];

      for (const project of projects.slice(0, 10)) {
        events.push({
          user_id: userId, platform: 'asana', platform_id: `project_${project.gid}`,
          event_type: 'project', title: project.name,
          content: project.notes ? `${project.name}: ${project.notes}` : project.name,
          author: me.name, timestamp: project.modified_at || project.created_at || new Date().toISOString(),
          is_flagged: false, flag_severity: 'LOW', flag_reason: null,
          metadata: { gid: project.gid, workspace: workspace.name },
        });

        // Fetch tasks for this project
        const taskResp = await fetch(
          `https://app.asana.com/api/1.0/tasks?project=${project.gid}&opt_fields=gid,name,notes,completed,due_on,created_at,modified_at,assignee.name,tags.name&limit=${limit}`,
          { headers, cache: 'no-store' }
        );
        if (!taskResp.ok) continue;
        const tasks: AsanaTask[] = (await taskResp.json()).data ?? [];

        for (const task of tasks) {
          const isOverdue = task.due_on && !task.completed && new Date(task.due_on) < new Date();
          events.push({
            user_id: userId, platform: 'asana', platform_id: `task_${task.gid}`,
            event_type: task.completed ? 'completed_task' : 'task',
            title: task.name,
            content: task.notes ? `${task.name}: ${task.notes}` : task.name,
            author: task.assignee?.name ?? me.name,
            timestamp: task.modified_at || task.created_at || new Date().toISOString(),
            is_flagged: Boolean(isOverdue), flag_severity: isOverdue ? 'LOW' : 'LOW',
            flag_reason: isOverdue ? 'Overdue task' : null,
            metadata: { gid: task.gid, project: project.name, workspace: workspace.name, completed: task.completed, due_on: task.due_on, tags: task.tags?.map((t) => t.name) ?? [] },
          });
        }
      }
    }

    if (events.length > 0) await upsertRawEventsSafely(supabase, events);

    const { count: totalMemories } = await supabase.from('memories').select('id', { count: 'exact', head: true }).eq('user_id', userId);
    const now = new Date().toISOString();
    await Promise.all([
      upsertSyncStatusSafely(supabase, { user_id: userId, platform: 'asana', status: 'connected', sync_progress: 100, total_items: (currentStatus?.total_items ?? 0) + events.length, last_sync_at: now, next_sync_at: new Date(Date.now() + 3600000).toISOString(), error_message: null }),
      supabase.from('user_profiles').update({ memories_indexed: totalMemories ?? events.length, updated_at: now }).eq('user_id', userId),
    ]);

    return NextResponse.json({ success: true, workspaces: workspaces.length, count: events.length });
  } catch (err) {
    console.error('[Asana Sync] Error:', err);
    await upsertSyncStatusSafely(supabase, { user_id: userId, platform: 'asana', status: 'error', error_message: String(err).slice(0, 200) });
    return NextResponse.json({ error: 'Asana sync failed' }, { status: 500 });
  }
}
