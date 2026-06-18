/**
 * Unit tests for resolveSyncActor in src/utils/sync/actor.ts
 *
 * We mock the supabase factory methods and `createUserClient` so
 * we can test all authentication branches in isolation.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

// ── Mock Supabase factories before importing the module under test ─────────────
vi.mock('@/utils/supabase/server', () => ({
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
}));

import { resolveSyncActor } from '@/utils/sync/actor';
import { createAdminClient, createClient as createUserClient } from '@/utils/supabase/server';

const VALID_UUID = '12345678-1234-4234-8234-123456789abc';
const VALID_SECRET = 'dummy-cron-secret'; // matches setup.ts env

function buildRequest(headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/sync', { headers });
}

function buildAdminMock(user: Record<string, unknown> | null, error: unknown = null) {
  return {
    auth: {
      admin: {
        getUserById: vi.fn().mockResolvedValue({ data: { user }, error }),
      },
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────

describe('resolveSyncActor — CRON authentication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when only cron-user-id is present (missing secret)', async () => {
    const req = buildRequest({ 'x-cron-user-id': VALID_UUID });
    const result = await resolveSyncActor(req);
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.status).toBe(401);
      expect(result.error).toMatch(/missing cron/i);
    }
  });

  it('returns 401 when only cron-secret is present (missing user-id)', async () => {
    const req = buildRequest({ 'x-cron-secret': VALID_SECRET });
    const result = await resolveSyncActor(req);
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.status).toBe(401);
    }
  });

  it('returns 401 when cron secret is wrong', async () => {
    const req = buildRequest({
      'x-cron-secret': 'wrong-secret',
      'x-cron-user-id': VALID_UUID,
    });
    const result = await resolveSyncActor(req);
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.status).toBe(401);
    }
  });

  it('returns 400 when cron user-id is not a valid UUID', async () => {
    const req = buildRequest({
      'x-cron-secret': VALID_SECRET,
      'x-cron-user-id': 'not-a-uuid',
    });
    const result = await resolveSyncActor(req);
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.status).toBe(400);
      expect(result.error).toMatch(/invalid cron user id/i);
    }
  });

  it('returns SyncActor with mode=cron on valid cron auth', async () => {
    const adminMock = buildAdminMock({
      id: VALID_UUID,
      email: 'cron@system.internal',
      user_metadata: { name: 'Cron Worker' },
    });
    vi.mocked(createAdminClient).mockReturnValue(adminMock as unknown as ReturnType<typeof createAdminClient>);

    const req = buildRequest({
      'x-cron-secret': VALID_SECRET,
      'x-cron-user-id': VALID_UUID,
    });
    const result = await resolveSyncActor(req);

    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.mode).toBe('cron');
      expect(result.userId).toBe(VALID_UUID);
      expect(result.userEmail).toBe('cron@system.internal');
      expect(result.userName).toBe('Cron Worker');
    }
  });

  it('returns 500 when Supabase admin lookup fails', async () => {
    const adminMock = buildAdminMock(null, new Error('DB unavailable'));
    vi.mocked(createAdminClient).mockReturnValue(adminMock as unknown as ReturnType<typeof createAdminClient>);

    const req = buildRequest({
      'x-cron-secret': VALID_SECRET,
      'x-cron-user-id': VALID_UUID,
    });
    const result = await resolveSyncActor(req);
    expect('error' in result).toBe(true);
    if ('error' in result) expect(result.status).toBe(500);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('resolveSyncActor — SESSION authentication', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when session auth returns no user', async () => {
    const userClientMock = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: new Error('No session'),
        }),
      },
    };
    vi.mocked(createUserClient).mockReturnValue(userClientMock as unknown as ReturnType<typeof createUserClient>);

    const req = buildRequest(); // no cron headers → session path
    const result = await resolveSyncActor(req);
    expect('error' in result).toBe(true);
    if ('error' in result) expect(result.status).toBe(401);
  });

  it('returns SyncActor with mode=session when session is valid', async () => {
    const userClientMock = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: {
              id: VALID_UUID,
              email: 'user@example.com',
              user_metadata: { name: 'Jane Doe' },
            },
          },
          error: null,
        }),
      },
    };
    const adminMock = {
      auth: { admin: {} }, // not used in session path
    };
    vi.mocked(createUserClient).mockReturnValue(userClientMock as unknown as ReturnType<typeof createUserClient>);
    vi.mocked(createAdminClient).mockReturnValue(adminMock as unknown as ReturnType<typeof createAdminClient>);

    const req = buildRequest();
    const result = await resolveSyncActor(req);

    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.mode).toBe('session');
      expect(result.userId).toBe(VALID_UUID);
      expect(result.userEmail).toBe('user@example.com');
      expect(result.userName).toBe('Jane Doe');
    }
  });

  it('returns 500 when createUserClient throws', async () => {
    vi.mocked(createUserClient).mockImplementation(() => {
      throw new Error('Supabase init failure');
    });

    const req = buildRequest();
    const result = await resolveSyncActor(req);
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.status).toBe(500);
      expect(result.error).toMatch(/user session/i);
    }
  });
});
