'use client';

/**
 * useAuthSession — handles initial session hydration, onAuthStateChange,
 * and the global unhandledrejection guard for refresh token failures.
 *
 * Extracted from AuthContext.tsx to reduce the 875-line monolith.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { User } from '../AuthContext';

// ── Re-exported helpers (shared with AuthContext) ─────────────────────────────

export function isRefreshTokenFailure(message?: string) {
  const text = (message || '').toLowerCase();
  return (
    text.includes('invalid refresh token') ||
    text.includes('refresh token not found') ||
    (text.includes('refresh token') && text.includes('invalid'))
  );
}

export function isSupabaseLockStealFailure(message?: string) {
  const text = (message || '').toLowerCase();
  return (
    text.includes('was released because another request stole it') ||
    (text.includes('lock "lock:sb-') && text.includes('stole it'))
  );
}

export function getErrorMessage(error: unknown) {
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const detail = error as { message?: string; error_description?: string; error?: string; name?: string };
    const candidates = [detail.message, detail.error_description, detail.error, detail.name]
      .filter((v): v is string => Boolean(v && v.trim()));
    if (candidates.length > 0) return candidates.join(' ');
  }
  return String(error ?? '');
}

export function purgeSupabaseLocalAuthArtifacts() {
  if (typeof window === 'undefined') return;
  const supabaseRef = process.env.NEXT_PUBLIC_SUPABASE_URL?.split('//')[1]?.split('.')?.[0];
  const preferredKey = supabaseRef ? `sb-${supabaseRef}-auth-token` : null;
  [...Object.keys(window.localStorage), ...Object.keys(window.sessionStorage)].forEach((key) => {
    const isTarget = (preferredKey && key === preferredKey) || (key.startsWith('sb-') && key.endsWith('-auth-token'));
    if (isTarget) {
      window.localStorage.removeItem(key);
      window.sessionStorage.removeItem(key);
    }
  });
}

// ── Hook ──────────────────────────────────────────────────────────────────────

type SyncProfileFn = (authUser: { id: string; email?: string; metadata?: Record<string, unknown> }) => Promise<User>;

export function useAuthSession(
  supabase: SupabaseClient,
  syncProfile: SyncProfileFn,
  setUser: (user: User | null) => void,
  setIsLoading: (loading: boolean) => void,
) {
  const authInitStartedRef = useRef(false);
  const lastSyncedUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (authInitStartedRef.current) return;
    authInitStartedRef.current = true;

    let mounted = true;

    // Global rejection guard for refresh token failures
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const message = getErrorMessage(event.reason);
      if (isSupabaseLockStealFailure(message)) {
        event.preventDefault();
        console.warn('[Auth] Suppressing transient Supabase lock contention rejection.');
        return;
      }
      if (!isRefreshTokenFailure(message)) return;
      event.preventDefault();
      console.warn('[Auth] Unhandled refresh token rejection — purging local auth state.');
      void supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
      purgeSupabaseLocalAuthArtifacts();
      if (mounted) setUser(null);
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('unhandledrejection', handleUnhandledRejection);
    }

    // Hard safety: never hang isLoading forever
    const safetyTimer = setTimeout(() => {
      if (!mounted) return;
      setIsLoading(false);
    }, 12000);

    // onAuthStateChange — primary event bus
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event: AuthChangeEvent, session: Session | null) => {
        console.log('[Auth] State Event:', event);
        if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') return;

        if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session?.user) {
          if (lastSyncedUserIdRef.current === session.user.id) {
            console.log('[Auth] Already synced this user, skipping duplicate event.');
            return;
          }
          lastSyncedUserIdRef.current = session.user.id;
          const profile = await syncProfile({
            id: session.user.id,
            email: session.user.email,
            metadata: session.user.user_metadata,
          });
          if (mounted) setUser(profile);
        } else if (event === 'SIGNED_OUT') {
          lastSyncedUserIdRef.current = null;
          if (mounted) setUser(null);
        }
      }
    );

    // Bootstrap from existing session
    const initialize = async () => {
      try {
        const sessionResult = await Promise.race([
          supabase.auth.getSession(),
          new Promise<null>((_, reject) => setTimeout(() => reject(new Error('Session timeout')), 9000)),
        ]) as { data: { session: Session | null }; error: { message?: string } | null } | null;

        if (!sessionResult) throw new Error('Session fetch timed out');

        const { data: { session }, error: sessionError } = sessionResult;
        if (sessionError) {
          if (isRefreshTokenFailure(sessionError.message)) {
            await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
            purgeSupabaseLocalAuthArtifacts();
            if (mounted) setUser(null);
            return;
          }
          throw sessionError;
        }

        if (session?.user && mounted) {
          lastSyncedUserIdRef.current = session.user.id;
          const profile = await syncProfile({
            id: session.user.id,
            email: session.user.email,
            metadata: session.user.user_metadata,
          });
          if (mounted) setUser(profile);
        }
      } catch (err) {
        const message = getErrorMessage(err);
        if (isRefreshTokenFailure(message)) {
          await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
          purgeSupabaseLocalAuthArtifacts();
        } else {
          console.error('[Auth] Initial session sync failed:', err);
        }
        if (mounted) setUser(null);
      } finally {
        if (mounted) {
          setIsLoading(false);
          clearTimeout(safetyTimer);
          console.log('[Auth] System Ready.');
        }
      }
    };

    initialize();

    return () => {
      mounted = false;
      clearTimeout(safetyTimer);
      if (typeof window !== 'undefined') window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      subscription.unsubscribe();
    };
  }, [supabase, syncProfile, setUser, setIsLoading]);
}

// ── Realtime subscription hook ────────────────────────────────────────────────

let lastPulseTime = 0;
const PULSE_THROTTLE_MS = 10000;

export function emitRealtimeRefreshEvent() {
  if (typeof window === 'undefined') return;
  const now = Date.now();
  if (now - lastPulseTime < PULSE_THROTTLE_MS) return;
  lastPulseTime = now;
  window.dispatchEvent(new CustomEvent('eyes-realtime-refresh'));
}

export function resetPulseTimer() {
  lastPulseTime = 0;
}

export function useRealtimeSync(
  supabase: SupabaseClient,
  userId: string | null | undefined,
  isLoading: boolean,
  pathname: string,
) {
  useEffect(() => {
    if (isLoading || !userId) return;
    if (['/login', '/signup'].includes(pathname)) return;

    const watchedTables = ['sync_status', 'user_profiles', 'oauth_tokens'] as const;
    const channelName = `eyes-user-live:${userId}`;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;

    const queueRefresh = () => {
      if (refreshTimer) return;
      refreshTimer = setTimeout(() => {
        refreshTimer = undefined;
        emitRealtimeRefreshEvent();
      }, 2000);
    };

    let channel = supabase.channel(channelName);
    watchedTables.forEach((table) => {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter: `user_id=eq.${userId}` },
        () => { queueRefresh(); }
      );
    });
    channel.subscribe();

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      void supabase.removeChannel(channel);
    };
  }, [isLoading, pathname, supabase, userId]);
}

// ── Background sync hook ───────────────────────────────────────────────────────

const AUTO_BACKGROUND_SYNC_ENABLED = process.env.NEXT_PUBLIC_AUTO_BACKGROUND_SYNC === 'true';

export function useBackgroundSync(
  supabase: SupabaseClient,
  userId: string | null | undefined,
  isLoading: boolean,
  pathname: string,
) {
  useEffect(() => {
    if (!AUTO_BACKGROUND_SYNC_ENABLED || isLoading || !userId) return;
    if (['/login', '/signup'].includes(pathname) || pathname.startsWith('/connect')) return;

    let cancelled = false;
    let syncInFlight = false;

    const runSync = async () => {
      if (cancelled || syncInFlight) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      syncInFlight = true;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const response = await fetch('/api/sync/all?background=1', {
          method: 'POST',
          cache: 'no-store',
          keepalive: true,
          credentials: 'include',
        });
        if (!response.ok && response.status !== 202) {
          console.warn(`[Auth] Background sync returned ${response.status}.`);
        }
      } catch (err) {
        console.warn('[Auth] Background sync failed:', err);
      } finally {
        syncInFlight = false;
      }
    };

    const initialDelay = setTimeout(() => { void runSync(); }, 2500);
    const interval = setInterval(() => { void runSync(); }, 90000);
    const onVisibility = () => { if (document.visibilityState === 'visible') void runSync(); };

    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      clearTimeout(initialDelay);
      clearInterval(interval);
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [isLoading, pathname, supabase, userId]);
}
