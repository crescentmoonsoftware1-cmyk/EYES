import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { createClient } from '@/utils/supabase/server';
import { encryptToken } from '@/services/auth/tokens';
import { getBaseUrl } from '@/utils/url';
import { sendWelcomeEmail } from '@/services/email/resend';

async function googleRedirectUri(request: Request) {
  const requestOrigin = await getBaseUrl(request);
  const requestDerived = new URL('/api/connect/google/callback', requestOrigin).toString();
  const explicit = process.env.GOOGLE_REDIRECT_URI?.trim();
  if (!explicit) return requestDerived;

  try {
    const parsed = new URL(explicit);
    if (process.env.NODE_ENV !== 'production' && parsed.origin !== requestOrigin) {
      console.warn(
        `[Google OAuth] GOOGLE_REDIRECT_URI origin (${parsed.origin}) does not match request origin (${requestOrigin}). Using request-derived callback URL.`
      );
      return requestDerived;
    }

    return parsed.toString();
  } catch {
    console.warn('[Google OAuth] GOOGLE_REDIRECT_URI is invalid. Using request-derived callback URL.');
    return requestDerived;
  }
}
async function appBaseUrl(request: Request) {
  return getBaseUrl(request);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const oauthError = url.searchParams.get('error');

  const [requestedPlatformFromState] = (state || '').split(':');
  const platformFromState = requestedPlatformFromState === 'google-calendar' ? 'google-calendar' : 'gmail';

  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      console.error('[Google OAuth] Missing client ID or secret in environment variables.');
      return NextResponse.redirect(new URL(`/connect/${platformFromState}?oauth=error&reason=missing_google_env`, await appBaseUrl(request)));
    }

    if (oauthError) {
      const mappedReason = oauthError === 'access_denied' ? 'google_access_denied_unverified_or_not_tester' : `google_oauth_${oauthError}`;
      return NextResponse.redirect(
        new URL(`/connect/${platformFromState}?oauth=error&reason=${encodeURIComponent(mappedReason)}`, await appBaseUrl(request))
      );
    }

    if (!code || !state) {
      return NextResponse.redirect(new URL(`/connect/${platformFromState}?oauth=error&reason=missing_code_or_state`, await appBaseUrl(request)));
    }

    const cookieStore = await cookies();
    const expectedState = cookieStore.get('google_oauth_state')?.value;

    if (!expectedState || expectedState !== state) {
      console.warn('[Google OAuth] State mismatch. Expected:', expectedState, 'Got:', state);
      return NextResponse.redirect(new URL(`/connect/${platformFromState}?oauth=error&reason=invalid_state`, await appBaseUrl(request)));
    }

    cookieStore.delete('google_oauth_state');

    const [requestedPlatform] = state.split(':');
    const platform = requestedPlatform === 'google-calendar' ? 'google-calendar' : 'gmail';

    const supabase = await createClient();
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) {
      return NextResponse.redirect(new URL('/login', await appBaseUrl(request)));
    }

    console.log('[Google OAuth] Exchanging code for tokens...');
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: await googleRedirectUri(request),
        grant_type: 'authorization_code',
      }),
      cache: 'no-store',
    });

    if (!tokenResponse.ok) {
      const errorBody = await tokenResponse.text();
      console.error('[Google OAuth] Token exchange failed:', errorBody);
      return NextResponse.redirect(new URL(`/connect/${platform}?oauth=error&reason=token_exchange_failed`, await appBaseUrl(request)));
    }

    const tokenBody = (await tokenResponse.json()) as {
      access_token?: string;
      refresh_token?: string;
      scope?: string;
      expires_in?: number;
      error?: string;
    };

    if (!tokenBody.access_token) {
      return NextResponse.redirect(
        new URL(`/connect/${platform}?oauth=error&reason=${encodeURIComponent(tokenBody.error || 'no_access_token')}`, await appBaseUrl(request))
      );
    }

    const userId = authData.user.id;
    const now = new Date().toISOString();
    const expiresAt = tokenBody.expires_in
      ? new Date(Date.now() + tokenBody.expires_in * 1000).toISOString()
      : null;

    console.log('[Google OAuth] Encrypting tokens...');
    const accessToken = encryptToken(tokenBody.access_token);
    const refreshToken = tokenBody.refresh_token ? encryptToken(tokenBody.refresh_token) : null;

    const platforms = ['gmail', 'google_calendar'];

    console.log('[Google OAuth] Persisting to Supabase...');
    const tokenUpserts = platforms.map((dbPlatform) =>
      supabase.from('oauth_tokens').upsert({
        user_id: userId,
        platform: dbPlatform,
        access_token: accessToken,
        refresh_token: refreshToken,
        scope: tokenBody.scope || 'gmail.readonly calendar.readonly',
        expires_at: expiresAt,
        created_at: now,
        updated_at: now,
      }, { onConflict: 'user_id,platform' })
    );

    const syncUpserts = platforms.map((dbPlatform) =>
      supabase.from('sync_status').upsert({
        user_id: userId,
        platform: dbPlatform,
        status: 'authenticating',
        sync_progress: 5,
        total_items: 0,
        last_sync_at: null,
        next_sync_at: null,
        error_message: null,
      }, { onConflict: 'user_id,platform' })
    );

    const results = await Promise.all([...tokenUpserts, ...syncUpserts]);
    const errorResult = results.find((result) => (result as { error?: unknown }).error);

    if (errorResult) {
      console.error('[Google OAuth] Supabase upsert failed:', (errorResult as { error?: unknown }).error);
      return NextResponse.redirect(new URL(`/connect/${platform}?oauth=error&reason=token_persist_failed`, await appBaseUrl(request)));
    }

    // ── Activate Gmail Push Notifications via watch() ─────────────────────────
    // Only needed for Gmail (not Google Calendar)
    if (platform === 'gmail') {
      try {
        const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID ?? 'the-eyes-493904';
        const topicName = `projects/${projectId}/topics/gmail-notifications`;

        const watchRes = await fetch(
          'https://gmail.googleapis.com/gmail/v1/users/me/watch',
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${tokenBody.access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              topicName,
              labelIds: ['INBOX'],
            }),
          }
        );

        if (watchRes.ok) {
          const watchData = await watchRes.json();
          console.log('[Gmail Watch] Activated. historyId:', watchData.historyId, 'expiry:', watchData.expiration);
          // Store historyId so the webhook knows where to start fetching from
          await supabase.from('oauth_tokens')
            .update({ metadata: { gmail_history_id: watchData.historyId, gmail_watch_expiry: watchData.expiration } })
            .eq('user_id', userId)
            .eq('platform', 'gmail');
        } else {
          const watchErr = await watchRes.text();
          console.warn('[Gmail Watch] Failed to activate push notifications:', watchErr);
        }
      } catch (watchErr) {
        // Non-fatal — sync still works via cron, push is just an enhancement
        console.warn('[Gmail Watch] Exception activating watch:', watchErr);
      }
    }

    // ── Welcome email on first-ever connector connection ──────────────────────
    // Fire-and-forget: check if this is their very first oauth token stored
    try {
      const { count } = await supabase
        .from('oauth_tokens')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);
      if (count === 1 || count === 2) { // 1-2 because we just upserted gmail + calendar
        const userEmail = authData.user.email ?? '';
        const userName = authData.user.user_metadata?.full_name
          ?? authData.user.user_metadata?.name
          ?? userEmail.split('@')[0]
          ?? 'there';
        sendWelcomeEmail(userEmail, userName); // non-blocking
      }
    } catch { /* non-fatal */ }

    // Sync is triggered by cron (runs every 5 minutes)
    // Returning immediately gives faster user feedback
    return NextResponse.redirect(new URL(`/connect/${platform}?oauth=success`, await appBaseUrl(request)));
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('[Google OAuth] Fatal Error:', err);
    return NextResponse.redirect(new URL(`/connect/${platformFromState}?oauth=error&reason=internal_server_error&msg=${encodeURIComponent(errMsg)}`, await appBaseUrl(request)));
  }
}
