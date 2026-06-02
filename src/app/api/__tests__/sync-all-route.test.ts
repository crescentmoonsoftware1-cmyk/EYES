import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@vercel/functions', () => ({
  waitUntil: vi.fn((promise: Promise<unknown>) => { void promise; }),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    getAll: () => [{ name: 'sb-access-token', value: 'test-cookie' }],
  })),
}));

vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(),
}));

vi.mock('@/utils/supabase/upsert', () => ({
  upsertSyncStatusSafely: vi.fn(async () => ({ error: null })),
  batchUpsertSyncStatus: vi.fn(async () => ({ error: null })),
}));

vi.mock('@/utils/sync/actor', () => ({
  resolveSyncActor: vi.fn(),
}));

import { POST } from '@/app/api/sync/all/route';
import { createClient } from '@/utils/supabase/server';
import { upsertSyncStatusSafely } from '@/utils/supabase/upsert';
import { resolveSyncActor } from '@/utils/sync/actor';

const createClientMock = vi.mocked(createClient);
const upsertSyncStatusSafelyMock = vi.mocked(upsertSyncStatusSafely);
const resolveSyncActorMock = vi.mocked(resolveSyncActor);


describe('POST /api/sync/all', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns unauthorized when user is not authenticated', async () => {
    resolveSyncActorMock.mockResolvedValue({ error: 'Unauthorized', status: 401 });

    const response = await POST(new Request('http://localhost/api/sync/all', { method: 'POST' }));
    const payload = (await response.json()) as { error?: string };

    expect(response.status).toBe(401);
    expect(payload.error).toBe('Unauthorized');
  });

  it('fans out to connected provider routes and reports mixed outcomes', async () => {
    const supabase = {
      auth: {
        getUser: vi.fn(async () => ({
          data: {
            user: {
              id: '11111111-1111-4111-8111-111111111111',
            },
          },
          error: null,
        })),
      },
      from: vi.fn((table: string) => {
        if (table !== 'oauth_tokens') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                is: vi.fn(() => ({ not: vi.fn(() => ({ limit: vi.fn(async () => ({ data: [], error: null })) })) })),
              })),
            })),
          };
        }

        return {
          select: vi.fn(() => ({
            eq: vi.fn(async () => ({
              data: [{ platform: 'github' }, { platform: 'google_calendar' }],
            })),
          })),
        };
      }),
    };

    resolveSyncActorMock.mockResolvedValue({
      supabase: supabase as any,
      userId: '11111111-1111-4111-8111-111111111111',
      userEmail: 'test@example.com',
      userName: 'Test User',
      mode: 'session',
    });

    createClientMock.mockResolvedValue(supabase as never);

    // Set required env vars so platform filter doesn't drop all platforms
    process.env.GITHUB_CLIENT_SECRET = 'test-secret';
    process.env.GOOGLE_CLIENT_SECRET = 'test-secret';

    const fetchMock = vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url.includes('/api/sync/github')) {
        return new Response(JSON.stringify({ ok: true, synced: 4 }), { status: 200 });
      }

      if (url.includes('/api/sync/google-calendar')) {
        return new Response(JSON.stringify({ error: 'provider down' }), { status: 502 });
      }

      return new Response(JSON.stringify({ error: 'unknown route' }), { status: 404 });
    });

    const response = await POST(new Request('http://localhost/api/sync/all', { method: 'POST' }));
    const payload = (await response.json()) as {
      accepted: boolean;
      mode: string;
      message: string;
      platforms: string[];
    };

    fetchMock.mockRestore();

    expect(response.status).toBe(202);
    expect(payload.accepted).toBe(true);
    expect(payload.mode).toBe('background');
    expect(payload.platforms).toHaveLength(2);

    expect(upsertSyncStatusSafelyMock).toHaveBeenCalled();
  });
});

