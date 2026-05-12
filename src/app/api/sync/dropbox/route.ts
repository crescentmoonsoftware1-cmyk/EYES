import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveSyncActor } from '@/utils/sync/actor';
import { upsertRawEventsSafely, upsertSyncStatusSafely } from '@/utils/supabase/upsert';
import { decryptToken, encryptToken } from '@/utils/tokens';

type DropboxFile = {
  '.tag': string; id: string; name: string; path_display: string;
  size?: number; server_modified?: string; client_modified?: string;
};
type DropboxListResponse = { entries?: DropboxFile[]; cursor?: string; has_more?: boolean };

async function refreshDropboxToken(supabase: SupabaseClient, userId: string, refreshToken: string) {
  const clientId = process.env.DROPBOX_CLIENT_ID!;
  const clientSecret = process.env.DROPBOX_CLIENT_SECRET!;
  const resp = await fetch('https://api.dropboxapi.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret }),
  });
  if (!resp.ok) return null;
  const body = await resp.json();
  if (!body.access_token) return null;
  await supabase.from('oauth_tokens').update({
    access_token: encryptToken(body.access_token),
    expires_at: body.expires_in ? new Date(Date.now() + body.expires_in * 1000).toISOString() : null,
    updated_at: new Date().toISOString(),
  }).eq('user_id', userId).eq('platform', 'dropbox');
  return body.access_token as string;
}

export async function POST(request: Request) {
  const actor = await resolveSyncActor(request);
  if ('status' in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  const { supabase, userId } = actor;

  try {
    const { data: tokenRow } = await supabase.from('oauth_tokens').select('access_token,refresh_token,expires_at').eq('user_id', userId).eq('platform', 'dropbox').maybeSingle();
    if (!tokenRow?.access_token) return NextResponse.json({ error: 'Dropbox is not connected.' }, { status: 401 });

    const { data: currentStatus } = await supabase.from('sync_status').select('total_items,cursor').eq('user_id', userId).eq('platform', 'dropbox').maybeSingle();

    await upsertSyncStatusSafely(supabase, { user_id: userId, platform: 'dropbox', status: 'syncing', last_sync_at: new Date().toISOString() });

    // Refresh token if close to expiry
    let accessToken = decryptToken(tokenRow.access_token);
    if (tokenRow.expires_at && tokenRow.refresh_token) {
      const expiresAt = new Date(tokenRow.expires_at);
      if (expiresAt.getTime() - Date.now() < 5 * 60 * 1000) {
        const newToken = await refreshDropboxToken(supabase, userId, decryptToken(tokenRow.refresh_token));
        if (newToken) accessToken = newToken;
      }
    }

    const url = new URL(request.url);
    const deep = url.searchParams.get('depth') === 'deep';
    const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };

    // List folder (use cursor for incremental sync)
    const listBody = currentStatus?.cursor
      ? JSON.stringify({ cursor: currentStatus.cursor })
      : JSON.stringify({ path: '', recursive: true, include_media_info: false, include_deleted: false, include_has_explicit_shared_members: false, limit: deep ? 500 : 100 });

    const listEndpoint = currentStatus?.cursor
      ? 'https://api.dropboxapi.com/2/files/list_folder/continue'
      : 'https://api.dropboxapi.com/2/files/list_folder';

    const listResp = await fetch(listEndpoint, { method: 'POST', headers, body: listBody, cache: 'no-store' });
    if (!listResp.ok) throw new Error(`Dropbox API (${listResp.status}): ${(await listResp.text()).slice(0, 200)}`);

    const listData = (await listResp.json()) as DropboxListResponse;
    const files = (listData.entries ?? []).filter((e) => e['.tag'] === 'file');

    const events: Record<string, unknown>[] = files.map((file) => {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
      const isDoc = ['pdf', 'doc', 'docx', 'txt', 'md', 'csv', 'xlsx'].includes(ext);
      return {
        user_id: userId, platform: 'dropbox', platform_id: file.id,
        event_type: 'file', title: file.name,
        content: `File: ${file.name} | Path: ${file.path_display}${file.size ? ` | Size: ${Math.round(file.size / 1024)}KB` : ''}`,
        author: 'Dropbox', timestamp: file.server_modified || file.client_modified || new Date().toISOString(),
        is_flagged: false, flag_severity: 'LOW', flag_reason: null,
        metadata: { path: file.path_display, size: file.size ?? null, is_document: isDoc, extension: ext },
      };
    });

    if (events.length > 0) await upsertRawEventsSafely(supabase, events);

    const { count: totalMemories } = await supabase.from('memories').select('id', { count: 'exact', head: true }).eq('user_id', userId);
    const now = new Date().toISOString();
    await Promise.all([
      upsertSyncStatusSafely(supabase, { user_id: userId, platform: 'dropbox', status: 'connected', sync_progress: 100, total_items: (currentStatus?.total_items ?? 0) + events.length, last_sync_at: now, next_sync_at: new Date(Date.now() + 3600000).toISOString(), cursor: listData.cursor ?? null, error_message: null }),
      supabase.from('user_profiles').update({ memories_indexed: totalMemories ?? events.length, updated_at: now }).eq('user_id', userId),
    ]);

    return NextResponse.json({ success: true, count: events.length, hasMore: listData.has_more ?? false });
  } catch (err) {
    console.error('[Dropbox Sync] Error:', err);
    await upsertSyncStatusSafely(supabase, { user_id: userId, platform: 'dropbox', status: 'error', error_message: String(err).slice(0, 200) });
    return NextResponse.json({ error: 'Dropbox sync failed' }, { status: 500 });
  }
}
