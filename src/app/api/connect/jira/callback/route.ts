import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { encryptToken } from '@/services/auth/tokens';
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const clientId = process.env.JIRA_CLIENT_ID?.trim();
  const clientSecret = process.env.JIRA_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return NextResponse.redirect(new URL('/connect/jira?oauth=error&reason=missing_env', url.origin));
  const cookieStore = await cookies();
  const expectedState = cookieStore.get('jira_oauth_state')?.value;
  if (!expectedState || expectedState !== state || !code) return NextResponse.redirect(new URL('/connect/jira?oauth=error&reason=invalid_state', url.origin));
  cookieStore.delete('jira_oauth_state');
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return NextResponse.redirect(new URL('/login', url.origin));
  const tokenResp = await fetch('https://api.jira.com/oauth/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code, client_id: clientId, client_secret: clientSecret, redirect_uri: new URL('/api/connect/jira/callback', url.origin).toString(), grant_type: 'authorization_code'
    }),
  });
  if (!tokenResp.ok) return NextResponse.redirect(new URL('/connect/jira?oauth=error&reason=token_exchange_failed', url.origin));
  const tokenBody = await tokenResp.json();
  const userId = authData.user.id;
  const now = new Date().toISOString();
  await Promise.all([
    supabase.from('oauth_tokens').upsert({
      user_id: userId, platform: 'jira', access_token: encryptToken(tokenBody.access_token), refresh_token: tokenBody.refresh_token ? encryptToken(tokenBody.refresh_token) : null, expires_at: tokenBody.expires_in ? new Date(Date.now() + tokenBody.expires_in * 1000).toISOString() : null, scope: 'read', created_at: now, updated_at: now
    }, { onConflict: 'user_id,platform' }),
    supabase.from('sync_status').upsert({
      user_id: userId, platform: 'jira', status: 'idle', sync_progress: 0, total_items: 0, updated_at: now
    }, { onConflict: 'user_id,platform' })
  ]);
  return NextResponse.redirect(new URL('/connect/jira?oauth=success', url.origin));
}