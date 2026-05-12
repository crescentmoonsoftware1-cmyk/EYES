import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

import { getBaseUrl } from '@/utils/url';

function slackRedirectUri(baseUrl: string) {
  const explicit = process.env.SLACK_REDIRECT_URI?.trim();
  if (explicit) return explicit;
  return new URL('/api/connect/slack/callback', baseUrl).toString();
}

export async function GET(request: Request) {
  const baseUrl = await getBaseUrl(request);
  const clientId = process.env.SLACK_CLIENT_ID;

  if (!clientId) {
    return NextResponse.redirect(new URL('/connect/slack?oauth=error&reason=missing_client_id', baseUrl));
  }

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();

  if (!authData.user) {
    return NextResponse.redirect(new URL('/login', baseUrl));
  }

  const state = crypto.randomUUID();
  const cookieStore = await cookies();
  cookieStore.set('slack_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 10,
  });

  const callbackUrl = slackRedirectUri(baseUrl);
  const authUrl = new URL('https://slack.com/oauth/v2/authorize');
  
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', callbackUrl);
  // user_scope must only contain valid user token scopes.
  // chat:write and chat:write.public are bot-only scopes — including them
  // causes Slack to reject the request with "Invalid permissions requested".
  authUrl.searchParams.set('user_scope', 'channels:read,groups:read,im:read,mpim:read,channels:history,groups:history,im:history,mpim:history,users.profile:read');

  authUrl.searchParams.set('state', state);

  return NextResponse.redirect(authUrl);
}
