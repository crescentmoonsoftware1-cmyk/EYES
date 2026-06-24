import crypto from 'node:crypto';

import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { createClient } from '@/utils/supabase/server';

import { getBaseUrl } from '@/utils/url';

function githubRedirectUri(baseUrl: string) {
  const explicit = process.env.GITHUB_REDIRECT_URI?.trim();
  if (explicit) return explicit;
  return new URL('/api/connect/github/callback', baseUrl).toString();
}

export async function GET(request: Request) {
  const baseUrl = await getBaseUrl(request);
  const clientId = process.env.GITHUB_CLIENT_ID?.trim();

  if (!clientId) {
    return NextResponse.redirect(new URL('/connect/github?oauth=error&reason=missing_client_id', baseUrl));
  }

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();

  if (!authData.user) {
    return NextResponse.redirect(new URL('/login', baseUrl));
  }

  const state = crypto.randomUUID();
  const cookieStore = await cookies();
  cookieStore.set('github_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 10,
  });

  const callbackUrl = githubRedirectUri(baseUrl);
  const authUrl = new URL('https://github.com/login/oauth/authorize');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', callbackUrl);
  authUrl.searchParams.set('scope', 'read:user repo');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('allow_signup', 'false');

  return NextResponse.redirect(authUrl);
}
