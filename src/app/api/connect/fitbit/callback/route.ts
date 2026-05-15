import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { encryptToken } from '@/services/auth/tokens';

function appBaseUrl() { return process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'; }

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const clientId = process.env.FITBIT_CLIENT_ID;
  const clientSecret = process.env.FITBIT_CLIENT_SECRET;
  if (!clientId || !clientSecret) return NextResponse.redirect(new URL('/connect/fitbit?oauth=error&reason=missing_env', appBaseUrl()));
  const cookieStore = await cookies();
  const expectedState = cookieStore.get('fitbit_oauth_state')?.value;
  const codeVerifier = cookieStore.get('fitbit_code_verifier')?.value;
  if (!expectedState || expectedState !== state || !code || !codeVerifier) return NextResponse.redirect(new URL('/connect/fitbit?oauth=error&reason=invalid_state', appBaseUrl()));
  cookieStore.delete('fitbit_oauth_state');
  cookieStore.delete('fitbit_code_verifier');
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return NextResponse.redirect(new URL('/login', appBaseUrl()));
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const tokenResp = await fetch('https://api.fitbit.com/oauth2/token', {
    method: 'POST',
    headers: { Authorization: `Basic ${basicAuth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, redirect_uri: new URL('/api/connect/fitbit/callback', appBaseUrl()).toString(), grant_type: 'authorization_code', code_verifier: codeVerifier }),
  });
  if (!tokenResp.ok) return NextResponse.redirect(new URL('/connect/fitbit?oauth=error&reason=token_exchange_failed', appBaseUrl()));
  const tokenBody = await tokenResp.json();
  const now = new Date().toISOString();
  await Promise.all([
    supabase.from('oauth_tokens').upsert({ user_id: authData.user.id, platform: 'fitbit', access_token: encryptToken(tokenBody.access_token), refresh_token: tokenBody.refresh_token ? encryptToken(tokenBody.refresh_token) : null, expires_at: tokenBody.expires_in ? new Date(Date.now() + tokenBody.expires_in * 1000).toISOString() : null, scope: tokenBody.scope, created_at: now, updated_at: now }, { onConflict: 'user_id,platform' }),
    supabase.from('sync_status').upsert({ user_id: authData.user.id, platform: 'fitbit', status: 'idle', sync_progress: 0, total_items: 0, updated_at: now }, { onConflict: 'user_id,platform' }),
  ]);
  return NextResponse.redirect(new URL('/connect/fitbit?oauth=success', appBaseUrl()));
}
