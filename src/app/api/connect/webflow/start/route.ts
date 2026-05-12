import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

function appBaseUrl() { return process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'; }

export async function GET() {
  const clientId = process.env.WEBFLOW_CLIENT_ID;
  if (!clientId) return NextResponse.redirect(new URL('/connect/webflow?oauth=error&reason=missing_client_id', appBaseUrl()));
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return NextResponse.redirect(new URL('/login', appBaseUrl()));
  const state = crypto.randomUUID();
  const cookieStore = await cookies();
  cookieStore.set('webflow_oauth_state', state, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 600 });
  const authUrl = new URL('https://webflow.com/oauth/authorize');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', new URL('/api/connect/webflow/callback', appBaseUrl()).toString());
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'sites:read pages:read');
  authUrl.searchParams.set('state', state);
  return NextResponse.redirect(authUrl);
}
