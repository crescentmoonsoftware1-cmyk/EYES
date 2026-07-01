import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

function getRequestBaseUrl(request: Request) {
  const host = request.headers.get('host');
  if (!host) return process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  return `${protocol}://${host}`;
}

function facebookRedirectUri(baseUrl: string) {
  const explicit = process.env.FACEBOOK_REDIRECT_URI?.trim();
  if (explicit) return explicit;
  return new URL('/api/connect/facebook/callback', baseUrl).toString();
}

export async function GET(request: Request) {
  const baseUrl = getRequestBaseUrl(request);
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');

  const cookieStore = await cookies();
  const savedState = cookieStore.get('facebook_oauth_state')?.value;

  if (!code || !state || state !== savedState) {
    return NextResponse.redirect(new URL('/connect/facebook?oauth=error&reason=invalid_state', baseUrl));
  }

  const clientId = process.env.META_CLIENT_ID?.trim();
  const clientSecret = process.env.META_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL('/connect/facebook?oauth=error&reason=missing_config', baseUrl));
  }

  try {
    const callbackUrl = facebookRedirectUri(baseUrl);
    
    // Exchange authorization code for access token
    const tokenExchangeUrl = new URL('https://graph.facebook.com/v19.0/oauth/access_token');
    tokenExchangeUrl.searchParams.set('client_id', clientId);
    tokenExchangeUrl.searchParams.set('redirect_uri', callbackUrl);
    tokenExchangeUrl.searchParams.set('client_secret', clientSecret);
    tokenExchangeUrl.searchParams.set('code', code);

    const response = await fetch(tokenExchangeUrl.toString());
    const data = await response.json();

    if (!response.ok || data.error) {
      const fbError = data.error?.message || 'unknown';
      console.error('Meta Token Error:', data);
      return NextResponse.redirect(new URL(`/connect/facebook?oauth=error&reason=token_exchange_failed&meta_error=${fbError}`, baseUrl));
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.redirect(new URL('/login', baseUrl));
    }

    const accessToken = data.access_token;
    const expiresIn = data.expires_in; // usually 60 days for short-lived token upgrade

    const expiresAt = expiresIn 
      ? new Date(Date.now() + expiresIn * 1000).toISOString()
      : null;

    const { error: tokenError } = await supabase
      .from('oauth_tokens')
      .upsert({
        user_id: user.id,
        platform: 'facebook',
        access_token: accessToken,
        refresh_token: null, // Facebook typically doesn't use refresh tokens this way, they use long-lived tokens
        expires_at: expiresAt,
        scope: '', // Facebook doesn't return scope in the token response directly here
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,platform' });

    if (tokenError) {
      console.error('Database Error:', tokenError);
      return NextResponse.redirect(new URL('/connect/facebook?oauth=error&reason=db_save_failed', baseUrl));
    }

    // Initialize sync status
    await supabase
      .from('sync_status')
      .upsert({
        user_id: user.id,
        platform: 'facebook',
        status: 'idle',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,platform' });

    return NextResponse.redirect(new URL('/connect/facebook?oauth=success', baseUrl));
  } catch (err) {
    console.error('Meta Auth Error:', err);
    return NextResponse.redirect(new URL('/connect/facebook?oauth=error&reason=server_error', baseUrl));
  }
}
