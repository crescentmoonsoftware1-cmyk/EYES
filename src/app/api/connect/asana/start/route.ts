import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getBaseUrl } from '@/utils/url';

export async function GET(request: Request) {
  const baseUrl = await getBaseUrl(request);
  const clientId = process.env.ASANA_CLIENT_ID;
  if (!clientId) return NextResponse.redirect(new URL('/connect/asana?oauth=error&reason=missing_client_id', baseUrl));

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return NextResponse.redirect(new URL('/login', baseUrl));

  const state = crypto.randomUUID();
  const cookieStore = await cookies();
  cookieStore.set('asana_oauth_state', state, {
    httpOnly: true, sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/', maxAge: 60 * 10,
  });

  const authUrl = new URL('https://app.asana.com/-/oauth_authorize');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', new URL('/api/connect/asana/callback', baseUrl).toString());
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('scope', 'default');

  return NextResponse.redirect(authUrl);
}
