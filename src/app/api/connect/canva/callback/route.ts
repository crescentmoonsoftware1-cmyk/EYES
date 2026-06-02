import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { encryptToken } from '@/services/auth/tokens';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const clientId = process.env.CANVA_CLIENT_ID;
  const clientSecret = process.env.CANVA_CLIENT_SECRET;
  if (!clientId || !clientSecret) return NextResponse.redirect(new URL('/connect/canva?oauth=error&reason=missing_env', url.origin));
  const cookieStore = await cookies();
  const expectedState = cookieStore.get('canva_oauth_state')?.value;
  const codeVerifier = cookieStore.get('canva_code_verifier')?.value;
  if (!expectedState || expectedState !== state || !code || !codeVerifier) return NextResponse.redirect(new URL('/connect/canva?oauth=error&reason=invalid_state', url.origin));
  cookieStore.delete('canva_oauth_state');
  cookieStore.delete('canva_code_verifier');
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return NextResponse.redirect(new URL('/login', url.origin));
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const tokenResp = await fetch('https://api.canva.com/rest/v1/oauth/token', {
    method: 'POST',
    headers: { Authorization: `Basic ${basicAuth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, redirect_uri: new URL('/api/connect/canva/callback', url.origin).toString(), grant_type: 'authorization_code', code_verifier: codeVerifier }),
  });
  if (!tokenResp.ok) return NextResponse.redirect(new URL('/connect/canva?oauth=error&reason=token_exchange_failed', url.origin));
  const tokenBody = await tokenResp.json();
  const now = new Date().toISOString();
  await Promise.all([
    supabase.from('oauth_tokens').upsert({ user_id: authData.user.id, platform: 'canva', access_token: encryptToken(tokenBody.access_token), refresh_token: tokenBody.refresh_token ? encryptToken(tokenBody.refresh_token) : null, expires_at: tokenBody.expires_in ? new Date(Date.now() + tokenBody.expires_in * 1000).toISOString() : null, created_at: now, updated_at: now }, { onConflict: 'user_id,platform' }),
    supabase.from('sync_status').upsert({ user_id: authData.user.id, platform: 'canva', status: 'idle', sync_progress: 0, total_items: 0, updated_at: now }, { onConflict: 'user_id,platform' }),
  ]);
  return NextResponse.redirect(new URL('/connect/canva?oauth=success', url.origin));
}
