import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getBaseUrl } from '@/utils/url';

export async function GET(request: Request) {
  const baseUrl = await getBaseUrl(request);
  const clientId = process.env.CLICKUP_CLIENT_ID?.trim();
  if (!clientId) return NextResponse.redirect(new URL('/connect/clickup?oauth=error&reason=missing_client_id', baseUrl));

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return NextResponse.redirect(new URL('/login', baseUrl));

  const state = crypto.randomUUID();
  const cookieStore = await cookies();
  cookieStore.set('clickup_oauth_state', state, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 600 });

  const authUrl = new URL('https://app.clickup.com/api');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', new URL('/api/connect/clickup/callback', baseUrl).toString());
  authUrl.searchParams.set('state', state);

  return NextResponse.redirect(authUrl);
}
