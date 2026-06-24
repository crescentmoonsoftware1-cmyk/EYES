import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getBaseUrl } from '@/utils/url';

function redditRedirectUri(baseUrl: string) {
  const explicit = process.env.REDDIT_REDIRECT_URI?.trim();
  if (explicit) return explicit;
  return new URL('/api/connect/reddit/callback', baseUrl).toString();
}

export async function GET(request: Request) {
  const baseUrl = await getBaseUrl(request);
  const clientId = process.env.REDDIT_CLIENT_ID?.trim();

  if (!clientId) {
    return NextResponse.redirect(new URL('/connect/reddit?oauth=error&reason=missing_reddit_client_id', baseUrl));
  }

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();

  if (!authData.user) {
    return NextResponse.redirect(new URL('/login', baseUrl));
  }

  const state = crypto.randomUUID();
  const cookieStore = await cookies();
  cookieStore.set('reddit_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 10,
  });

  const callbackUrl = redditRedirectUri(baseUrl);
  const authUrl = new URL('https://www.reddit.com/api/v1/authorize');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('redirect_uri', callbackUrl);
  authUrl.searchParams.set('duration', 'permanent');
  authUrl.searchParams.set('scope', 'identity history read mysubreddits');

  return NextResponse.redirect(authUrl);
}
