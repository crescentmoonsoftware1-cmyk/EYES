import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { POST } from '@/app/api/cron/job-recovery/route';
import { createAdminClient } from '@/utils/supabase/admin';
import { getRecoverableFailedJobs, markJobAsRecovered } from '@/utils/monitoring';

vi.mock('@/utils/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/utils/monitoring', () => ({
  getRecoverableFailedJobs: vi.fn(),
  markJobAsRecovered: vi.fn(),
}));

vi.mock('@/app/api/sync/github/route', () => ({ POST: vi.fn() }));
vi.mock('@/app/api/sync/gmail/route', () => ({ POST: vi.fn() }));
vi.mock('@/app/api/sync/google-calendar/route', () => ({ POST: vi.fn() }));
vi.mock('@/app/api/sync/notion/route', () => ({ POST: vi.fn() }));
vi.mock('@/app/api/sync/reddit/route', () => ({ POST: vi.fn() }));
vi.mock('@/app/api/sync/slack/route', () => ({ POST: vi.fn() }));
vi.mock('@/app/api/sync/discord/route', () => ({ POST: vi.fn() }));
vi.mock('@/app/api/sync/embeddings/route', () => ({ POST: vi.fn() }));

import { POST as syncGithub } from '@/app/api/sync/github/route';
const syncGithubMock = vi.mocked(syncGithub);

const createAdminClientMock = vi.mocked(createAdminClient);
const getRecoverableFailedJobsMock = vi.mocked(getRecoverableFailedJobs);
const markJobAsRecoveredMock = vi.mocked(markJobAsRecovered);

describe('POST /api/cron/job-recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns unauthorized without cron auth header', async () => {
    const prevSecret = process.env.CRON_SECRET;
    process.env.CRON_SECRET = 'unit-test-secret';

    const response = await POST(new NextRequest('http://localhost/api/cron/job-recovery', { method: 'POST' }));
    const payload = (await response.json()) as { error?: string };

    process.env.CRON_SECRET = prevSecret;

    expect(response.status).toBe(401);
    expect(payload.error).toBe('Unauthorized');
  });

  it('successfully processes recoverable failures and updates status', async () => {
    const prevSecret = process.env.CRON_SECRET;
    process.env.CRON_SECRET = 'unit-test-secret';

    const mockUpdate = vi.fn().mockResolvedValue({ error: null });
    const mockSingle = vi.fn().mockResolvedValue({
      data: { recovery_attempts: 0, max_recovery_attempts: 3 },
      error: null,
    });
    const mockEq = vi.fn().mockReturnValue({ single: mockSingle });
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });

    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === 'async_job_failures') {
          return {
            select: mockSelect,
            update: vi.fn().mockReturnValue({ eq: mockUpdate }),
          };
        }
        return {};
      }),
    };

    createAdminClientMock.mockReturnValue(mockSupabase as any);

    getRecoverableFailedJobsMock.mockResolvedValue([
      {
        jobId: 'job-1',
        type: 'sync',
        userId: 'user-1',
        platform: 'github',
        error: 'Failed sync',
        timestamp: new Date().toISOString(),
        retriable: true,
      },
    ]);

    // Mock fetch for sub-request (github is imported direct, but we'll mock fetch anyway just in case)
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );

    syncGithubMock.mockResolvedValue(NextResponse.json({ ok: true }) as any);
    markJobAsRecoveredMock.mockResolvedValue({ success: true });

    const response = await POST(
      new NextRequest('http://localhost/api/cron/job-recovery', {
        method: 'POST',
        headers: {
          'x-cron-secret': 'unit-test-secret',
        },
      })
    );

    const payload = await response.json();

    process.env.CRON_SECRET = prevSecret;
    fetchMock.mockRestore();

    expect(response.status).toBe(200);
    expect(payload.processed).toBe(1);
    expect(payload.results[0].status).toBe('succeeded');
    expect(markJobAsRecoveredMock).toHaveBeenCalledWith(mockSupabase, 'job-1');
  });
});
