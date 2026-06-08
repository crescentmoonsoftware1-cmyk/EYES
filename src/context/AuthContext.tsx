'use client';

import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import styles from './AuthContext.module.css';
import {
  useAuthSession,
  resetPulseTimer,
  getErrorMessage,
  purgeSupabaseLocalAuthArtifacts,
  isRefreshTokenFailure,
} from './hooks/useAuthSession';

export interface User {
  id: string;
  name: string;
  email: string;
  avatar: string;
  plan: string;
  joinedDate: string;
  memoriesIndexed: number;
  behaviorLoggingConsent: boolean;
}

export type AuthResult = {
  success: boolean;
  message?: string;
};

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<AuthResult>;
  signup: (name: string, email: string, password: string) => Promise<AuthResult>;
  loginWithGoogle: () => Promise<AuthResult>;
  loginWithGithub: () => Promise<AuthResult>;
  loginWithDiscord: () => Promise<AuthResult>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<AuthResult>;
  supabase: ReturnType<typeof createClient>;
  updateUser: (updates: Partial<User>) => Promise<AuthResult>;
  theme: 'dark' | 'light' | 'ember';
  setGlobalTheme: (theme: 'dark' | 'light' | 'ember') => void;
}

type AuthMetadata = {
  name?: string;
};

type UserProfileRow = {
  name: string;
  avatar: string | null;
  plan: string | null;
  joined_date: string | null;
  memories_indexed: number | null;
  behavior_logging_consent: boolean | null;
};

type DBResult<T> = {
  data: T | null;
  error: { message?: string } | null;
};

// Legacy aliases kept for backward compat with existing call sites
type QueryResult<T> = DBResult<T>;
type SupabaseQueryLike<T> = DBResult<T>;

const PROFILE_CACHE_KEY = 'eyes-user-profile-v1';
const AUTO_BACKGROUND_SYNC_ENABLED = process.env.NEXT_PUBLIC_AUTO_BACKGROUND_SYNC === 'true';
const REALTIME_PULSE_THROTTLE_MS = 10000;

let _lastPulseTime = 0;
function emitRealtimeRefreshEvent() {
  if (typeof window === 'undefined') return;
  const now = Date.now();
  if (now - _lastPulseTime < REALTIME_PULSE_THROTTLE_MS) return;
  _lastPulseTime = now;
  window.dispatchEvent(new CustomEvent('eyes-realtime-refresh'));
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

// Timeout wrapper for supabase calls — prevents infinite hangs
async function quickFetch<T>(
  promise: PromiseLike<T> | Promise<T>,
  timeoutMs: number,
  fallback: T
): Promise<T> {
  type S = { state: 'resolved'; value: T } | { state: 'rejected'; error: unknown } | { state: 'timed_out' };
  let tid: ReturnType<typeof setTimeout> | undefined;
  const wrapped = Promise.resolve(promise)
    .then<S>(value => ({ state: 'resolved', value }))
    .catch<S>((error: unknown) => ({ state: 'rejected', error }));
  const timeout = new Promise<S>(resolve => {
    tid = setTimeout(() => resolve({ state: 'timed_out' }), timeoutMs);
  });
  const result = await Promise.race([wrapped, timeout]);
  if (tid !== undefined) clearTimeout(tid);
  if (result.state === 'timed_out') return fallback;
  if (result.state === 'rejected') throw result.error;
  return result.value;
}

function loadCachedProfile(): User | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(PROFILE_CACHE_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

function saveCachedProfile(profile: User): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profile));
  } catch { /* quota full — not critical */ }
}

function clearCachedProfile(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(PROFILE_CACHE_KEY);
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
const PUBLIC_ROUTES = [
  '/',
  '/login',
  '/signup',
  '/privacy',
  '/cookie-policy',
  '/security',
  '/disclaimer',
  '/accessibility',
  '/terms',
  '/california-notice'
];

const GUEST_ONLY_ROUTES = ['/login', '/signup'];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [theme, setTheme] = useState<'dark' | 'light' | 'ember'>('dark');
  const [showAuthFallback, setShowAuthFallback] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  const supabase = useMemo(() => createClient(), []);

  const syncInProgressRef = useRef(false);

  const syncProfile = useCallback(async (authUser: { id: string; email?: string; metadata?: AuthMetadata }): Promise<User> => {
    if (syncInProgressRef.current) {
      console.log('[Auth] Profile sync already in progress, skipping duplicate call.');
      // Return a temporary user while the first call finishes
      return {
        id: authUser.id,
        name: authUser.metadata?.name || authUser.email?.split('@')[0] || 'User',
        email: authUser.email || '',
        avatar: (authUser.metadata?.name || authUser.email?.split('@')[0] || 'U').charAt(0).toUpperCase(),
        plan: loadCachedProfile()?.plan || 'Private Beta',   // M1: use cached plan while sync completes
        joinedDate: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short' }),
        memoriesIndexed: 0,
        behaviorLoggingConsent: loadCachedProfile()?.behaviorLoggingConsent ?? true,
      };
    }

    syncInProgressRef.current = true;
    console.log('[Auth] Syncing profile for:', authUser.id);
    const fallbackName = authUser.metadata?.name || authUser.email?.split('@')[0] || 'User';
    const initials = fallbackName.charAt(0).toUpperCase();
    const joinedDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short' });

    // ── Fast path: return cached profile immediately, refresh in background ──
    const cached = loadCachedProfile();
    if (cached && cached.id === authUser.id) {
      syncInProgressRef.current = false;
      // Refresh in background silently — no await, no blocking
      void (async () => {
        try {
          const fetchResult = await quickFetch<QueryResult<UserProfileRow>>(
            supabase
              .from('user_profiles')
              .select('name,avatar,plan,joined_date,memories_indexed,behavior_logging_consent')
              .eq('user_id', authUser.id)
              .maybeSingle()
              .then((result: SupabaseQueryLike<UserProfileRow>) => ({ data: result.data, error: result.error })),
            5000,
            { data: null, error: { message: 'Timed out' } }
          );
          if (fetchResult.data) {
            const fresh: User = {
              id: authUser.id,
              name: fetchResult.data.name,
              email: authUser.email || '',
              avatar: fetchResult.data.avatar || initials,
              plan: fetchResult.data.plan || 'Private Beta',
              joinedDate: fetchResult.data.joined_date || joinedDate,
              memoriesIndexed: fetchResult.data.memories_indexed || 0,
              behaviorLoggingConsent: fetchResult.data.behavior_logging_consent ?? true,
            };
            saveCachedProfile(fresh);
            setUser(fresh); // M2: update live UI with fresh data (was only updating cache)
          }
        } catch { /* background refresh failed — cache still valid */ }
      })();
      return cached;
    }

    try {
      // Increase timeout to 8s to handle DB load during syncs.
      const fetchResult = await quickFetch<QueryResult<UserProfileRow>>(
        supabase
          .from('user_profiles')
          .select('name,avatar,plan,joined_date,memories_indexed,behavior_logging_consent')
          .eq('user_id', authUser.id)
          .maybeSingle()
          .then((result: SupabaseQueryLike<UserProfileRow>) => ({ data: result.data, error: result.error })),
        8000,  // L2: comment said 15s but was actually 5s — now 8s
        { data: null, error: { message: 'Timed out' } }
      );

      const profile = fetchResult.data;
      const isTimeout = fetchResult.error?.message === 'Timed out';

      if (profile) {
        syncInProgressRef.current = false;
        const result: User = {
          id: authUser.id,
          name: profile.name,
          email: authUser.email || '',
          avatar: profile.avatar || initials,
          plan: profile.plan || 'Private Beta',   // ← read from DB, fallback only if null
          joinedDate: profile.joined_date || joinedDate,
          memoriesIndexed: profile.memories_indexed || 0,
          behaviorLoggingConsent: profile.behavior_logging_consent ?? true,
        };
        saveCachedProfile(result); // ← persist for instant load next time
        return result;
      }

      // ONLY create if it's definitely missing, NOT on timeouts
      if (isTimeout) {
        console.warn('[Auth] Profile fetch timed out. Using fallback user to avoid loop.');
        syncInProgressRef.current = false;
        // Use cached plan if available, otherwise default
        const cached = loadCachedProfile();
        return {
          id: authUser.id,
          name: fallbackName,
          email: authUser.email || '',
          avatar: initials,
          plan: cached?.plan || 'Private Beta',
          joinedDate: joinedDate,
          memoriesIndexed: cached?.memoriesIndexed || 0,
          behaviorLoggingConsent: cached?.behaviorLoggingConsent ?? true,
        };
      }

      // Create profile if missing
      console.log('[Auth] Profile confirmed missing, creating new record.');
      const newProfile = {
        user_id: authUser.id,
        name: fallbackName,
        avatar: initials,
        plan: 'Private Beta',
        joined_date: joinedDate,
        memories_indexed: 0,
        behavior_logging_consent: true,
      };

      const { data: inserted } = await quickFetch<QueryResult<UserProfileRow>>(
        supabase
          .from('user_profiles')
          .upsert(newProfile, { onConflict: 'user_id' })
          .select('name,avatar,plan,joined_date,memories_indexed,behavior_logging_consent')
          .maybeSingle()
          .then((result: SupabaseQueryLike<UserProfileRow>) => ({ data: result.data, error: result.error })),
        5000,
        { data: null, error: null }
      );

      syncInProgressRef.current = false;
      const final = inserted || newProfile;
      return {
        id: authUser.id,
        name: final.name,
        email: authUser.email || '',
        avatar: final.avatar || initials,
        plan: final.plan || 'Private Beta',   // ← read from DB even on new profile creation
        joinedDate: joinedDate,
        memoriesIndexed: 0,
        behaviorLoggingConsent: final.behavior_logging_consent ?? true,
      };
    } catch (err) {
      syncInProgressRef.current = false;
      console.error('[Auth] Profile sync error:', err);
      // Return a valid fallback user so the app can continue
      return {
        id: authUser.id,
        name: fallbackName,
        email: authUser.email || '',
        avatar: initials,
        plan: 'Private Beta',
        joinedDate: joinedDate,
        memoriesIndexed: 0,
        behaviorLoggingConsent: true,
      };
    }
  }, [supabase]);

  // ── useAuthSession handles session init + rejection guard ───────────────────
  useAuthSession(supabase, syncProfile, setUser, setIsLoading);
  // NOTE: useRealtimeSync + useBackgroundSync are NOT called here.
  // The inline useEffects below (lines ~392-526) are the active implementation
  // and include additional guards (isUuid check, isPublicRoute, OAuth route).

  // Theme init — sole purpose of this effect after hook extraction
  useEffect(() => {
    let mounted = true;
    const savedTheme = localStorage.getItem('eyes-theme') as 'dark' | 'light' | 'ember';
    if (savedTheme && mounted) {
      setTheme(savedTheme);
      document.documentElement.setAttribute('data-theme', savedTheme);
    }
    return () => { mounted = false; };
  }, []);

  // Avoid flashing a full-screen loader for fast auth checks.
  useEffect(() => {
    if (!isLoading) {
      setShowAuthFallback(false);
      return;
    }

    const timer = setTimeout(() => {
      setShowAuthFallback(true);
    }, 350);

    return () => clearTimeout(timer);
  }, [isLoading]);

  // Routing & Session Persistence Logic
  useEffect(() => {
    if (isLoading) return;

    const isPublic = PUBLIC_ROUTES.includes(pathname);
    const isOAuthCallback = pathname.includes('/connect') || pathname.startsWith('/auth'); // M8: /auth/callback was missing
    const justSuccess =
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('oauth') === 'success';

    let redirectTimer: ReturnType<typeof setTimeout> | undefined;

    if (!user) {
      if (isPublic) return;

      // AUTH ERROR DETECTION: If the URL contains an error from Supabase/Google,
      // redirect to login immediately with the error message.
      const searchParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
      const hashParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.hash.substring(1) : '');
      const errorMsg = searchParams.get('error_description') || hashParams.get('error_description') || searchParams.get('error') || hashParams.get('error');

      if (errorMsg) {
        console.error('[Auth] OAuth Error Detected:', errorMsg);
        router.replace(`/login?error=${encodeURIComponent(errorMsg)}`);
        return;
      }

      // OAUTH DAMPENER: If we just landed from an OAuth provider or a connection flow,
      // be extremely patient. Supabase needs time to exchange the code/hash for a session.
      const hasAuthParams = typeof window !== 'undefined' && (
        window.location.hash.includes('access_token') || 
        window.location.search.includes('code=')
      );

      const delay = (justSuccess || hasAuthParams) ? 15000 : isOAuthCallback ? 10000 : 8000;

      redirectTimer = setTimeout(() => {
        if (!user && !isPublic) {
          // One final check for auth params before giving up
          const stillHasParams = typeof window !== 'undefined' && (
            window.location.hash.includes('access_token') || 
            window.location.search.includes('code=')
          );
          
          if (stillHasParams) {
            console.log('[Auth] Auth params still present, extending grace period.');
            return;
          }

          console.warn('[Auth] Session not detected after grace period. Redirecting to login.');
          router.replace('/login');
        }
      }, delay);
    } else if (isPublic && pathname !== '/') {
      router.replace('/');
    }

    return () => clearTimeout(redirectTimer);
  }, [user, isLoading, pathname, router]);

  // Push-based realtime updates: subscribe to user-scoped table changes.
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

      // Debounce bursts: Only allow UI refresh every 2 seconds to damp the pulse.
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
  }, [isLoading, pathname, supabase, user]);

  // Lightweight realtime orchestrator: periodically fan out connector sync in background.
  useEffect(() => {
    if (!AUTO_BACKGROUND_SYNC_ENABLED) return;
    if (isLoading || !user) return;

    const isPublicRoute = ['/login', '/signup'].includes(pathname);
    if (isPublicRoute) return;
    if (pathname.startsWith('/connect')) return;

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

  const login = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { success: false, message: error.message };
    if (!data.user) return { success: false, message: 'Identity missing.' };
    
    setUser(await syncProfile({ id: data.user.id, email: data.user.email, metadata: data.user.user_metadata }));
    return { success: true };
  }, [supabase, syncProfile]);

  const signup = useCallback(async (name: string, email: string, password: string): Promise<AuthResult> => {
    const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { name } } });
    if (error) return { success: false, message: error.message };
    if (!data.user) return { success: false, message: 'Signup failed.' };

    setUser(await syncProfile({ id: data.user.id, email, metadata: { name } }));
    return { success: true };
  }, [supabase, syncProfile]);

  const logout = useCallback(async () => {
    clearCachedProfile();         // L7: clear cache so next login doesn't flash stale data
    resetPulseTimer();            // L8: reset pulse throttle (via hook export)
    await supabase.auth.signOut();
    setUser(null);
    router.replace('/login');
  }, [supabase, router]);

  const loginWithGoogle = useCallback(async (): Promise<AuthResult> => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : undefined,
      }
    });
    if (error) return { success: false, message: error.message };
    return { success: true };
  }, [supabase]);

  const loginWithGithub = useCallback(async (): Promise<AuthResult> => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: {
        redirectTo: typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : undefined,
      }
    });
    if (error) return { success: false, message: error.message };
    return { success: true };
  }, [supabase]);

  const loginWithDiscord = useCallback(async (): Promise<AuthResult> => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'discord',
      options: {
        redirectTo: typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : undefined,
      }
    });
    if (error) return { success: false, message: error.message };
    return { success: true };
  }, [supabase]);

  const resetPassword = useCallback(async (email: string): Promise<AuthResult> => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: typeof window !== 'undefined' ? `${window.location.origin}/reset-password` : undefined,  // M6: SSR guard
    });
    if (error) return { success: false, message: error.message };
    return { success: true };
  }, [supabase]);

  /**
   * Updates mutable user profile fields.
   * L4 note: Only `name` (and avatar initial if it's a single char) are writable here.
   * Fields `plan`, `joinedDate`, `memoriesIndexed` are read-only — managed server-side.
   */
  const updateUser = useCallback(async (updates: Partial<User>): Promise<AuthResult> => {

    if (!user) return { success: false, message: 'Not authenticated' };

    try {
      const dbUpdates: { name?: string; avatar?: string; behavior_logging_consent?: boolean } = {};
      const authUpdates: { name?: string } = {};

      if (updates.name) {
        dbUpdates.name = updates.name;
        authUpdates.name = updates.name;
      }

      if (updates.behaviorLoggingConsent !== undefined) {
        dbUpdates.behavior_logging_consent = updates.behaviorLoggingConsent;
      }
      
      // If current avatar is just an initial, update it to match the new name's initial
      if (user.avatar.length <= 2 && updates.name) {
        dbUpdates.avatar = updates.name.charAt(0).toUpperCase();
      }

      // 1. Update Auth Metadata first to ensure identity is consistent
      if (updates.name) {
        const { error: authError } = await supabase.auth.updateUser({
          data: authUpdates
        });
        if (authError) throw authError;
      }

      // 2. Update Database and GET the confirmed record back
      const { data: confirmed, error: dbError } = await supabase
        .from('user_profiles')
        .update(dbUpdates)
        .eq('user_id', user.id)
        .select('name,avatar,plan,joined_date,memories_indexed,behavior_logging_consent')
        .single();

      if (dbError) throw dbError;

      // 3. Update local state with the CONFIRMED data from the DB
      if (confirmed) {
        setUser(prev => prev ? {
          ...prev,
          name: confirmed.name,
          avatar: confirmed.avatar || confirmed.name.charAt(0).toUpperCase(),
          plan: confirmed.plan || prev.plan,
          memoriesIndexed: confirmed.memories_indexed || prev.memoriesIndexed,
          behaviorLoggingConsent: confirmed.behavior_logging_consent ?? prev.behaviorLoggingConsent,
        } : null);
      }
      
      return { success: true };
    } catch (err) {
      console.error('[Auth] Update failed:', err);
      return { success: false, message: getErrorMessage(err) };
    }
  }, [supabase, user]);

  const setGlobalTheme = useCallback((newTheme: 'dark' | 'light' | 'ember') => {
    setTheme(newTheme);
    if (typeof document !== 'undefined') document.documentElement.setAttribute('data-theme', newTheme); // L9: SSR guard
    localStorage.setItem('eyes-theme', newTheme);
  }, []);

  // Master Render
  if (isLoading && showAuthFallback) {
    return (
      <div className={styles.fallbackScreen}>
        <div className={styles.loaderLine} />
        <p>Initializing EYES Secure Session...</p>
      </div>
    );
  }

  if (isLoading) return null;

  const isPublic = PUBLIC_ROUTES.includes(pathname);
  if (!user && !isPublic) return null;

  const isGuestOnly = GUEST_ONLY_ROUTES.includes(pathname);
  if (user && isGuestOnly) return null;

  return (
    <AuthContext.Provider value={{ user, isLoading, login, signup, loginWithGoogle, loginWithGithub, loginWithDiscord, logout, resetPassword, supabase, updateUser, theme, setGlobalTheme }}>
      {children}
    </AuthContext.Provider>
  );
}

