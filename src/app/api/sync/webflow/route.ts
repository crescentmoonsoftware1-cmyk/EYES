import { NextResponse } from 'next/server';
import { resolveSyncActor } from '@/utils/sync/actor';
import { upsertRawEventsSafely, upsertSyncStatusSafely } from '@/utils/supabase/upsert';
import { decryptToken } from '@/services/auth/tokens';

type WebflowSite = { id: string; displayName?: string; shortName?: string; lastUpdated?: string; createdOn?: string; previewUrl?: string };
type WebflowPage = { id: string; slug?: string; title?: string; lastUpdated?: string; createdOn?: string; publishedPath?: string };

export async function POST(request: Request) {
  const actor = await resolveSyncActor(request);
  if ('status' in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  const { supabase, userId } = actor;
  try {
    const { data: tokenRow } = await supabase.from('oauth_tokens').select('access_token').eq('user_id', userId).eq('platform', 'webflow').maybeSingle();
    if (!tokenRow?.access_token) return NextResponse.json({ error: 'Webflow is not connected.' }, { status: 401 });
    const { data: currentStatus } = await supabase.from('sync_status').select('total_items').eq('user_id', userId).eq('platform', 'webflow').maybeSingle();
    await upsertSyncStatusSafely(supabase, { user_id: userId, platform: 'webflow', status: 'syncing', last_sync_at: new Date().toISOString() });
    const accessToken = decryptToken(tokenRow.access_token);
    const headers = { Authorization: `Bearer ${accessToken}`, 'accept-version': '2.0.0' };
    const sitesResp = await fetch('https://api.webflow.com/v2/sites', { headers, cache: 'no-store' });
    if (!sitesResp.ok) throw new Error(`Webflow sites API (${sitesResp.status})`);
    const siteBody = await sitesResp.json() as { sites?: WebflowSite[] };
    const sites = siteBody.sites ?? [];
    const events: Record<string, unknown>[] = [];
    for (const site of sites.slice(0, 10)) {
      events.push({ user_id: userId, platform: 'webflow', platform_id: `site_${site.id}`, event_type: 'site', title: site.displayName || site.shortName || 'Webflow Site', content: `Webflow site: ${site.displayName || site.shortName}`, author: 'Webflow', timestamp: site.lastUpdated || site.createdOn || new Date().toISOString(), is_flagged: false, flag_severity: 'LOW', flag_reason: null, metadata: { site_id: site.id, short_name: site.shortName, preview_url: site.previewUrl } });
      const pagesResp = await fetch(`https://api.webflow.com/v2/sites/${site.id}/pages`, { headers, cache: 'no-store' });
      if (!pagesResp.ok) continue;
      const pageBody = await pagesResp.json() as { pages?: WebflowPage[] };
      for (const page of (pageBody.pages ?? []).slice(0, 20)) {
        events.push({ user_id: userId, platform: 'webflow', platform_id: `page_${page.id}`, event_type: 'page', title: page.title || page.slug || 'Untitled Page', content: `Page: ${page.title || page.slug} | Path: ${page.publishedPath || `/${page.slug}`}`, author: 'Webflow', timestamp: page.lastUpdated || page.createdOn || new Date().toISOString(), is_flagged: false, flag_severity: 'LOW', flag_reason: null, metadata: { page_id: page.id, site_id: site.id, site_name: site.displayName, slug: page.slug } });
      }
    }
    if (events.length > 0) await upsertRawEventsSafely(supabase, events);
    const { count: totalMemories } = await supabase.from('memories').select('id', { count: 'exact', head: true }).eq('user_id', userId);
    const now = new Date().toISOString();
    await Promise.all([
      upsertSyncStatusSafely(supabase, { user_id: userId, platform: 'webflow', status: 'connected', sync_progress: 100, total_items: (currentStatus?.total_items ?? 0) + events.length, last_sync_at: now, next_sync_at: new Date(Date.now() + 3600000).toISOString(), error_message: null }),
      supabase.from('user_profiles').update({ memories_indexed: totalMemories ?? events.length, updated_at: now }).eq('user_id', userId),
    ]);
    return NextResponse.json({ success: true, sites: sites.length, count: events.length });
  } catch (err) {
    console.error('[Webflow Sync] Error:', err);
    await upsertSyncStatusSafely(supabase, { user_id: userId, platform: 'webflow', status: 'error', error_message: String(err).slice(0, 200) });
    return NextResponse.json({ error: 'Webflow sync failed' }, { status: 500 });
  }
}
