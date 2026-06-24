import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { createClient } from '@/utils/supabase/server';
import { encryptToken } from '@/services/auth/tokens';

function getRequestBaseUrl(request: Request) {
  const host = request.headers.get('host') || 'localhost:3000';
  if (host.includes('localhost') || host.includes('127.0.0.1')) {
    return `http://${host}`;
  }
  return process.env.NEXT_PUBLIC_SITE_URL || `https://${host}`;
}

function notionRedirectUri(baseUrl: string) {
  const explicit = process.env.NOTION_REDIRECT_URI?.trim();
  if (explicit) return explicit;
  return new URL('/api/connect/notion/callback', baseUrl).toString();
}

export async function GET(request: Request) {
  const baseUrl = getRequestBaseUrl(request);
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  const clientId = process.env.NOTION_CLIENT_ID?.trim();
  const clientSecret = process.env.NOTION_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL('/connect/notion?oauth=error&reason=missing_notion_env', baseUrl));
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL('/connect/notion?oauth=error&reason=missing_code_or_state', baseUrl));
  }

  const cookieStore = await cookies();
  const expectedState = cookieStore.get('notion_oauth_state')?.value;

  if (!expectedState || expectedState !== state) {
    return NextResponse.redirect(new URL('/connect/notion?oauth=error&reason=invalid_state', baseUrl));
  }

  cookieStore.delete('notion_oauth_state');

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();

  if (!authData.user) {
    return NextResponse.redirect(new URL('/login', baseUrl));
  }

  const tokenResponse = await fetch('https://api.notion.com/v1/oauth/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code,
      redirect_uri: notionRedirectUri(baseUrl),
    }),
    cache: 'no-store',
  });

  if (!tokenResponse.ok) {
    return NextResponse.redirect(new URL('/connect/notion?oauth=error&reason=token_exchange_failed', baseUrl));
  }

  const tokenBody = (await tokenResponse.json()) as {
    access_token?: string;
    workspace_name?: string;
    workspace_id?: string;
    bot_id?: string;
    error?: string;
  };

  if (!tokenBody.access_token) {
    return NextResponse.redirect(
      new URL(`/connect/notion?oauth=error&reason=${encodeURIComponent(tokenBody.error || 'no_access_token')}`, baseUrl)
    );
  }

  const now = new Date().toISOString();

  const [{ error: tokenSaveError }, { error: syncSaveError }] = await Promise.all([
    supabase.from('oauth_tokens').upsert({
      user_id: authData.user.id,
      platform: 'notion',
      access_token: encryptToken(tokenBody.access_token),
      refresh_token: null,
      scope: 'read content',
      expires_at: null,
      created_at: now,
      updated_at: now,
    }, { onConflict: 'user_id,platform' }),
    supabase.from('sync_status').upsert({
      user_id: authData.user.id,
      platform: 'notion',
      status: 'authenticating',
      sync_progress: 5,
      total_items: 0,
      last_sync_at: null,
      next_sync_at: null,
      error_message: null,
    }, { onConflict: 'user_id,platform' }),
  ]);

  if (tokenSaveError || syncSaveError) {
    return NextResponse.redirect(new URL('/connect/notion?oauth=error&reason=token_persist_failed', baseUrl));
  }

  // Sync is triggered by cron (runs every 5 minutes)
  // Returning immediately gives faster user feedback
  return NextResponse.redirect(new URL('/connect/notion?oauth=success', baseUrl));
}
