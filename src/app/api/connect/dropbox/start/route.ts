import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getBaseUrl } from '@/utils/url';

export async function GET(request: Request) {
  const baseUrl = await getBaseUrl(request);
  const clientId = process.env.DROPBOX_CLIENT_ID;
  if (!clientId) return NextResponse.redirect(new URL('/connect/dropbox?oauth=error&reason=missing_client_id', baseUrl));

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return NextResponse.redirect(new URL('/login', baseUrl));

  const state = crypto.randomUUID();
  const cookieStore = await cookies();
  cookieStore.set('dropbox_oauth_state', state, {
    httpOnly: true, sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/', maxAge: 60 * 10,
  });

  const authUrl = new URL('https://www.dropbox.com/oauth2/authorize');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', new URL('/api/connect/dropbox/callback', baseUrl).toString());
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('token_access_type', 'offline');
  authUrl.searchParams.set('scope', 'files.metadata.read files.content.read');

  return NextResponse.redirect(authUrl);
}
