/**
 * Security Fixes Test Suite
 * Tests for the 5 security patches applied on 2026-06-22.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ─── Mock Supabase ────────────────────────────────────────────────────────────
vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
}));

vi.mock('@/utils/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

// Mock @supabase/ssr so auth/callback doesn't try to read real cookies
vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      exchangeCodeForSession: vi.fn().mockResolvedValue({
        data: { session: { user: { id: 'u1' } } },
        error: null,
      }),
    },
  })),
}));

import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';

const mockCreateClient    = vi.mocked(createClient);
const mockCreateAdminClient = vi.mocked(createAdminClient);

// ─────────────────────────────────────────────────────────────────────────────
// FIX 1 — Open Redirect: /auth/callback
// ─────────────────────────────────────────────────────────────────────────────
describe('Fix 1 — Open Redirect: GET /auth/callback', () => {
  it('redirects to / when next is a protocol-relative external URL (//evil.com)', async () => {
    const { GET } = await import('@/app/auth/callback/route');
    const req = new NextRequest('http://localhost/auth/callback?code=abc&next=//evil.com/phishing');
    const res = await GET(req);
    const location = res.headers.get('location') ?? '';
    expect(location).not.toContain('evil.com');
    expect(location).toMatch(/^http:\/\/localhost\/?$/);
  });

  it('redirects to / when next is a full https external URL', async () => {
    const { GET } = await import('@/app/auth/callback/route');
    const req = new NextRequest('http://localhost/auth/callback?code=abc&next=https://evil.com');
    const res = await GET(req);
    const location = res.headers.get('location') ?? '';
    expect(location).not.toContain('evil.com');
    expect(location).toMatch(/^http:\/\/localhost\/?$/);
  });

  it('allows safe relative path /dashboard', async () => {
    const { GET } = await import('@/app/auth/callback/route');
    const req = new NextRequest('http://localhost/auth/callback?code=abc&next=/dashboard');
    const res = await GET(req);
    const location = res.headers.get('location') ?? '';
    expect(location).toContain('/dashboard');
  });

  it('defaults to / when no next param provided', async () => {
    const { GET } = await import('@/app/auth/callback/route');
    const req = new NextRequest('http://localhost/auth/callback?code=abc');
    const res = await GET(req);
    const location = res.headers.get('location') ?? '';
    expect(location).toMatch(/^http:\/\/localhost\/?$/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FIX 2 — PATCH Field Injection: /api/actions/queue
// ─────────────────────────────────────────────────────────────────────────────
describe('Fix 2 — Field Injection: PATCH /api/actions/queue', () => {
  const VALID_USER_ID = '11111111-1111-4111-8111-111111111111';
  const ACTION_ID     = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  function makeClient(updateSpy: ReturnType<typeof vi.fn>) {
    return {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: VALID_USER_ID } },
          error: null,
        }),
      },
      from: vi.fn().mockReturnValue({
        update: updateSpy,
      }),
    };
  }

  function makeUpdateChain(eqSpy2: ReturnType<typeof vi.fn>) {
    const eqSpy1 = vi.fn().mockReturnValue({ eq: eqSpy2 });
    const updateSpy = vi.fn().mockReturnValue({ eq: eqSpy1 });
    return { updateSpy, eqSpy1, eqSpy2 };
  }

  beforeEach(() => mockCreateClient.mockReset());

  it('strips injected user_id from the patch payload', async () => {
    const eqSpy2 = vi.fn().mockResolvedValue({ error: null });
    const { updateSpy } = makeUpdateChain(eqSpy2);
    mockCreateClient.mockResolvedValue(makeClient(updateSpy) as never);

    const { PATCH } = await import('@/app/api/actions/queue/route');
    await PATCH(new Request('http://localhost/api/actions/queue', {
      method: 'PATCH',
      body: JSON.stringify({ id: ACTION_ID, status: 'dismissed', user_id: 'attacker-uuid' }),
    }));

    const patched = updateSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(patched).not.toHaveProperty('user_id');
  });

  it('strips injected confidence and memory_id from the patch payload', async () => {
    const eqSpy2 = vi.fn().mockResolvedValue({ error: null });
    const { updateSpy } = makeUpdateChain(eqSpy2);
    mockCreateClient.mockResolvedValue(makeClient(updateSpy) as never);

    const { PATCH } = await import('@/app/api/actions/queue/route');
    await PATCH(new Request('http://localhost/api/actions/queue', {
      method: 'PATCH',
      body: JSON.stringify({ id: ACTION_ID, status: 'approved', confidence: 999, memory_id: 'stolen' }),
    }));

    const patched = updateSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(patched).not.toHaveProperty('confidence');
    expect(patched).not.toHaveProperty('memory_id');
  });

  it('allows the whitelisted field "notes" through', async () => {
    const eqSpy2 = vi.fn().mockResolvedValue({ error: null });
    const { updateSpy } = makeUpdateChain(eqSpy2);
    mockCreateClient.mockResolvedValue(makeClient(updateSpy) as never);

    const { PATCH } = await import('@/app/api/actions/queue/route');
    await PATCH(new Request('http://localhost/api/actions/queue', {
      method: 'PATCH',
      body: JSON.stringify({ id: ACTION_ID, status: 'approved', notes: 'Looks good' }),
    }));

    const patched = updateSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(patched).toHaveProperty('notes', 'Looks good');
  });

  it('always scopes the update to the authenticated user_id', async () => {
    const eqSpy2 = vi.fn().mockResolvedValue({ error: null });
    const { updateSpy } = makeUpdateChain(eqSpy2);
    mockCreateClient.mockResolvedValue(makeClient(updateSpy) as never);

    const { PATCH } = await import('@/app/api/actions/queue/route');
    await PATCH(new Request('http://localhost/api/actions/queue', {
      method: 'PATCH',
      body: JSON.stringify({ id: ACTION_ID, status: 'dismissed' }),
    }));

    expect(eqSpy2).toHaveBeenCalledWith('user_id', VALID_USER_ID);
  });

  it('returns 401 for unauthenticated requests', async () => {
    mockCreateClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) },
    } as never);

    const { PATCH } = await import('@/app/api/actions/queue/route');
    const res = await PATCH(new Request('http://localhost/api/actions/queue', {
      method: 'PATCH',
      body: JSON.stringify({ id: ACTION_ID, status: 'dismissed' }),
    }));
    expect(res.status).toBe(401);
  });

  it('returns 400 when status is missing from the body', async () => {
    mockCreateClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: VALID_USER_ID } }, error: null }),
      },
    } as never);

    const { PATCH } = await import('@/app/api/actions/queue/route');
    const res = await PATCH(new Request('http://localhost/api/actions/queue', {
      method: 'PATCH',
      body: JSON.stringify({ id: ACTION_ID }), // no status
    }));
    expect(res.status).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FIX 3 — Admin Funnel: always enforces a row limit
// ─────────────────────────────────────────────────────────────────────────────
describe('Fix 3 — Admin Funnel: 401 and 403 guards', () => {
  beforeEach(() => {
    mockCreateClient.mockReset();
    mockCreateAdminClient.mockReset();
    process.env.ADMIN_EMAILS = 'admin@test.com';
  });

  it('returns 401 for unauthenticated requests', async () => {
    mockCreateClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) },
    } as never);

    const { GET } = await import('@/app/api/admin/funnel/route');
    const res = await GET(new NextRequest('http://localhost/api/admin/funnel'));
    expect(res.status).toBe(401);
  });

  it('returns 403 when authenticated user is not an admin', async () => {
    process.env.ADMIN_EMAILS = 'real-admin@test.com';
    mockCreateClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'u2', email: 'attacker@test.com' } },
          error: null,
        }),
      },
    } as never);

    const { GET } = await import('@/app/api/admin/funnel/route');
    const res = await GET(new NextRequest('http://localhost/api/admin/funnel'));
    expect(res.status).toBe(403);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FIX 4 — Secret Exposure: NEXT_PUBLIC_ADMIN_EMAILS must not be in env
// ─────────────────────────────────────────────────────────────────────────────
describe('Fix 4 — Secret Exposure: NEXT_PUBLIC_ADMIN_EMAILS removed', () => {
  it('NEXT_PUBLIC_ADMIN_EMAILS is not defined (would leak admin email to browser if set)', () => {
    expect(process.env.NEXT_PUBLIC_ADMIN_EMAILS).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FIX 5 — Chat Route: auth and input guards
// ─────────────────────────────────────────────────────────────────────────────
describe('Fix 5 — Chat Route: /api/chat auth & input guards', () => {
  beforeEach(() => mockCreateClient.mockReset());

  it('returns 401 when user session is missing', async () => {
    mockCreateClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) },
    } as never);

    const { POST } = await import('@/app/api/chat/route');
    const res = await POST(new Request('http://localhost/api/chat', {
      method: 'POST',
      body: JSON.stringify({ message: 'hello' }),
    }));
    expect(res.status).toBe(401);
  });

  it('returns 400 when message is blank', async () => {
    mockCreateClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }),
      },
    } as never);

    const { POST } = await import('@/app/api/chat/route');
    const res = await POST(new Request('http://localhost/api/chat', {
      method: 'POST',
      body: JSON.stringify({ message: '   ' }),
    }));
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toContain('No message');
  });
});
