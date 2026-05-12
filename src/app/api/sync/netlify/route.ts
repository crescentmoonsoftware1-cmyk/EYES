import { NextResponse } from 'next/server';
import { resolveSyncActor } from '@/utils/sync/actor';
import { upsertRawEventsSafely, upsertSyncStatusSafely } from '@/utils/supabase/upsert';
import { decryptToken } from '@/utils/tokens';

type NetlifySite = { id: string; name: string; url?: string; custom_domain?: string | null; created_at?: string; updated_at?: string; published_deploy?: { id?: string; state?: string; created_at?: string } };
type NetlifyDeploy = { id: string; site_id: string; site_name?: string; state?: string; branch?: string; title?: string; created_at?: string; error_message?: string | null };

export async function POST(request: Request) {
  const actor = await resolveSyncActor(request);
  if ('status' in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  const { supabase, userId } = actor;
  try {
    const { data: tokenRow } = await supabase.from('oauth_tokens').select('access_token').eq('user_id', userId).eq('platform', 'netlify').maybeSingle();
    if (!tokenRow?.access_token) return NextResponse.json({ error: 'Netlify is not connected.' }, { status: 401 });
    const { data: currentStatus } = await supabase.from('sync_status').select('total_items').eq('user_id', userId).eq('platform', 'netlify').maybeSingle();
    await upsertSyncStatusSafely(supabase, { user_id: userId, platform: 'netlify', status: 'syncing', last_sync_at: new Date().toISOString() });
    const accessToken = decryptToken(tokenRow.access_token);
    const headers = { Authorization: `Bearer ${accessToken}` };
    const url = new URL(request.url);
    const deep = url.searchParams.get('depth') === 'deep';
    const [sitesResp, deploysResp] = await Promise.all([
      fetch('https://api.netlify.com/api/v1/sites?per_page=20', { headers, cache: 'no-store' }),
      fetch(`https://api.netlify.com/api/v1/deploys?per_page=${deep ? 50 : 20}`, { headers, cache: 'no-store' }),
    ]);
    if (!sitesResp.ok) throw new Error(`Netlify sites API (${sitesResp.status})`);
    const sites = (await sitesResp.json()) as NetlifySite[];
    const deploys: NetlifyDeploy[] = deploysResp.ok ? await deploysResp.json() : [];
    const events: Record<string, unknown>[] = [
      ...sites.map((site) => ({
        user_id: userId, platform: 'netlify', platform_id: `site_${site.id}`,
        event_type: 'site', title: site.name,
        content: `Site: ${site.name} | URL: ${site.custom_domain || site.url || 'n/a'}`,
        author: 'Netlify', timestamp: site.updated_at || site.created_at || new Date().toISOString(),
        is_flagged: false, flag_severity: 'LOW', flag_reason: null,
        metadata: { site_id: site.id, url: site.custom_domain || site.url, deploy_state: site.published_deploy?.state },
      })),
      ...deploys.map((dep) => {
        const isFailed = dep.state === 'error';
        return {
          user_id: userId, platform: 'netlify', platform_id: `deploy_${dep.id}`,
          event_type: 'deployment', title: `${dep.site_name ?? 'Site'}: ${dep.title ?? dep.branch ?? 'deploy'}`,
          content: `State: ${dep.state} | Branch: ${dep.branch ?? 'main'}${dep.error_message ? ` | Error: ${dep.error_message}` : ''}`,
          author: 'Netlify', timestamp: dep.created_at || new Date().toISOString(),
          is_flagged: isFailed, flag_severity: isFailed ? 'DIRECT' : 'LOW', flag_reason: isFailed ? dep.error_message ?? 'Deploy failed' : null,
          metadata: { deploy_id: dep.id, site_id: dep.site_id, state: dep.state, branch: dep.branch },
        };
      }),
    ];
    if (events.length > 0) await upsertRawEventsSafely(supabase, events);
    const { count: totalMemories } = await supabase.from('memories').select('id', { count: 'exact', head: true }).eq('user_id', userId);
    const now = new Date().toISOString();
    await Promise.all([
      upsertSyncStatusSafely(supabase, { user_id: userId, platform: 'netlify', status: 'connected', sync_progress: 100, total_items: (currentStatus?.total_items ?? 0) + events.length, last_sync_at: now, next_sync_at: new Date(Date.now() + 3600000).toISOString(), error_message: null }),
      supabase.from('user_profiles').update({ memories_indexed: totalMemories ?? events.length, updated_at: now }).eq('user_id', userId),
    ]);
    return NextResponse.json({ success: true, sites: sites.length, deploys: deploys.length, count: events.length });
  } catch (err) {
    console.error('[Netlify Sync] Error:', err);
    await upsertSyncStatusSafely(supabase, { user_id: userId, platform: 'netlify', status: 'error', error_message: String(err).slice(0, 200) });
    return NextResponse.json({ error: 'Netlify sync failed' }, { status: 500 });
  }
}
