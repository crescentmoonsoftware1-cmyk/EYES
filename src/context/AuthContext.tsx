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
import { useRealtimeSync } from './hooks/useRealtimeSync';
import { useBackgroundSync } from './hooks/useBackgroundSync';

export interface User {
  id: string;
  name: string;
  email: string;
  avatar: string;
  plan: string;
  joinedDate: string;
  memoriesIndexed: number;
  behaviorLoggingConsent: boolean;
  onboardingCompleted: boolean;
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
  onboarding_completed: boolean | null;
};

type DBResult<T> = {
  data: T | null;
  error: { message?: string } | null;
};

// Legacy aliases kept for backward compat with existing call sites
type QueryResult<T> = DBResult<T>;
type SupabaseQueryLike<T> = DBResult<T>;

const PROFILE_CACHE_KEY = 'eyes-user-profile-v1';

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
  '/privacy-policy',
  '/cookie-policy',
  '/security-policy',
  '/disclaimer',
  '/accessibility',
  '/terms',
  '/california-notice'
];

const GUEST_ONLY_ROUTES = ['/login', '/signup'];
const ONBOARDING_ROUTE = '/onboarding';

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
        onboardingCompleted: loadCachedProfile()?.onboardingCompleted ?? false,
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
              .select('name,avatar,plan,joined_date,memories_indexed,behavior_logging_consent,onboarding_completed')
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
              onboardingCompleted: fetchResult.data.onboarding_completed ?? false,
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
          .select('name,avatar,plan,joined_date,memories_indexed,behavior_logging_consent,onboarding_completed')
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
          onboardingCompleted: profile.onboarding_completed ?? false,
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
          onboardingCompleted: cached?.onboardingCompleted ?? false,
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
        onboarding_completed: false,
      };

      const { data: inserted } = await quickFetch<QueryResult<UserProfileRow>>(
        supabase
          .from('user_profiles')
          .upsert(newProfile, { onConflict: 'user_id' })
          .select('name,avatar,plan,joined_date,memories_indexed,behavior_logging_consent,onboarding_completed')
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
        onboardingCompleted: final.onboarding_completed ?? false,
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
        onboardingCompleted: false,
      };
    }
  }, [supabase]);

  // ── useAuthSession handles session init + rejection guard ───────────────────
  useAuthSession(supabase, syncProfile, setUser, setIsLoading);
  
  // Realtime & Background Sync Hooks
  useRealtimeSync(supabase, user, isLoading, pathname);
  useBackgroundSync(supabase, user, isLoading, pathname);

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
    } else {
      if (isPublic && pathname !== '/') {
        router.replace('/');
      } else if (!user.onboardingCompleted && !pathname.startsWith(ONBOARDING_ROUTE) && !isOAuthCallback) {
        console.log('[Auth] Redirecting to onboarding');
        router.replace(ONBOARDING_ROUTE);
      } else if (user.onboardingCompleted && pathname.startsWith(ONBOARDING_ROUTE)) {
        router.replace('/?view=readiness');
      }
    }

    return () => clearTimeout(redirectTimer);
  }, [user, isLoading, pathname, router]);



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
      const dbUpdates: { name?: string; avatar?: string; behavior_logging_consent?: boolean; onboarding_completed?: boolean } = {};
      const authUpdates: { name?: string } = {};

      if (updates.name) {
        dbUpdates.name = updates.name;
        authUpdates.name = updates.name;
      }

      if (updates.behaviorLoggingConsent !== undefined) {
        dbUpdates.behavior_logging_consent = updates.behaviorLoggingConsent;
      }
      
      if (updates.onboardingCompleted !== undefined) {
        dbUpdates.onboarding_completed = updates.onboardingCompleted;
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
        .select('name,avatar,plan,joined_date,memories_indexed,behavior_logging_consent,onboarding_completed')
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
          onboardingCompleted: confirmed.onboarding_completed ?? prev.onboardingCompleted,
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

  const isOAuthCallback = pathname.includes('/connect') || pathname.startsWith('/auth');

  // Prevent flash of Dashboard before redirect to onboarding completes
  if (user && !user.onboardingCompleted && !pathname.startsWith(ONBOARDING_ROUTE) && !isOAuthCallback) {
    return (
      <div className={styles.fallbackScreen}>
        <div className={styles.loaderLine} />
        <p>Preparing your experience...</p>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, login, signup, loginWithGoogle, loginWithGithub, loginWithDiscord, logout, resetPassword, supabase, updateUser, theme, setGlobalTheme }}>
      {children}
    </AuthContext.Provider>
  );
}

