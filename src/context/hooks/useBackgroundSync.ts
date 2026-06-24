import { useEffect } from 'react';
import type { User } from '../AuthContext';
import type { SupabaseClient } from '@supabase/supabase-js';

const AUTO_BACKGROUND_SYNC_ENABLED = process.env.NEXT_PUBLIC_AUTO_BACKGROUND_SYNC === 'true';

export function useBackgroundSync(
  supabase: SupabaseClient,
  user: User | null,
  isLoading: boolean,
  pathname: string
) {
  useEffect(() => {
    if (!AUTO_BACKGROUND_SYNC_ENABLED) return;
    if (isLoading || !user) return;

    const isPublicRoute = ['/login', '/signup'].includes(pathname);
    if (isPublicRoute) return;
    if (pathname.startsWith('/connect')) return;
    if (!user.onboardingCompleted) return; // Prevent 401s in terminal before onboarding is done

    let cancelled = false;
    let syncInFlight = false;

    const runBackgroundSync = async () => {
      if (cancelled || syncInFlight) {
        return;
      }

      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }

      syncInFlight = true;
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          return;
        }

        const response = await fetch('/api/sync/all?background=1', {
          method: 'POST',
          cache: 'no-store',
          keepalive: true,
          credentials: 'include',  // L10: ensure session cookie is sent
        });

        if (!response.ok && response.status !== 202) {
          console.warn(`[Auth] Background sync fan-out returned ${response.status}.`);
        }
      } catch (error) {
        console.warn('[Auth] Background sync fan-out failed:', error);
      } finally {
        syncInFlight = false;
        // Note: no manual pulse here — the Supabase realtime subscription on
        // sync_status will fire queueRefresh() automatically when rows change.
      }
    };

    const initialDelay = setTimeout(() => {
      void runBackgroundSync();
    }, 2500);

    const interval = setInterval(() => {
      void runBackgroundSync();
    }, 90000);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void runBackgroundSync();
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibilityChange);
    }

    return () => {
      cancelled = true;
      clearTimeout(initialDelay);
      clearInterval(interval);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange);
      }
    };
  }, [isLoading, pathname, supabase, user]);
}
