'use client';

import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { useEffect, Suspense } from 'react';

// ─── Platform → sync route mapping ───────────────────────────────────────────
// 'google' is the OAuth provider for both Gmail and Google Calendar;
// both are synced after a Google connection.
const PLATFORM_SYNC_ROUTES: Record<string, string[]> = {
  github:          ['github'],
  notion:          ['notion'],
  slack:           ['slack'],
  discord:         ['discord'],
  reddit:          ['reddit'],
  google:          ['gmail', 'google-calendar'],
  gmail:           ['gmail'],
  'google-calendar': ['google-calendar'],
  dropbox:         ['dropbox'],
  linear:          ['linear'],
  asana:           ['asana'],
  canva:           ['canva'],
  clickup:         ['clickup'],
  fitbit:          ['fitbit'],
  netlify:         ['netlify'],
  sentry:          ['sentry'],
  strava:          ['strava'],
  webflow:         ['webflow'],
  withings:        ['withings'],
  twitter:         ['twitter'],
};

function triggerBackgroundSync(platform: string) {
  const routes = PLATFORM_SYNC_ROUTES[platform] ?? [platform];
  routes.forEach((route) => {
    fetch(`/api/sync/${route}?depth=shallow`, { method: 'POST' }).catch(() => {
      // Fire-and-forget — errors are non-fatal here
    });
  });
}

function ConnectPlatformInner() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();

  useEffect(() => {
    const platform = typeof params?.platform === 'string' ? params.platform : '';
    const oauthStatus = searchParams?.get('oauth');

    if (oauthStatus === 'success' && platform) {
      // 1. Fire background sync so new data is available immediately
      triggerBackgroundSync(platform);

      // 2. Signal MainContent to force-refresh once it mounts
      try {
        sessionStorage.setItem('eyes-post-connect', platform);
      } catch (_) {
        // sessionStorage unavailable (private browsing) — not critical
      }
    }

    // Always navigate back to the connector hub
    router.replace('/?view=connectors');
  }, [router, params, searchParams]);

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-primary, #F8F5F2)',
      gap: '12px',
    }}>
      <p style={{
        fontFamily: 'Georgia, serif',
        fontSize: '1.2rem',
        color: '#1D1C16',
        margin: 0,
      }}>
        Updating Neural Archive...
      </p>
      <div style={{
        width: '40px',
        height: '2px',
        background: '#1D1C16',
        opacity: 0.2,
      }} />
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
