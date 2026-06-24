import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { encryptToken } from '@/services/auth/tokens';

function getAppBaseUrl(request: Request) {
  const host = request.headers.get('host') || 'localhost:3000';
  if (host.includes('localhost') || host.includes('127.0.0.1')) {
    return `http://${host}`;
  }
  return process.env.NEXT_PUBLIC_SITE_URL || `https://${host}`;
}

function discordRedirectUri(request: Request) {
  const explicit = process.env.DISCORD_REDIRECT_URI?.trim();
  if (explicit) return explicit;
  return new URL('/api/connect/discord/callback', getAppBaseUrl(request)).toString();
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');

  const siteUrl = getAppBaseUrl(request);
  const cookieStore = await cookies();
  const savedState = cookieStore.get('discord_oauth_state')?.value;

  if (!code || !state || state !== savedState) {
    return NextResponse.redirect(new URL('/connect/discord?oauth=error&reason=invalid_state', siteUrl));
  }

  const clientId = process.env.DISCORD_CLIENT_ID?.trim();
  const clientSecret = process.env.DISCORD_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL('/connect/discord?oauth=error&reason=missing_config', siteUrl));
  }

  try {
    const callbackUrl = discordRedirectUri(request);
    
    const response = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: callbackUrl,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Discord Token Error:', data);
      return NextResponse.redirect(new URL('/connect/discord?oauth=error&reason=token_exchange_failed', siteUrl));
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.redirect(new URL('/login', siteUrl));
    }

    const expiresAt = data.expires_in 
      ? new Date(Date.now() + data.expires_in * 1000).toISOString()
      : null;

    const { error: tokenError } = await supabase
      .from('oauth_tokens')
      .upsert({
        user_id: user.id,
        platform: 'discord',
        access_token: encryptToken(data.access_token),
        refresh_token: data.refresh_token ? encryptToken(data.refresh_token) : null,
        expires_at: expiresAt,
        scope: data.scope,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,platform' });

    if (tokenError) {
      console.error('Database Error:', tokenError);
      return NextResponse.redirect(new URL('/connect/discord?oauth=error&reason=db_save_failed', siteUrl));
    }

    // Initialize sync status
    await supabase
      .from('sync_status')
      .upsert({
        user_id: user.id,
        platform: 'discord',
        status: 'idle',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,platform' });

    return NextResponse.redirect(new URL('/connect/discord?oauth=success', siteUrl));
  } catch (err) {
    console.error('Discord Auth Error:', err);
    return NextResponse.redirect(new URL('/connect/discord?oauth=error&reason=server_error', siteUrl));
  }
}
