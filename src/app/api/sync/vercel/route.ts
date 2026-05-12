import { NextResponse } from 'next/server';
import { resolveSyncActor } from '@/utils/sync/actor';
import { upsertRawEventsSafely, upsertSyncStatusSafely } from '@/utils/supabase/upsert';

type VercelDeployment = {
  uid: string; name: string; url?: string; state?: string;
  inspectorUrl?: string; createdAt: number;
  meta?: { githubCommitRef?: string; githubCommitMessage?: string; githubRepo?: string };
  creator?: { username?: string }; target?: string | null;
};

export async function POST(request: Request) {
  const actor = await resolveSyncActor(request);
  if ('status' in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  const { supabase, userId } = actor;

  // Personal access token — no OAuth handshake needed
  const accessToken = process.env.VERCEL_API_TOKEN;
  if (!accessToken) return NextResponse.json({ error: 'VERCEL_API_TOKEN not configured.' }, { status: 503 });

  try {
    const { data: currentStatus } = await supabase
      .from('sync_status').select('total_items').eq('user_id', userId).eq('platform', 'vercel').maybeSingle();

    await upsertSyncStatusSafely(supabase, { user_id: userId, platform: 'vercel', status: 'syncing', last_sync_at: new Date().toISOString() });

    const url = new URL(request.url);
    const limit = url.searchParams.get('depth') === 'deep' ? 100 : 30;
    const headers = { Authorization: `Bearer ${accessToken}` };

    const resp = await fetch(`https://api.vercel.com/v6/deployments?limit=${limit}`, { headers, cache: 'no-store' });
    if (!resp.ok) throw new Error(`Vercel API (${resp.status}): ${(await resp.text()).slice(0, 200)}`);

    const body = (await resp.json()) as { deployments?: VercelDeployment[] };
    const deployments = body.deployments ?? [];

    const events: Record<string, unknown>[] = deployments.map((dep) => {
      const isFailed = dep.state === 'ERROR';
      return {
        user_id: userId, platform: 'vercel', platform_id: `deploy_${dep.uid}`,
        event_type: 'deployment',
        title: `${dep.target === 'production' ? '🚀 Production' : '🔧 Preview'}: ${dep.name}`,
        content: [
          `State: ${dep.state ?? 'unknown'}`,
          dep.meta?.githubCommitMessage ? `Commit: ${dep.meta.githubCommitMessage}` : '',
          dep.meta?.githubCommitRef ? `Branch: ${dep.meta.githubCommitRef}` : '',
          dep.url ? `URL: https://${dep.url}` : '',
        ].filter(Boolean).join(' | '),
        author: dep.creator?.username ?? 'Vercel',
        timestamp: new Date(dep.createdAt).toISOString(),
        is_flagged: isFailed, flag_severity: isFailed ? 'DIRECT' : 'LOW',
        flag_reason: isFailed ? 'Deployment failed' : null,
        metadata: { uid: dep.uid, url: dep.url ? `https://${dep.url}` : null, state: dep.state, target: dep.target, inspector_url: dep.inspectorUrl, github_ref: dep.meta?.githubCommitRef ?? null },
      };
    });

    if (events.length > 0) await upsertRawEventsSafely(supabase, events);

    const { count: totalMemories } = await supabase.from('memories').select('id', { count: 'exact', head: true }).eq('user_id', userId);
    const now = new Date().toISOString();
    await Promise.all([
      upsertSyncStatusSafely(supabase, { user_id: userId, platform: 'vercel', status: 'connected', sync_progress: 100, total_items: (currentStatus?.total_items ?? 0) + events.length, last_sync_at: now, next_sync_at: new Date(Date.now() + 3600000).toISOString(), error_message: null }),
      supabase.from('user_profiles').update({ memories_indexed: totalMemories ?? events.length, updated_at: now }).eq('user_id', userId),
    ]);

    return NextResponse.json({ success: true, count: events.length });
  } catch (err) {
    console.error('[Vercel Sync] Error:', err);
    await upsertSyncStatusSafely(supabase, { user_id: userId, platform: 'vercel', status: 'error', error_message: String(err).slice(0, 200) });
    return NextResponse.json({ error: 'Vercel sync failed' }, { status: 500 });
  }
}
