import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { encryptToken } from '@/services/auth/tokens';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  const clientId = process.env.TWITTER_CLIENT_ID;
  const clientSecret = process.env.TWITTER_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL('/connect/twitter?oauth=error&reason=missing_env', url.origin));
  }

  const cookieStore = await cookies();
  const expectedState = cookieStore.get('twitter_oauth_state')?.value;
  const codeVerifier = cookieStore.get('twitter_code_verifier')?.value;

  if (!expectedState || expectedState !== state || !codeVerifier) {
    return NextResponse.redirect(new URL('/connect/twitter?oauth=error&reason=invalid_state', url.origin));
  }

  cookieStore.delete('twitter_oauth_state');
  cookieStore.delete('twitter_code_verifier');

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) {
    return NextResponse.redirect(new URL('/login', url.origin));
  }

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const tokenResponse = await fetch('https://api.twitter.com/2/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${basicAuth}`
    },
    body: new URLSearchParams({
      code: code!,
      grant_type: 'authorization_code',
      redirect_uri: new URL('/api/connect/twitter/callback', url.origin).toString(),
      code_verifier: codeVerifier,
    }),
  });

  if (!tokenResponse.ok) {
    const errorBody = await tokenResponse.text();
    console.error('Twitter token exchange failed:', errorBody);
    return NextResponse.redirect(new URL('/connect/twitter?oauth=error&reason=token_exchange_failed', url.origin));
  }

  const tokenBody = await tokenResponse.json();
  const userId = authData.user.id;
  const now = new Date().toISOString();

  await Promise.all([
    supabase.from('oauth_tokens').upsert({
      user_id: userId,
      platform: 'twitter',
      access_token: encryptToken(tokenBody.access_token),
      refresh_token: tokenBody.refresh_token ? encryptToken(tokenBody.refresh_token) : null,
      expires_at: tokenBody.expires_in ? new Date(Date.now() + tokenBody.expires_in * 1000).toISOString() : null,
      created_at: now,
      updated_at: now,
    }, { onConflict: 'user_id,platform' }),
    supabase.from('sync_status').upsert({
      user_id: userId,
      platform: 'twitter',
      status: 'connected',
      sync_progress: 100,
      total_items: 0,
    }, { onConflict: 'user_id,platform' })
  ]);

  return NextResponse.redirect(new URL('/connect/twitter?oauth=success', url.origin));
}
