import { beforeEach, describe, expect, it, vi } from 'vitest';

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
}));

import { POST } from '@/app/api/sync/all/route';
import { createClient } from '@/utils/supabase/server';
import { upsertSyncStatusSafely } from '@/utils/supabase/upsert';

const createClientMock = vi.mocked(createClient);
const upsertSyncStatusSafelyMock = vi.mocked(upsertSyncStatusSafely);

describe('POST /api/sync/all', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns unauthorized when user is not authenticated', async () => {
    createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: null }, error: { message: 'unauthorized' } })),
      },
      from: vi.fn(),
    } as never);

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
            select: vi.fn(),
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

    createClientMock.mockResolvedValue(supabase as never);

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
      mode: string;
      successCount: number;
      failedCount: number;
      results: Array<{ platform: string; routePlatform: string; success: boolean; status: number | null }>;
    };

    fetchMock.mockRestore();

    expect(response.status).toBe(202);
    expect(payload.accepted).toBe(true);
    expect(payload.mode).toBe('background');
    expect(payload.platforms).toHaveLength(2);

    expect(upsertSyncStatusSafelyMock).toHaveBeenCalled();
  });
});
