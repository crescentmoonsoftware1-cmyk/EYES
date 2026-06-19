import { createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';

/**
 * Next.js 16 Proxy (replaces middleware.ts).
 * Handles:
 *  1. Supabase session refresh on every request
 *  2. Content-Security-Policy headers
 */
export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  // Refresh Supabase auth session so server components can read the current user
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh session — keep this call, it's what keeps auth alive
  await supabase.auth.getUser();

  // ── Content Security Policy ───────────────────────────────────────────────
  // NOTE: Do NOT add a nonce to script-src without threading it through every
  // <Script> tag in layout.tsx. The CSP spec silently ignores 'unsafe-inline'
  // when any nonce or hash is present, which breaks all Next.js inline scripts.
  const isDev = process.env.NODE_ENV === 'development';

  const csp = [
    `default-src 'self'`,
    `script-src 'self' 'unsafe-inline' 'unsafe-eval'`,
    `worker-src 'self' blob:`,
    `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
    `img-src 'self' blob: data: https:`,
    `font-src 'self' https://fonts.gstatic.com data:`,
    `media-src 'self' https: blob: data:`,
    `connect-src 'self' https: wss: ws:`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    isDev ? '' : `upgrade-insecure-requests`,
  ].filter(Boolean).join('; ');

  supabaseResponse.headers.set('Content-Security-Policy', csp);
  supabaseResponse.headers.set('X-Content-Type-Options', 'nosniff');
  supabaseResponse.headers.set('X-Frame-Options', 'DENY');

  return supabaseResponse;
}

export const config = {
  matcher: [
    {
      source: '/((?!api|_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
