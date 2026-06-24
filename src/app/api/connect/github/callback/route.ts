import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { createClient } from '@/utils/supabase/server';
import { encryptToken } from '@/services/auth/tokens';

type GitHubTokenResponse = {
  access_token?: string;
  token_type?: string;
  scope?: string;
  error?: string;
  error_description?: string;
};

function getAppBaseUrl(request: Request) {
  const host = request.headers.get('host') || 'localhost:3000';
  if (host.includes('localhost') || host.includes('127.0.0.1')) {
    return `http://${host}`;
  }
  return process.env.NEXT_PUBLIC_SITE_URL || `https://${host}`;
}

function githubRedirectUri(request: Request) {
  const explicit = process.env.GITHUB_REDIRECT_URI?.trim();
  if (explicit) return explicit;
  return new URL('/api/connect/github/callback', getAppBaseUrl(request)).toString();
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  const clientId = process.env.GITHUB_CLIENT_ID?.trim();
  const clientSecret = process.env.GITHUB_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL('/connect/github?oauth=error&reason=missing_github_env', getAppBaseUrl(request)));
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL('/connect/github?oauth=error&reason=missing_code_or_state', getAppBaseUrl(request)));
  }

  const cookieStore = await cookies();
  const expectedState = cookieStore.get('github_oauth_state')?.value;

  if (!expectedState || expectedState !== state) {
    return NextResponse.redirect(new URL('/connect/github?oauth=error&reason=invalid_state', getAppBaseUrl(request)));
  }

  cookieStore.delete('github_oauth_state');

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();

  if (!authData.user) {
    return NextResponse.redirect(new URL('/login', getAppBaseUrl(request)));
  }

  const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      state,
      redirect_uri: githubRedirectUri(request),
    }),
    cache: 'no-store',
  });

  if (!tokenResponse.ok) {
    return NextResponse.redirect(new URL('/connect/github?oauth=error&reason=token_exchange_failed', getAppBaseUrl(request)));
  }

  const tokenBody = (await tokenResponse.json()) as GitHubTokenResponse;

  if (!tokenBody.access_token) {
    return NextResponse.redirect(new URL(`/connect/github?oauth=error&reason=${encodeURIComponent(tokenBody.error || 'no_access_token')}`, getAppBaseUrl(request)));
  }

  const now = new Date().toISOString();
  const userId = authData.user.id;

  const [{ error: tokenSaveError }, { error: syncSaveError }] = await Promise.all([
    supabase.from('oauth_tokens').upsert({
      user_id: userId,
      platform: 'github',
      access_token: encryptToken(tokenBody.access_token),
      refresh_token: null,
      scope: tokenBody.scope || 'read:user repo',
      expires_at: null,
      created_at: now,
    }, { onConflict: 'user_id,platform' }),
    supabase.from('sync_status').upsert({
      user_id: userId,
      platform: 'github',
      status: 'authenticating',
      sync_progress: 5,
      total_items: 0,
      last_sync_at: null,
      next_sync_at: null,
      error_message: null,
    }, { onConflict: 'user_id,platform' }),
  ]);

  if (tokenSaveError || syncSaveError) {
    return NextResponse.redirect(new URL('/connect/github?oauth=error&reason=token_persist_failed', getAppBaseUrl(request)));
  }

  // Sync is triggered by cron (runs every 5 minutes)
  // Returning immediately gives faster user feedback
  return NextResponse.redirect(new URL('/connect/github?oauth=success', getAppBaseUrl(request)));
}
