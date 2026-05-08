import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

function getRequestBaseUrl(request: Request) {
  const host = request.headers.get('host');
  if (!host) return process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  return `${protocol}://${host}`;
}

function slackRedirectUri(baseUrl: string) {
  const explicit = process.env.SLACK_REDIRECT_URI?.trim();
  if (explicit) return explicit;
  return new URL('/api/connect/slack/callback', baseUrl).toString();
}

export async function GET(request: Request) {
  const baseUrl = getRequestBaseUrl(request);
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');

  const cookieStore = await cookies();
  const savedState = cookieStore.get('slack_oauth_state')?.value;

  if (!code || !state || state !== savedState) {
    return NextResponse.redirect(new URL('/connect/slack?oauth=error&reason=invalid_state', baseUrl));
  }

  const clientId = process.env.SLACK_CLIENT_ID;
  const clientSecret = process.env.SLACK_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL('/connect/slack?oauth=error&reason=missing_config', baseUrl));
  }

  try {
    const callbackUrl = slackRedirectUri(baseUrl);
    
    const response = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: callbackUrl,
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.ok) {
      console.error('Slack Token Error:', data);
      return NextResponse.redirect(new URL('/connect/slack?oauth=error&reason=token_exchange_failed', baseUrl));
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.redirect(new URL('/login', baseUrl));
    }

    // Note: Slack returns user tokens in authed_user block
    const userToken = data.authed_user.access_token;
    const refreshToken = data.authed_user.refresh_token || null;
    const expiresAt = data.authed_user.expires_in 
      ? new Date(Date.now() + data.authed_user.expires_in * 1000).toISOString()
      : null;

    const { error: tokenError } = await supabase
      .from('oauth_tokens')
      .upsert({
        user_id: user.id,
        platform: 'slack',
        access_token: userToken,
        refresh_token: refreshToken,
        expires_at: expiresAt,
        scope: data.authed_user.scope,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,platform' });

    if (tokenError) {
      console.error('Database Error:', tokenError);
      return NextResponse.redirect(new URL('/connect/slack?oauth=error&reason=db_save_failed', baseUrl));
    }

    // Initialize sync status
    await supabase
      .from('sync_status')
      .upsert({
        user_id: user.id,
        platform: 'slack',
        status: 'idle',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,platform' });

    // Sync is triggered by cron (runs every 5 minutes)
    // Returning immediately gives faster user feedback
    return NextResponse.redirect(new URL('/connect/slack?oauth=success', baseUrl));
  } catch (err) {
    console.error('Slack Auth Error:', err);
    return NextResponse.redirect(new URL('/connect/slack?oauth=error&reason=server_error', baseUrl));
  }
}
