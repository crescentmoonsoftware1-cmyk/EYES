import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getBaseUrl } from '@/utils/url';

export async function GET(request: Request) {
  const baseUrl = await getBaseUrl(request);
  const clientId = process.env.CANVA_CLIENT_ID;
  if (!clientId) return NextResponse.redirect(new URL('/connect/canva?oauth=error&reason=missing_client_id', baseUrl));

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return NextResponse.redirect(new URL('/login', baseUrl));

  const state = crypto.randomUUID();
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  const cookieStore = await cookies();
  cookieStore.set('canva_oauth_state', state, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 600 });
  cookieStore.set('canva_code_verifier', codeVerifier, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 600 });

  const authUrl = new URL('https://www.canva.com/api/oauth/authorize');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', new URL('/api/connect/canva/callback', baseUrl).toString());
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'asset:read design:meta:read');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('code_challenge', codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');

  return NextResponse.redirect(authUrl);
}
