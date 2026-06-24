'use client';

import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { useEffect, useState, Suspense } from 'react';
import { useAuth } from '@/context/AuthContext';

// ─── Platform → sync route mapping ───────────────────────────────────────────
const PLATFORM_SYNC_ROUTES: Record<string, string[]> = {
  github:             ['github'],
  notion:             ['notion'],
  slack:              ['slack'],
  discord:            ['discord'],
  reddit:             ['reddit'],
  google:             ['gmail', 'google-calendar'],
  gmail:              ['gmail'],
  'google-calendar':  ['google-calendar'],
  dropbox:            ['dropbox'],
  linear:             ['linear'],
  asana:              ['asana'],
  canva:              ['canva'],
  clickup:            ['clickup'],
  fitbit:             ['fitbit'],
  netlify:            ['netlify'],
  sentry:             ['sentry'],
  strava:             ['strava'],
  webflow:            ['webflow'],
  withings:           ['withings'],
  twitter:            ['twitter'],
};

const ERROR_REASON_LABELS: Record<string, string> = {
  missing_client_id:          'OAuth app credentials are not configured in Vercel environment variables.',
  missing_google_client_id:   'Google OAuth credentials are missing from environment variables.',
  missing_env:                'Required environment variables are missing.',
  missing_code_or_state:      'OAuth state was lost during redirect. Please try again.',
  invalid_state:              'Security check failed (state mismatch). Please try again.',
  token_exchange_failed:      'The OAuth provider rejected the token exchange. Check that your redirect URI is registered in the platform\'s developer console.',
  token_persist_failed:       'Token was received but could not be saved. Check Supabase connectivity.',
  no_access_token:            'The OAuth provider did not return an access token.',
  no_token:                   'No token was returned from the provider.',
  invalid_platform:           'This platform is not supported.',
  redirect_uri_mismatch:      'The callback URL is not registered in the platform\'s OAuth app settings. Add the callback URL shown below.',
};

function triggerBackgroundSync(platform: string) {
  const routes = PLATFORM_SYNC_ROUTES[platform] ?? [platform];
  routes.forEach((route) => {
    fetch(`/api/sync/${route}?depth=shallow`, { method: 'POST' }).catch(() => {});
  });
}

function ConnectPlatformInner() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const { user, isLoading } = useAuth();

  const [state, setState] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorReason, setErrorReason] = useState('');
  const [platform, setPlatform] = useState('');

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login');
    }
  }, [user, isLoading, router]);

  useEffect(() => {
    if (isLoading || !user) return;

    const p = typeof params?.platform === 'string' ? params.platform : '';
    const oauthStatus = searchParams?.get('oauth');
    const reason = searchParams?.get('reason') ?? '';
    const slackError = searchParams?.get('slack_error') ?? '';

    if (oauthStatus === 'success' && p) {
      triggerBackgroundSync(p);
      try { sessionStorage.setItem('eyes-post-connect', p); } catch (_) {}
      // Batch all state mutations to avoid synchronous cascading render warning
      setTimeout(() => {
        setPlatform(p);
        setState('success');
      }, 0);
      
      const isOnboarding = typeof window !== 'undefined' && sessionStorage.getItem('eyes-is-onboarding');
      // Redirect after brief success flash
      setTimeout(() => router.replace(isOnboarding ? '/onboarding' : '/?view=readiness'), 1200);

    } else if (oauthStatus === 'error') {
      setTimeout(() => {
        setPlatform(p);
        setErrorReason(slackError ? `${reason} (slack: ${slackError})` : reason);
        setState('error');
      }, 0);
      // Do NOT auto-redirect on error — let user read the message

    } else {
      setTimeout(() => setPlatform(p), 0);
      const isOnboarding = typeof window !== 'undefined' && sessionStorage.getItem('eyes-is-onboarding');
      // No oauth param = direct visit, just redirect
      router.replace(isOnboarding ? '/onboarding' : '/?view=readiness');
    }
  }, [router, params, searchParams, user, isLoading]);

  const callbackUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? 'https://the-eyes-gamma.vercel.app'}/api/connect/${platform}/callback`;
  const readableReason = ERROR_REASON_LABELS[errorReason] ?? errorReason ?? 'An unknown error occurred during the OAuth flow.';

  // ── Error State ────────────────────────────────────────────────────────────
  if (state === 'error') {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: '#F8F5F2', gap: '20px', padding: '32px',
      }}>
        <div style={{
          maxWidth: '520px', width: '100%', background: '#fff',
          border: '1px solid #e5e1dc', borderRadius: '16px', padding: '32px',
          boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#fef2f2', border: '1px solid #fecaca', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>✕</div>
            <div>
              <div style={{ fontWeight: 800, fontSize: '16px', color: '#1D1C16', fontFamily: 'Georgia, serif' }}>Connection Failed</div>
              <div style={{ fontSize: '12px', color: '#6b6b6b', textTransform: 'uppercase', letterSpacing: '1px' }}>{platform}</div>
            </div>
          </div>

          <p style={{ fontSize: '14px', color: '#444', lineHeight: '1.6', marginBottom: '20px' }}>
            {readableReason}
          </p>

          {errorReason === 'token_exchange_failed' || errorReason === 'redirect_uri_mismatch' ? (
            <div style={{ background: '#f8f5f2', border: '1px solid #e5e1dc', borderRadius: '10px', padding: '16px', marginBottom: '20px' }}>
              <div style={{ fontSize: '11px', fontWeight: 800, color: '#6b6b6b', letterSpacing: '1.5px', marginBottom: '8px' }}>REGISTER THIS CALLBACK URL IN YOUR OAUTH APP</div>
              <code style={{ fontSize: '12px', color: '#1D1C16', wordBreak: 'break-all', display: 'block', fontFamily: 'monospace' }}>
                {callbackUrl}
              </code>
            </div>
          ) : null}

          <div style={{ fontSize: '11px', color: '#9b9b9b', background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: '8px', padding: '10px 14px', marginBottom: '24px', fontFamily: 'monospace' }}>
            Error code: {errorReason || 'unknown'}
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={() => { window.location.href = `/api/connect/${platform}/start`; }}
              style={{
                flex: 1, padding: '12px', background: '#1D1C16', color: '#fff',
                border: 'none', borderRadius: '10px', fontWeight: 700,
                fontSize: '14px', cursor: 'pointer', fontFamily: 'Georgia, serif',
              }}
            >
              Try Again
            </button>
            <button
              onClick={() => {
                const isOnboarding = typeof window !== 'undefined' && sessionStorage.getItem('eyes-is-onboarding');
                router.replace(isOnboarding ? '/onboarding' : '/?view=connectors');
              }}
              style={{
                flex: 1, padding: '12px', background: 'transparent', color: '#1D1C16',
                border: '1px solid #e5e1dc', borderRadius: '10px', fontWeight: 600,
                fontSize: '14px', cursor: 'pointer',
              }}
            >
              Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Success State ──────────────────────────────────────────────────────────
  if (state === 'success') {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: '#F8F5F2', gap: '12px',
      }}>
        <div style={{ fontSize: '32px' }}>✓</div>
        <p style={{ fontFamily: 'Georgia, serif', fontSize: '1.2rem', color: '#1D1C16', margin: 0 }}>
          {platform} connected. Syncing...
        </p>
        <div style={{ width: '40px', height: '2px', background: '#1D1C16', opacity: 0.2 }} />
      </div>
    );
  }

  // ── Loading / Redirect State ───────────────────────────────────────────────
  if (isLoading) {
    return (
      <div style={{
        background: '#080808',
        height: '100vh',
        width: '100vw',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <div style={{
          color: '#E06A3B',
          fontFamily: 'var(--font-display)',
          fontWeight: 600,
          fontSize: '12px',
          letterSpacing: '0.15em',
          marginBottom: '16px',
        }}>
          Connecting…
        </div>
        <div style={{
          width: '120px',
          height: '1px',
          background: 'rgba(255,255,255,0.06)',
          position: 'relative',
          overflow: 'hidden',
          borderRadius: '2px',
        }}>
          <div style={{
            position: 'absolute',
            left: 0,
            top: 0,
            height: '100%',
            width: '40%',
            background: '#E06A3B',
            animation: 'loadingSweep 1.2s infinite ease-in-out',
          }} />
        </div>
        <style>{`
          @keyframes loadingSweep {
            0% { left: -40%; }
            50% { left: 100%; }
            100% { left: 100%; }
          }
        `}</style>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: '#F8F5F2', gap: '12px',
    }}>
      <p style={{ fontFamily: 'Georgia, serif', fontSize: '1.2rem', color: '#1D1C16', margin: 0 }}>
        Redirecting...
      </p>
      <div style={{ width: '40px', height: '2px', background: '#1D1C16', opacity: 0.2 }} />
    </div>
  );
}

export default function ConnectPlatformPage() {
  return (
    <Suspense fallback={null}>
      <ConnectPlatformInner />
    </Suspense>
  );
}
