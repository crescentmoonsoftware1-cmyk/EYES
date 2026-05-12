import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { encryptToken } from '@/utils/tokens';

function appBaseUrl() { return process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'; }

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const clientId = process.env.SENTRY_CLIENT_ID;
  const clientSecret = process.env.SENTRY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return NextResponse.redirect(new URL('/connect/sentry?oauth=error&reason=missing_env', appBaseUrl()));
  const cookieStore = await cookies();
  const expectedState = cookieStore.get('sentry_oauth_state')?.value;
  if (!expectedState || expectedState !== state || !code) return NextResponse.redirect(new URL('/connect/sentry?oauth=error&reason=invalid_state', appBaseUrl()));
  cookieStore.delete('sentry_oauth_state');
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return NextResponse.redirect(new URL('/login', appBaseUrl()));

  const tokenResp = await fetch('https://sentry.io/oauth/token/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code, client_id: clientId, client_secret: clientSecret,
      redirect_uri: new URL('/api/connect/sentry/callback', appBaseUrl()).toString(),
      grant_type: 'authorization_code',
    }),
  });
  if (!tokenResp.ok) return NextResponse.redirect(new URL('/connect/sentry?oauth=error&reason=token_exchange_failed', appBaseUrl()));
  const tokenBody = await tokenResp.json();
  const now = new Date().toISOString();
  await Promise.all([
    supabase.from('oauth_tokens').upsert({
      user_id: authData.user.id, platform: 'sentry',
      access_token: encryptToken(tokenBody.access_token),
      refresh_token: tokenBody.refresh_token ? encryptToken(tokenBody.refresh_token) : null,
      expires_at: tokenBody.expires_in ? new Date(Date.now() + tokenBody.expires_in * 1000).toISOString() : null,
      created_at: now, updated_at: now,
    }, { onConflict: 'user_id,platform' }),
    supabase.from('sync_status').upsert({
      user_id: authData.user.id, platform: 'sentry',
      status: 'idle', sync_progress: 0, total_items: 0, updated_at: now,
    }, { onConflict: 'user_id,platform' }),
  ]);
  return NextResponse.redirect(new URL('/connect/sentry?oauth=success', appBaseUrl()));
}
