import { createBrowserClient } from '@supabase/ssr'

type BrowserClient = ReturnType<typeof createBrowserClient>

let authLockQueue: Promise<unknown> = Promise.resolve()

async function withInTabAuthLock<T>(
  _name: string,
  _acquireTimeout: number,
  fn: () => Promise<T>
): Promise<T> {
  const run = authLockQueue.then(() => fn(), () => fn())
  authLockQueue = run.then(() => undefined, () => undefined)
  return run
}

function isRefreshTokenFailure(message: string): boolean {
  const normalized = message.toLowerCase()
  return (
    normalized.includes('invalid refresh token') ||
    normalized.includes('refresh token not found') ||
    (normalized.includes('refresh token') && normalized.includes('invalid'))
  )
}

function extractReasonMessage(reason: unknown): string {
  if (typeof reason === 'string') {
    return reason
  }

  if (reason && typeof reason === 'object') {
    const detail = reason as {
      message?: string
      error_description?: string
      error?: string
      name?: string
    }

    const candidates = [
      detail.message,
      detail.error_description,
      detail.error,
      detail.name,
    ].filter((value): value is string => Boolean(value && value.trim()))

    if (candidates.length > 0) {
      return candidates.join(' ')
    }
  }

  return String(reason ?? '')
}

function purgeSupabaseAuthStorage(storageKey: string): void {
  if (typeof window === 'undefined') {
    return
  }

  const isAuthStorageKey = (key: string) => {
    const isPreferred = key === storageKey
    const isLegacySupabaseKey = key.startsWith('sb-') && key.endsWith('-auth-token')
    return isPreferred || isLegacySupabaseKey
  }

  for (const key of Object.keys(window.localStorage)) {
    if (isAuthStorageKey(key)) {
      window.localStorage.removeItem(key)
    }
  }

  for (const key of Object.keys(window.sessionStorage)) {
    if (isAuthStorageKey(key)) {
      window.sessionStorage.removeItem(key)
    }
  }
}

function installRefreshTokenRejectionGuard(storageKey: string): void {
  if (typeof window === 'undefined') {
    return
  }

  window.__THE_EYES_SUPABASE_STORAGE_KEY__ = storageKey

  if (window.__THE_EYES_SUPABASE_REJECTION_GUARD_INSTALLED__) {
    return
  }

  window.__THE_EYES_SUPABASE_REJECTION_GUARD_INSTALLED__ = true
  window.addEventListener('unhandledrejection', (event) => {
    const message = extractReasonMessage(event.reason)

    if (!isRefreshTokenFailure(message)) {
      return
    }

    event.preventDefault()

    const activeStorageKey = window.__THE_EYES_SUPABASE_STORAGE_KEY__ ?? storageKey
    purgeSupabaseAuthStorage(activeStorageKey)

    if (window.__THE_EYES_SUPABASE_CLIENT__) {
      void window.__THE_EYES_SUPABASE_CLIENT__.auth.signOut({ scope: 'local' }).catch(() => undefined)
    }
  })
}

declare global {
  interface Window {
    __THE_EYES_SUPABASE_CLIENT__?: BrowserClient
    __THE_EYES_SUPABASE_REJECTION_GUARD_INSTALLED__?: boolean
    __THE_EYES_SUPABASE_STORAGE_KEY__?: string
  }
}

export function createClient() {
  const projectRef = process.env.NEXT_PUBLIC_SUPABASE_URL?.split('//')[1]?.split('.')[0]
  const storageKey = projectRef ? `sb-${projectRef}-auth-token` : 'sb-auth-token'

  if (typeof window !== 'undefined') {
    installRefreshTokenRejectionGuard(storageKey)
    if (window.__THE_EYES_SUPABASE_CLIENT__) {
      return window.__THE_EYES_SUPABASE_CLIENT__
    }
  }

  const client = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        // autoRefreshToken: true (default) — tokens refresh automatically before expiry.
        // withInTabAuthLock serializes concurrent refresh calls within the same tab,
        // preventing the race condition that originally motivated disabling this.
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        storageKey,
        lock: withInTabAuthLock,
      }
    }
  )

  if (typeof window !== 'undefined') {
    window.__THE_EYES_SUPABASE_CLIENT__ = client
  }

  return client
}
