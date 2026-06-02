import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { encryptToken } from '@/services/auth/tokens';
import { getBaseUrl } from '@/utils/url';

type SpotifyTokenResponse = {
  access_token?: string;
  token_type?: string;
  scope?: string;
  expires_in?: number;
  refresh_token?: string;
  error?: string;
  error_description?: string;
};

function spotifyRedirectUri(baseUrl: string) {
  const explicit = process.env.SPOTIFY_REDIRECT_URI?.trim();
  if (explicit) return explicit;
  return new URL('/api/connect/spotify/callback', baseUrl).toString();
}

export async function GET(request: Request) {
  const baseUrl = await getBaseUrl(request);
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL('/connect/spotify?oauth=error&reason=missing_env', baseUrl));
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL('/connect/spotify?oauth=error&reason=missing_code_or_state', baseUrl));
  }

  const cookieStore = await cookies();
  const expectedState = cookieStore.get('spotify_oauth_state')?.value;

  if (!expectedState || expectedState !== state) {
    return NextResponse.redirect(new URL('/connect/spotify?oauth=error&reason=invalid_state', baseUrl));
  }

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();

  if (!authData?.user) {
    return NextResponse.redirect(new URL('/login', baseUrl));
  }

  try {
    const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    
    const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${authHeader}`
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: spotifyRedirectUri(baseUrl),
      }),
    });

    const tokenData = (await tokenRes.json()) as SpotifyTokenResponse;

    if (!tokenRes.ok || tokenData.error || !tokenData.access_token) {
      console.error('[Spotify OAuth] Token exchange failed:', tokenData);
      return NextResponse.redirect(new URL('/connect/spotify?oauth=error&reason=token_exchange_failed', baseUrl));
    }

    const expiresAt = new Date(Date.now() + (tokenData.expires_in || 3600) * 1000).toISOString();

    const { error: upsertError } = await supabase.from('oauth_tokens').upsert(
      {
        user_id: authData.user.id,
        platform: 'spotify',
        access_token: encryptToken(tokenData.access_token),
        refresh_token: tokenData.refresh_token ? encryptToken(tokenData.refresh_token) : null,
        expires_at: expiresAt,
        metadata: {
          scope: tokenData.scope,
          token_type: tokenData.token_type,
        },
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,platform' }
    );

    if (upsertError) {
      console.error('[Spotify OAuth] DB Upsert Failed:', upsertError);
      return NextResponse.redirect(new URL('/connect/spotify?oauth=error&reason=token_persist_failed', baseUrl));
    }

    return NextResponse.redirect(new URL('/connect/spotify?oauth=success', baseUrl));
  } catch (error) {
    console.error('[Spotify OAuth] Callback error:', error);
    return NextResponse.redirect(new URL('/connect/spotify?oauth=error&reason=internal_error', baseUrl));
  }
}
