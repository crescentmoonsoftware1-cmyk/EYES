import { NextResponse } from 'next/server';
import { resolveSyncActor } from '@/utils/sync/actor';
import { upsertRawEventsSafely, upsertSyncStatusSafely } from '@/utils/supabase/upsert';
import { decryptToken, encryptToken } from '@/services/auth/tokens';

type CanvaDesign = { id: string; title?: string; created_at?: string; updated_at?: string; thumbnail?: { url?: string }; urls?: { view_url?: string } };

export async function POST(request: Request) {
  const actor = await resolveSyncActor(request);
  if ('status' in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  const { supabase, userId } = actor;
  try {
    const { data: tokenRow } = await supabase.from('oauth_tokens').select('access_token,refresh_token,expires_at').eq('user_id', userId).eq('platform', 'canva').maybeSingle();
    if (!tokenRow?.access_token) return NextResponse.json({ error: 'Canva is not connected.' }, { status: 401 });
    const { data: currentStatus } = await supabase.from('sync_status').select('total_items').eq('user_id', userId).eq('platform', 'canva').maybeSingle();
    await upsertSyncStatusSafely(supabase, { user_id: userId, platform: 'canva', status: 'syncing', last_sync_at: new Date().toISOString() });

    let accessToken = decryptToken(tokenRow.access_token) || '';
    // Refresh if needed
    if (tokenRow.expires_at && new Date(tokenRow.expires_at).getTime() - Date.now() < 300000 && tokenRow.refresh_token) {
      // encryptToken imported statically at top
      const basicAuth = Buffer.from(`${process.env.CANVA_CLIENT_ID}:${process.env.CANVA_CLIENT_SECRET}`).toString('base64');
      const rr = await fetch('https://api.canva.com/rest/v1/oauth/token', { method: 'POST', headers: { Authorization: `Basic ${basicAuth}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: decryptToken(tokenRow.refresh_token) || '' }) });
      if (rr.ok) { const rb = await rr.json(); accessToken = rb.access_token; await supabase.from('oauth_tokens').update({ access_token: encryptToken(rb.access_token), refresh_token: rb.refresh_token ? encryptToken(rb.refresh_token) : tokenRow.refresh_token, expires_at: rb.expires_in ? new Date(Date.now() + rb.expires_in * 1000).toISOString() : null, updated_at: new Date().toISOString() }).eq('user_id', userId).eq('platform', 'canva'); }
    }

    const url = new URL(request.url);
    const limit = url.searchParams.get('depth') === 'deep' ? 50 : 20;
    const headers = { Authorization: `Bearer ${accessToken}` };
    const designsResp = await fetch(`https://api.canva.com/rest/v1/designs?limit=${limit}`, { headers, cache: 'no-store' });
    if (!designsResp.ok) throw new Error(`Canva API (${designsResp.status}): ${(await designsResp.text()).slice(0, 200)}`);
    const body = await designsResp.json() as { items?: CanvaDesign[] };
    const designs = body.items ?? [];

    const events: Record<string, unknown>[] = designs.map((d) => ({
      user_id: userId, platform: 'canva', platform_id: `design_${d.id}`,
      event_type: 'design', title: d.title || 'Untitled Design',
      content: `Canva design: ${d.title || 'Untitled'}`,
      author: 'Canva', timestamp: d.updated_at || d.created_at || new Date().toISOString(),
      is_flagged: false, flag_severity: 'LOW', flag_reason: null,
      metadata: { design_id: d.id, thumbnail_url: d.thumbnail?.url ?? null, view_url: d.urls?.view_url ?? null },
    }));

    if (events.length > 0) await upsertRawEventsSafely(supabase, events);
    const { count: totalMemories } = await supabase.from('memories').select('id', { count: 'exact', head: true }).eq('user_id', userId);
    const now = new Date().toISOString();
    await Promise.all([
      upsertSyncStatusSafely(supabase, { user_id: userId, platform: 'canva', status: 'connected', sync_progress: 100, total_items: (currentStatus?.total_items ?? 0) + events.length, last_sync_at: now, next_sync_at: new Date(Date.now() + 3600000).toISOString(), error_message: null }),
      supabase.from('user_profiles').update({ memories_indexed: totalMemories ?? events.length, updated_at: now }).eq('user_id', userId),
    ]);
    return NextResponse.json({ success: true, count: events.length });
  } catch (err) {
    console.error('[Canva Sync] Error:', err);
    await upsertSyncStatusSafely(supabase, { user_id: userId, platform: 'canva', status: 'error', error_message: String(err).slice(0, 200) });
    return NextResponse.json({ error: 'Canva sync failed' }, { status: 500 });
  }
}
