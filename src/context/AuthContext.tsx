'use client';

import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from 'react';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { useRouter, usePathname } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import styles from './AuthContext.module.css';

export interface User {
  id: string;
  name: string;
  email: string;
  avatar: string;
  plan: string;
  joinedDate: string;
  memoriesIndexed: number;
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
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<AuthResult>;
  supabase: ReturnType<typeof createClient>;
  updateUser: (updates: Partial<User>) => Promise<AuthResult>;
  theme: 'dark' | 'light';
  setGlobalTheme: (theme: 'dark' | 'light') => void;
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
};

type QueryResult<T> = {
  data: T | null;
  error: { message?: string } | null;
};

type SessionResult = {
  data: { session: Session | null };
  error: { message?: string } | null;
};

type SupabaseQueryLike<T> = {
  data: T | null;
  error: { message?: string } | null;
};

const REALTIME_REFRESH_EVENT = 'eyes-realtime-refresh';
const PULSE_THROTTLE_MS = 10000; // Hard 10s throttle for global stability
const AUTO_BACKGROUND_SYNC_ENABLED = process.env.NEXT_PUBLIC_AUTO_BACKGROUND_SYNC === 'true';
const PROFILE_CACHE_KEY = 'eyes-user-profile-v1';

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

let lastPulseTime = 0;
function emitRealtimeRefreshEvent() {
  if (typeof window === 'undefined') return;
  
  const now = Date.now();
  if (now - lastPulseTime < PULSE_THROTTLE_MS) {
    return;
  }
  
  lastPulseTime = now;
  console.log('[Auth] Global Neural Pulse emitted. Throttling active (10s).');
  window.dispatchEvent(new CustomEvent(REALTIME_REFRESH_EVENT));
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isRefreshTokenFailure(message?: string) {
  const text = (message || '').toLowerCase();
  return (
    text.includes('invalid refresh token') ||
    text.includes('refresh token not found') ||
    (text.includes('refresh token') && text.includes('invalid'))
  );
}

function getErrorMessage(error: unknown) {
  if (typeof error === 'string') {
    return error;
  }

  if (error && typeof error === 'object') {
    const detail = error as {
      message?: string;
      error_description?: string;
      error?: string;
      name?: string;
    };

    const candidates = [detail.message, detail.error_description, detail.error, detail.name]
      .filter((value): value is string => Boolean(value && value.trim()));

    if (candidates.length > 0) {
      return candidates.join(' ');
    }
  }

  return String(error ?? '');
}

function isSupabaseLockStealFailure(message?: string) {
  const text = (message || '').toLowerCase();
  return (
    text.includes('was released because another request stole it') ||
    (text.includes('lock "lock:sb-') && text.includes('stole it'))
  );
}

function purgeSupabaseLocalAuthArtifacts() {
  if (typeof window === 'undefined') return;

  const supabaseRef = process.env.NEXT_PUBLIC_SUPABASE_URL?.split('//')[1]?.split('.')?.[0];
  const preferredKey = supabaseRef ? `sb-${supabaseRef}-auth-token` : null;

  const localKeys = Object.keys(window.localStorage);
  localKeys.forEach((key) => {
    const isPreferred = preferredKey ? key === preferredKey : false;
    const isLegacySupabaseKey = key.startsWith('sb-') && key.endsWith('-auth-token');
    if (isPreferred || isLegacySupabaseKey) {
      window.localStorage.removeItem(key);
    }
  });

  const sessionKeys = Object.keys(window.sessionStorage);
  sessionKeys.forEach((key) => {
    const isPreferred = preferredKey ? key === preferredKey : false;
    const isLegacySupabaseKey = key.startsWith('sb-') && key.endsWith('-auth-token');
    if (isPreferred || isLegacySupabaseKey) {
      window.sessionStorage.removeItem(key);
    }
  });
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

// Helper to avoid infinite hanging on external calls
async function quickFetch<T>(promise: PromiseLike<T> | Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  type SettledResult =
    | { state: 'resolved'; value: T }
    | { state: 'rejected'; error: unknown }
    | { state: 'timed_out' };

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const wrappedPromise = Promise.resolve(promise)
    .then<SettledResult>((value) => ({ state: 'resolved', value }))
    .catch<SettledResult>((error: unknown) => ({ state: 'rejected', error }));

  const timeoutPromise = new Promise<SettledResult>((resolve) => {
    timeoutId = setTimeout(() => {
      console.warn(`[Auth] Async operation exceeded ${timeoutMs}ms. Using fallback.`);
      resolve({ state: 'timed_out' });
    }, timeoutMs);
  });

  const result = await Promise.race([wrappedPromise, timeoutPromise]);
  if (timeoutId !== undefined) {
    clearTimeout(timeoutId);
  }

  if (result.state === 'timed_out') {
    return fallback;
  }

  if (result.state === 'rejected') {
    throw result.error;
  }

  return result.value;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [showAuthFallback, setShowAuthFallback] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const authInitStartedRef = useRef(false);

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
        plan: 'Private Beta',
        joinedDate: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short' }),
        memoriesIndexed: 0,
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
              .select('name,avatar,plan,joined_date,memories_indexed')
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
            };
            saveCachedProfile(fresh);
          }
        } catch { /* background refresh failed — cache still valid */ }
      })();
      return cached;
    }

    try {
      // Increase timeout to 15s to handle DB load during syncs.
      const fetchResult = await quickFetch<QueryResult<UserProfileRow>>(
        supabase
          .from('user_profiles')
          .select('name,avatar,plan,joined_date,memories_indexed')
          .eq('user_id', authUser.id)
          .maybeSingle()
          .then((result: SupabaseQueryLike<UserProfileRow>) => ({ data: result.data, error: result.error })),
        5000,
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
          plan: profile.plan || 'Private Beta',
          joinedDate: profile.joined_date || joinedDate,
          memoriesIndexed: profile.memories_indexed || 0,
        };
        saveCachedProfile(result); // ← persist for instant load next time
        return result;
      }

      // ONLY create if it's definitely missing, NOT on timeouts
      if (isTimeout) {
        console.warn('[Auth] Profile fetch timed out. Using fallback user to avoid loop.');
        syncInProgressRef.current = false;
        return {
          id: authUser.id,
          name: fallbackName,
          email: authUser.email || '',
          avatar: initials,
          plan: 'Private Beta',
          joinedDate: joinedDate,
          memoriesIndexed: 0,
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
      };

      const { data: inserted } = await quickFetch<QueryResult<UserProfileRow>>(
        supabase
          .from('user_profiles')
          .upsert(newProfile, { onConflict: 'user_id' })
          .select('name,avatar,plan,joined_date,memories_indexed')
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
        plan: 'Private Beta',
        joinedDate: joinedDate,
        memoriesIndexed: 0,
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
      };
    }
  }, [supabase]);

  // Initial Hydration Logic
  useEffect(() => {
    if (authInitStartedRef.current) {
      return;
    }
    authInitStartedRef.current = true;

    let mounted = true;
    console.log('[Auth] Initializing Secure Session...');

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const message = getErrorMessage(event.reason);

      if (isSupabaseLockStealFailure(message)) {
        event.preventDefault();
        console.warn('[Auth] Suppressing transient Supabase lock contention rejection.');
        return;
      }

      if (!isRefreshTokenFailure(message)) {
        return;
      }

      event.preventDefault();
      console.warn('[Auth] Unhandled invalid refresh token rejection detected. Purging local auth state.');
      void supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
      purgeSupabaseLocalAuthArtifacts();
      if (mounted) {
        setUser(null);
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('unhandledrejection', handleUnhandledRejection);
    }

    // HARD COLD SAFETY: Never hang the app forever during initialization.
    const safetyTimer = setTimeout(() => {
      if (!mounted) {
        return;
      }

      setIsLoading((prev) => {
        if (prev) {
          console.warn('[Auth] Initialization safety timer tripped. Forcing transition.');
        }
        return false;
      });
    }, 12000);

    // Initialize theme from storage
    const savedTheme = localStorage.getItem('eyes-theme') as 'dark' | 'light';
    if (savedTheme) {
      setTheme(savedTheme);
      document.documentElement.setAttribute('data-theme', savedTheme);
    }

    const initialize = async () => {
      try {
        const { data: { session }, error: sessionError } = await quickFetch<SessionResult>(
          supabase.auth.getSession(),
          9000,
          { data: { session: null }, error: null }
        );

        if (sessionError) {
          if (isRefreshTokenFailure(sessionError.message)) {
            console.warn('[Auth] Invalid refresh token detected. Purging local Supabase auth artifacts.');
            await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
            purgeSupabaseLocalAuthArtifacts();
            if (mounted) {
              setUser(null);
            }
            return;
          }
          throw sessionError;
        }

        if (session?.user && mounted) {
          const profile = await syncProfile({
            id: session.user.id,
            email: session.user.email,
            metadata: session.user.user_metadata
          });
          if (mounted) setUser(profile);
        }
      } catch (err) {
        const message = getErrorMessage(err);
        if (isRefreshTokenFailure(message)) {
          console.warn('[Auth] Refresh token failure during session bootstrap. Purging local Supabase auth artifacts.');
          await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
          purgeSupabaseLocalAuthArtifacts();
        } else {
          console.error('[Auth] Initial session sync failed (purging stale state):', err);
        }
        if (mounted) {
          setUser(null);
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
          clearTimeout(safetyTimer);
          console.log('[Auth] System Ready.');
        }
      }
    };

    // Sub to future changes — skip INITIAL_SESSION if user already loaded
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event: AuthChangeEvent, session: Session | null) => {
      console.log('[Auth] State Event:', event);
      if (event === 'INITIAL_SESSION' && user) {
        // Already have user from cache/init — skip redundant re-sync
        return;
      }
      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session?.user) {
        const profile = await syncProfile({
          id: session.user.id,
          email: session.user.email,
          metadata: session.user.user_metadata
        });
        if (mounted) setUser(profile);
      } else if (event === 'SIGNED_OUT') {
        clearCachedProfile();
        if (mounted) setUser(null);
      }
    });

    initialize();

    return () => {
      mounted = false;
      clearTimeout(safetyTimer);
      if (typeof window !== 'undefined') {
        window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      }
      subscription.unsubscribe();
    };
  }, [supabase, syncProfile]);

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

    const isPublic = ['/login', '/signup'].includes(pathname);
    const isOAuthCallback = pathname.includes('/connect');
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
    } else if (isPublic) {
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
      let syncTriggered = false;
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
        });

        syncTriggered = true;

        if (!response.ok && response.status !== 202) {
          console.warn(`[Auth] Background sync fan-out returned ${response.status}.`);
        }
      } catch (error) {
        console.warn('[Auth] Background sync fan-out failed:', error);
      } finally {
        syncInFlight = false;
        if (syncTriggered) {
          // Refresh UI shortly after trigger and again after providers usually finish.
          setTimeout(emitRealtimeRefreshEvent, 1200);
          setTimeout(emitRealtimeRefreshEvent, 4500);
        }
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

  const resetPassword = useCallback(async (email: string): Promise<AuthResult> => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) return { success: false, message: error.message };
    return { success: true };
  }, [supabase]);

  const updateUser = useCallback(async (updates: Partial<User>): Promise<AuthResult> => {
    if (!user) return { success: false, message: 'Not authenticated' };

    try {
      const dbUpdates: { name?: string; avatar?: string } = {};
      const authUpdates: { name?: string } = {};

      if (updates.name) {
        dbUpdates.name = updates.name;
        authUpdates.name = updates.name;
      }
      
      // If current avatar is just an initial, update it to match the new name's initial
      if (user.avatar.length <= 2 && updates.name) {
        dbUpdates.avatar = updates.name.charAt(0).toUpperCase();
      }

      // 1. Update Auth Metadata first to ensure identity is consistent
      const { error: authError } = await supabase.auth.updateUser({
        data: authUpdates
      });
      if (authError) throw authError;

      // 2. Update Database and GET the confirmed record back
      const { data: confirmed, error: dbError } = await supabase
        .from('user_profiles')
        .update(dbUpdates)
        .eq('user_id', user.id)
        .select('name,avatar,plan,joined_date,memories_indexed')
        .single();

      if (dbError) throw dbError;

      // 3. Update local state with the CONFIRMED data from the DB
      if (confirmed) {
        setUser(prev => prev ? {
          ...prev,
          name: confirmed.name,
          avatar: confirmed.avatar || confirmed.name.charAt(0).toUpperCase(),
          plan: confirmed.plan || prev.plan,
          memoriesIndexed: confirmed.memories_indexed || prev.memoriesIndexed
        } : null);
      }
      
      return { success: true };
    } catch (err) {
      console.error('[Auth] Update failed:', err);
      return { success: false, message: getErrorMessage(err) };
    }
  }, [supabase, user]);

  const setGlobalTheme = useCallback((newTheme: 'dark' | 'light') => {
    setTheme(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
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

  const isPublic = ['/login', '/signup'].includes(pathname);
  if (!user && !isPublic) return null;
  if (user && isPublic) return null;

  return (
    <AuthContext.Provider value={{ user, isLoading, login, signup, loginWithGoogle, logout, resetPassword, supabase, updateUser, theme, setGlobalTheme }}>
      {children}
    </AuthContext.Provider>
  );
}

