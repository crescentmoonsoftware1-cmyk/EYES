import { useEffect, useRef, useCallback } from 'react';
import type { User } from '../AuthContext';
import type { SupabaseClient } from '@supabase/supabase-js';

const REALTIME_PULSE_THROTTLE_MS = 10_000;

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function useRealtimeSync(
  supabase: SupabaseClient,
  user: User | null,
  isLoading: boolean,
  pathname: string
) {
  // M3 fix: move module-level mutable pulse state into a ref so it's
  // scoped to the hook instance and stable across HMR hot reloads.
  const lastPulseTimeRef = useRef<number>(0);

  const emitRealtimeRefreshEvent = useCallback(() => {
    if (typeof window === 'undefined') return;
    const now = Date.now();
    if (now - lastPulseTimeRef.current < REALTIME_PULSE_THROTTLE_MS) return;
    lastPulseTimeRef.current = now;
    window.dispatchEvent(new CustomEvent('eyes-realtime-refresh'));
  }, []);

  useEffect(() => {
    if (isLoading || !user) {
      return;
    }

    const isPublicRoute = ['/login', '/signup'].includes(pathname);
    if (isPublicRoute) {
      return;
    }

    if (!isUuid(user.id)) {
      return;
    }

    // Only watch for high-level status changes to prevent refresh spamming.
    // 'raw_events' is removed to avoid triggering a refresh for every single new memory.
    const watchedTables = ['sync_status', 'user_profiles', 'oauth_tokens'] as const;
    const channelName = `eyes-user-live:${user.id}`;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;

    const queueRefresh = () => {
      if (refreshTimer) return;

      // Debounce bursts: only allow UI refresh every 2 seconds to damp the pulse.
      refreshTimer = setTimeout(() => {
        refreshTimer = undefined;
        emitRealtimeRefreshEvent();
      }, 2000);
    };

    let channel = supabase.channel(channelName);

    watchedTables.forEach((table) => {
      channel = channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table,
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          queueRefresh();
        }
      );
    });

    channel.subscribe();

    return () => {
      if (refreshTimer) {
        clearTimeout(refreshTimer);
      }
      void supabase.removeChannel(channel);
    };
  }, [isLoading, pathname, supabase, user, emitRealtimeRefreshEvent]);
}
