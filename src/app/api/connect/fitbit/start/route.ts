import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

function appBaseUrl() { return process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'; }

export async function GET() {
  const clientId = process.env.FITBIT_CLIENT_ID;
  if (!clientId) return NextResponse.redirect(new URL('/connect/fitbit?oauth=error&reason=missing_client_id', appBaseUrl()));
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return NextResponse.redirect(new URL('/login', appBaseUrl()));
  const state = crypto.randomUUID();
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  const cookieStore = await cookies();
  cookieStore.set('fitbit_oauth_state', state, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 600 });
  cookieStore.set('fitbit_code_verifier', codeVerifier, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 600 });
  const authUrl = new URL('https://www.fitbit.com/oauth2/authorize');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', new URL('/api/connect/fitbit/callback', appBaseUrl()).toString());
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'activity profile sleep heartrate');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('code_challenge', codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  return NextResponse.redirect(authUrl);
}
