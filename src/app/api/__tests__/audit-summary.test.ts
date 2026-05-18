import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(),
}));

import { GET } from '@/app/api/audit-summary/route';
import { createClient } from '@/utils/supabase/server';

const createClientMock = vi.mocked(createClient);

type QueryResult<T> = {
  data: T;
  error: { message?: string } | null;
};

function createThenableResult<T>(result: QueryResult<T>) {
  return {
    then: (resolve: (value: QueryResult<T>) => void, reject: (reason?: unknown) => void) => {
      Promise.resolve(result).then(resolve, reject);
    },
  };
}

function createSupabaseFixture(params?: {
  syncStatus?: QueryResult<Array<{ platform: string; total_items: number | null; last_sync_at: string | null }>>;
  flaggedEvents?: QueryResult<
    Array<{
      id: string;
      platform: string;
      timestamp: string | null;
      content: string | null;
      flag_severity: string | null;
      is_flagged: boolean;
    }>
  >;
}) {
  const syncStatus = params?.syncStatus ?? {
    data: [],
    error: null,
  };

  const flaggedEvents = params?.flaggedEvents ?? {
    data: [],
    error: null,
  };

  return {
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
      const result = table === 'sync_status' ? syncStatus : flaggedEvents;

      const builder: Record<string, unknown> = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        order: vi.fn(() => builder),
        then: (resolve: (value: QueryResult<unknown>) => void, reject: (reason?: unknown) => void) => {
          Promise.resolve(result).then(resolve, reject);
        },
      };

      return builder;
    }),
  };
}

describe('GET /api/audit-summary', () => {
  beforeEach(() => {
    createClientMock.mockReset();
  });

  it('returns explicit error when Supabase env is missing', async () => {
    const prevUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const prevKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    const response = await GET();
    const json = (await response.json()) as {
      error?: string;
      fallback?: {
        totalMemories: number;
        flaggedItems: Array<{ id: string }>;
        riskCounts: { heavy: number; direct: number; light: number };
      };
    };

    process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = prevKey;

    expect(response.status).toBe(503);
    expect(json.error).toContain('Supabase');
    expect(json.fallback?.totalMemories).toBe(0);
    expect(json.fallback?.flaggedItems).toHaveLength(0);
    expect(json.fallback?.riskCounts).toEqual({ heavy: 0, direct: 0, light: 0 });
  });

  it('builds a real audit summary from sync status and flagged events', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';

    const today = new Date().toISOString();
    createClientMock.mockResolvedValue(
      createSupabaseFixture({
        syncStatus: {
          data: [
            {
              platform: 'gmail',
              total_items: 12,
              last_sync_at: today,
            },
            {
              platform: 'github',
              total_items: 8,
              last_sync_at: today,
            },
          ],
          error: null,
        },
        flaggedEvents: {
          data: [
            {
              id: 'event-1',
              platform: 'github',
              timestamp: today,
              content: 'Merged a private incident note.',
              flag_severity: 'HEAVY',
              is_flagged: true,
            },
            {
              id: 'event-2',
              platform: 'gmail',
              timestamp: today,
              content: 'Sent a direct response with sensitive details.',
              flag_severity: 'DIRECT',
              is_flagged: true,
            },
          ],
          error: null,
        },
      }) as never
    );

    const response = await GET();
    const payload = (await response.json()) as {
      totalMemories: number;
      overallRisk: 'HEAVY' | 'DIRECT' | 'LIGHT';
      riskCounts: { heavy: number; direct: number; light: number };
      flaggedItems: Array<{ id: string; platform: string; severity: string }>;
      comparisonData: Array<{ eyes: string; recruiter: string }>;
    };

    expect(response.status).toBe(200);
    expect(payload.totalMemories).toBe(20);
    expect(payload.overallRisk).toBe('HEAVY');
    expect(payload.riskCounts).toEqual({ heavy: 1, direct: 1, light: 0 });
    expect(payload.flaggedItems).toHaveLength(2);
    expect(payload.flaggedItems[0]?.platform).toBe('GitHub');
    expect(payload.comparisonData[0]?.eyes).toContain('2 of 20 indexed memories are flagged for review');
    expect(payload.comparisonData[2]?.eyes).toContain('Latest captured activity is today');
  });
});
