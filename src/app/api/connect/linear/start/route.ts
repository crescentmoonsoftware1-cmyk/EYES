import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getBaseUrl } from '@/utils/url';

export async function GET(request: Request) {
  const baseUrl = await getBaseUrl(request);
  const clientId = process.env.LINEAR_CLIENT_ID;
  if (!clientId) return NextResponse.redirect(new URL('/connect/linear?oauth=error&reason=missing_client_id', baseUrl));

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return NextResponse.redirect(new URL('/login', baseUrl));

  const state = crypto.randomUUID();
  const cookieStore = await cookies();
  cookieStore.set('linear_oauth_state', state, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 600 });

  const authUrl = new URL('https://linear.app/oauth/authorize');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', new URL('/api/connect/linear/callback', baseUrl).toString());
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'read');
  authUrl.searchParams.set('state', state);

  return NextResponse.redirect(authUrl);
}
