import { NextResponse } from 'next/server';
import { resolveSyncActor } from '@/utils/sync/actor';
import { upsertRawEventsSafely, upsertSyncStatusSafely } from '@/utils/supabase/upsert';
import { decryptToken } from '@/services/auth/tokens';

export async function POST(request: Request) {
  const actor = await resolveSyncActor(request);
  if ('status' in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  const { supabase, userId } = actor;
  try {
    const { data: tokenRow } = await supabase.from('oauth_tokens').select('access_token').eq('user_id', userId).eq('platform', 'linear').maybeSingle();
    if (!tokenRow?.access_token) return NextResponse.json({ error: 'Linear is not connected.' }, { status: 401 });
    const { data: currentStatus } = await supabase.from('sync_status').select('total_items').eq('user_id', userId).eq('platform', 'linear').maybeSingle();
    await upsertSyncStatusSafely(supabase, { user_id: userId, platform: 'linear', status: 'syncing', last_sync_at: new Date().toISOString() });
    const accessToken = decryptToken(tokenRow.access_token);
    const url = new URL(request.url);
    const limit = url.searchParams.get('depth') === 'deep' ? 100 : 25;
    // Linear GraphQL API
    const query = `{ viewer { id name } issues(first: ${limit}, orderBy: updatedAt) { nodes { id title description state { name } priority assignee { name } team { name } project { name } createdAt updatedAt dueDate completedAt } } projects(first: 20) { nodes { id name description state createdAt updatedAt } } }`;
    const resp = await fetch('https://api.linear.app/graphql', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
      cache: 'no-store',
    });
    if (!resp.ok) throw new Error(`Linear API (${resp.status})`);
    const { data } = await resp.json();
    const issues = data?.issues?.nodes ?? [];
    const projects = data?.projects?.nodes ?? [];
    const me = data?.viewer;
    const events: Record<string, unknown>[] = [
      ...projects.map((p: Record<string, unknown>) => ({
        user_id: userId, platform: 'linear', platform_id: `project_${p.id}`,
        event_type: 'project', title: String(p.name),
        content: p.description ? `${p.name}: ${p.description}` : String(p.name),
        author: me?.name ?? 'Linear', timestamp: String(p.updatedAt || p.createdAt || new Date().toISOString()),
        is_flagged: false, flag_severity: 'LOW', flag_reason: null,
        metadata: { id: p.id, state: p.state },
      })),
      ...issues.map((issue: Record<string, unknown>) => {
        const state = (issue.state as Record<string, unknown>)?.name as string | undefined;
        const isBlocked = state === 'Cancelled' || (issue.dueDate && !issue.completedAt && new Date(String(issue.dueDate)) < new Date());
        return {
          user_id: userId, platform: 'linear', platform_id: `issue_${issue.id}`,
          event_type: 'issue', title: String(issue.title),
          content: issue.description ? `${issue.title}: ${issue.description}` : String(issue.title),
          author: (issue.assignee as Record<string, unknown>)?.name as string ?? me?.name ?? 'Linear',
          timestamp: String(issue.updatedAt || issue.createdAt || new Date().toISOString()),
          is_flagged: Boolean(isBlocked), flag_severity: isBlocked ? 'LOW' : 'LOW', flag_reason: isBlocked ? 'Overdue or cancelled issue' : null,
          metadata: { id: issue.id, state, priority: issue.priority, team: (issue.team as Record<string, unknown>)?.name, project: (issue.project as Record<string, unknown>)?.name, due_date: issue.dueDate },
        };
      }),
    ];
    if (events.length > 0) await upsertRawEventsSafely(supabase, events);
    const { count: totalMemories } = await supabase.from('memories').select('id', { count: 'exact', head: true }).eq('user_id', userId);
    const now = new Date().toISOString();
    await Promise.all([
      upsertSyncStatusSafely(supabase, { user_id: userId, platform: 'linear', status: 'connected', sync_progress: 100, total_items: (currentStatus?.total_items ?? 0) + events.length, last_sync_at: now, next_sync_at: new Date(Date.now() + 3600000).toISOString(), error_message: null }),
      supabase.from('user_profiles').update({ memories_indexed: totalMemories ?? events.length, updated_at: now }).eq('user_id', userId),
    ]);
    return NextResponse.json({ success: true, issues: issues.length, projects: projects.length, count: events.length });
  } catch (err) {
    console.error('[Linear Sync] Error:', err);
    await upsertSyncStatusSafely(supabase, { user_id: userId, platform: 'linear', status: 'error', error_message: String(err).slice(0, 200) });
    return NextResponse.json({ error: 'Linear sync failed' }, { status: 500 });
  }
}
