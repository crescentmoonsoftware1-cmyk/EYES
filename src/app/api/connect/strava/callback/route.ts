import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { encryptToken } from '@/services/auth/tokens';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const clientId = process.env.STRAVA_CLIENT_ID?.trim();
  const clientSecret = process.env.STRAVA_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return NextResponse.redirect(new URL('/connect/strava?oauth=error&reason=missing_env', url.origin));
  const cookieStore = await cookies();
  const expectedState = cookieStore.get('strava_oauth_state')?.value;
  if (!expectedState || expectedState !== state || !code) return NextResponse.redirect(new URL('/connect/strava?oauth=error&reason=invalid_state', url.origin));
  cookieStore.delete('strava_oauth_state');
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return NextResponse.redirect(new URL('/login', url.origin));
  const tokenResp = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code, grant_type: 'authorization_code' }),
  });
  if (!tokenResp.ok) return NextResponse.redirect(new URL('/connect/strava?oauth=error&reason=token_exchange_failed', url.origin));
  const tokenBody = await tokenResp.json();
  const now = new Date().toISOString();
  await Promise.all([
    supabase.from('oauth_tokens').upsert({ user_id: authData.user.id, platform: 'strava', access_token: encryptToken(String(tokenBody.access_token)), refresh_token: tokenBody.refresh_token ? encryptToken(tokenBody.refresh_token) : null, expires_at: tokenBody.expires_at ? new Date(tokenBody.expires_at * 1000).toISOString() : null, created_at: now, updated_at: now }, { onConflict: 'user_id,platform' }),
    supabase.from('sync_status').upsert({ user_id: authData.user.id, platform: 'strava', status: 'idle', sync_progress: 0, total_items: 0, updated_at: now }, { onConflict: 'user_id,platform' }),
  ]);
  return NextResponse.redirect(new URL('/connect/strava?oauth=success', url.origin));
}
