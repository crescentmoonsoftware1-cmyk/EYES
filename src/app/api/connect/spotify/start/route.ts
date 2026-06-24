import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getBaseUrl } from '@/utils/url';

function spotifyRedirectUri(baseUrl: string) {
  const explicit = process.env.SPOTIFY_REDIRECT_URI?.trim();
  if (explicit) return explicit;
  return new URL('/api/connect/spotify/callback', baseUrl).toString();
}

export async function GET(request: Request) {
  const baseUrl = await getBaseUrl(request);
  const clientId = process.env.SPOTIFY_CLIENT_ID?.trim();

  if (!clientId) {
    return NextResponse.redirect(new URL('/connect/spotify?oauth=error&reason=missing_client_id', baseUrl));
  }

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();

  if (!authData?.user) {
    return NextResponse.redirect(new URL('/login', baseUrl));
  }

  const state = crypto.randomBytes(32).toString('hex');
  const cookieStore = await cookies();
  cookieStore.set('spotify_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 10,
    path: '/',
    sameSite: 'lax',
  });

  const redirectUri = spotifyRedirectUri(baseUrl);
  const scope = 'user-read-recently-played user-top-read user-read-playback-state';

  const authUrl = new URL('https://accounts.spotify.com/authorize');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('scope', scope);

  return NextResponse.redirect(authUrl.toString());
}
