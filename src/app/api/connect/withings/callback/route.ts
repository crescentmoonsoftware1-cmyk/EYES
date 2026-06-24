import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { encryptToken } from '@/services/auth/tokens';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const clientId = process.env.WITHINGS_CLIENT_ID?.trim();
  const clientSecret = process.env.WITHINGS_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return NextResponse.redirect(new URL('/connect/withings?oauth=error&reason=missing_env', url.origin));
  const cookieStore = await cookies();
  const expectedState = cookieStore.get('withings_oauth_state')?.value;
  if (!expectedState || expectedState !== state || !code) return NextResponse.redirect(new URL('/connect/withings?oauth=error&reason=invalid_state', url.origin));
  cookieStore.delete('withings_oauth_state');
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return NextResponse.redirect(new URL('/login', url.origin));
  const tokenResp = await fetch('https://wbsapi.withings.net/v2/oauth2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ action: 'requesttoken', grant_type: 'authorization_code', client_id: clientId, client_secret: clientSecret, code, redirect_uri: new URL('/api/connect/withings/callback', url.origin).toString() }),
  });
  if (!tokenResp.ok) return NextResponse.redirect(new URL('/connect/withings?oauth=error&reason=token_exchange_failed', url.origin));
  const tokenBody = await tokenResp.json();
  const token = tokenBody.body;
  if (!token?.access_token) return NextResponse.redirect(new URL('/connect/withings?oauth=error&reason=no_token', url.origin));
  const now = new Date().toISOString();
  await Promise.all([
    supabase.from('oauth_tokens').upsert({ user_id: authData.user.id, platform: 'withings', access_token: encryptToken(token.access_token), refresh_token: token.refresh_token ? encryptToken(token.refresh_token) : null, expires_at: token.expires_in ? new Date(Date.now() + token.expires_in * 1000).toISOString() : null, scope: token.scope, created_at: now, updated_at: now }, { onConflict: 'user_id,platform' }),
    supabase.from('sync_status').upsert({ user_id: authData.user.id, platform: 'withings', status: 'idle', sync_progress: 0, total_items: 0, updated_at: now }, { onConflict: 'user_id,platform' }),
  ]);
  return NextResponse.redirect(new URL('/connect/withings?oauth=success', url.origin));
}
