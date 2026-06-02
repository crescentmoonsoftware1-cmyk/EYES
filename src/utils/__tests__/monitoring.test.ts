/**
 * Unit tests for src/utils/monitoring.ts
 * Tests: getQueueMetrics (health thresholds), getSystemHealthSummary
 *        (overall health aggregation), logCronMetrics, logAsyncJobFailure
 */

import { describe, it, expect, vi } from 'vitest';
import {
  getQueueMetrics,
  logCronMetrics,
  logAsyncJobFailure,
  getSystemHealthSummary,
  type CronMetrics,
  type AsyncJobFailure,
} from '../monitoring';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a Supabase-like mock where every chainable method (from, select, eq …)
 * returns `this`, and the terminal call returns the provided `result`.
 */
function makeChainMock(terminal: Record<string, unknown>) {
  const mock: Record<string, unknown> = {};
  const self: Record<string, () => unknown> = {};
  const methods = ['from', 'select', 'eq', 'lt', 'order', 'limit', 'insert', 'update'];
  methods.forEach((m) => {
    self[m] = vi.fn(() => self);
  });
  // override the last method in typical chains with a resolved promise
  const terminalFn = vi.fn().mockResolvedValue(terminal);
  // select is usually the terminal in a .from().select() chain
  self['select'] = terminalFn;
  self['insert'] = terminalFn;
  self['update'] = terminalFn;
  Object.assign(mock, self);
  return mock;
}

// ─── getQueueMetrics ──────────────────────────────────────────────────────────

describe('getQueueMetrics', () => {
  it('returns null when DB errors', async () => {
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue({ data: null, error: { message: 'fail' } }),
      }),
    };
    const result = await getQueueMetrics(supabase as any);
    expect(result).toBeNull();
  });

  it('returns "healthy" when queue has ≤ 20 entries', async () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({
      retry_attempt: 1,
      platform: 'github',
      next_attempt_at: `2024-01-0${i + 1}T00:00:00Z`,
    }));
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue({ data: rows, error: null }),
      }),
    };
    const result = await getQueueMetrics(supabase as any);
    expect(result?.health).toBe('healthy');
    expect(result?.totalPending).toBe(10);
  });

  it('returns "warning" when queue is between 21 and 50', async () => {
    const rows = Array.from({ length: 30 }, () => ({
      retry_attempt: 2,
      platform: 'slack',
      next_attempt_at: '2024-01-01T00:00:00Z',
    }));
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue({ data: rows, error: null }),
      }),
    };
    const result = await getQueueMetrics(supabase as any);
    expect(result?.health).toBe('warning');
  });

  it('returns "critical" when queue exceeds 50 entries', async () => {
    const rows = Array.from({ length: 55 }, () => ({
      retry_attempt: 3,
      platform: 'gmail',
      next_attempt_at: '2024-01-01T00:00:00Z',
    }));
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue({ data: rows, error: null }),
      }),
    };
    const result = await getQueueMetrics(supabase as any);
    expect(result?.health).toBe('critical');
  });

  it('correctly groups byPlatform counts', async () => {
    const rows = [
      { retry_attempt: 1, platform: 'github', next_attempt_at: '2024-01-01T00:00:00Z' },
      { retry_attempt: 1, platform: 'github', next_attempt_at: '2024-01-02T00:00:00Z' },
      { retry_attempt: 1, platform: 'slack',  next_attempt_at: '2024-01-03T00:00:00Z' },
    ];
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue({ data: rows, error: null }),
      }),
    };
    const result = await getQueueMetrics(supabase as any);
    expect(result?.byPlatform['github']).toBe(2);
    expect(result?.byPlatform['slack']).toBe(1);
  });

  it('identifies the oldest entry correctly', async () => {
    const rows = [
      { retry_attempt: 1, platform: 'github', next_attempt_at: '2024-03-01T00:00:00Z' },
      { retry_attempt: 1, platform: 'slack',  next_attempt_at: '2024-01-01T00:00:00Z' }, // oldest
      { retry_attempt: 1, platform: 'gmail',  next_attempt_at: '2024-02-01T00:00:00Z' },
    ];
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue({ data: rows, error: null }),
      }),
    };
    const result = await getQueueMetrics(supabase as any);
    expect(result?.oldest).toBe('2024-01-01T00:00:00Z');
  });
});

// ─── logCronMetrics ───────────────────────────────────────────────────────────

describe('logCronMetrics', () => {
  const METRICS: CronMetrics = {
    runId: 'run-001',
    durationMs: 1200,
    processedUsers: 5,
    platformRuns: 10,
    platformSuccessCount: 9,
    platformFailureCount: 1,
    embeddingsAttempted: true,
    embeddingsSuccessCount: 4,
    embeddingsFailureCount: 0,
    retryQueueDepth: 2,
    deadLetterCount24h: 0,
    escalationCount: 0,
    successRate: 0.9,
    timestamp: '2024-06-01T00:00:00Z',
  };

  it('returns {success: true} when insert succeeds', async () => {
    const supabase = {
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockResolvedValue({ error: null }),
      }),
    };
    const result = await logCronMetrics(supabase as any, METRICS);
    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('returns {success: false, error} when insert fails', async () => {
    const supabase = {
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockResolvedValue({ error: { message: 'insert failed' } }),
      }),
    };
    const result = await logCronMetrics(supabase as any, METRICS);
    expect(result.success).toBe(false);
    expect(result.error).toContain('insert failed');
  });
});

// ─── logAsyncJobFailure ───────────────────────────────────────────────────────

describe('logAsyncJobFailure', () => {
  const FAILURE: AsyncJobFailure = {
    jobId: 'job-001',
    type: 'sync',
    userId: 'user-001',
    platform: 'github',
    error: 'Token expired',
    timestamp: '2024-06-01T00:00:00Z',
    retriable: true,
  };

  it('returns {success: true} when insert succeeds', async () => {
    const supabase = {
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockResolvedValue({ error: null }),
      }),
    };
    const result = await logAsyncJobFailure(supabase as any, FAILURE);
    expect(result.success).toBe(true);
  });

  it('truncates error message to 500 characters', async () => {
    let capturedRows: unknown[] = [];
    const supabase = {
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockImplementation((rows: unknown[]) => {
          capturedRows = rows;
          return Promise.resolve({ error: null });
        }),
      }),
    };
    const longError = 'E'.repeat(600);
    await logAsyncJobFailure(supabase as any, { ...FAILURE, error: longError });
    const inserted = capturedRows[0] as Record<string, unknown>;
    expect((inserted['error_message'] as string).length).toBeLessThanOrEqual(500);
  });

  it('returns {success: false} when insert errors', async () => {
    const supabase = {
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockResolvedValue({ error: { message: 'DB down' } }),
      }),
    };
    const result = await logAsyncJobFailure(supabase as any, FAILURE);
    expect(result.success).toBe(false);
  });
});

// ─── getSystemHealthSummary ───────────────────────────────────────────────────

describe('getSystemHealthSummary', () => {
  /**
   * Build a minimal Supabase mock whose .from().select() returns different
   * results depending on which table is queried.
   */
  function buildHealthMock({
    queueRows = [] as unknown[],
    embeddingPendingCount = 0,
    embeddingProcessingCount = 0,
    failureCount = 0,
  } = {}) {
    let fromCallIdx = 0;
    return {
      from: vi.fn().mockImplementation((table: string) => {
        const selectFn = vi.fn().mockImplementation((_cols: unknown, opts?: { count?: string; head?: boolean }) => {
          if (table === 'sync_retry_queue') {
            return Promise.resolve({ data: queueRows, error: null });
          }
          if (table === 'embedding_queue') {
            // First call = pending, second = processing
            const count = fromCallIdx % 2 === 0 ? embeddingPendingCount : embeddingProcessingCount;
            fromCallIdx++;
            return Promise.resolve({ data: Array(count).fill({}), error: null });
          }
          if (table === 'async_job_failures') {
            return Promise.resolve({ data: Array(failureCount).fill({}), error: null });
          }
          return Promise.resolve({ data: [], error: null });
        });
        return {
          select: selectFn,
          eq: vi.fn().mockReturnThis(),
          lt: vi.fn().mockReturnThis(),
        };
      }),
    };
  }

  it('returns null when an unexpected error is thrown', async () => {
    const supabase = {
      from: vi.fn().mockImplementation(() => { throw new Error('crash'); }),
    };
    const result = await getSystemHealthSummary(supabase as any);
    expect(result).toBeNull();
  });

  it('returns "healthy" when all metrics are low', async () => {
    const supabase = buildHealthMock({ queueRows: [], embeddingPendingCount: 0, failureCount: 0 });
    const result = await getSystemHealthSummary(supabase as any);
    expect(result?.overallHealth).toBe('healthy');
  });

  it('returns "critical" when queueDepth exceeds 50', async () => {
    const rows = Array.from({ length: 55 }, () => ({
      retry_attempt: 1, platform: 'github', next_attempt_at: '2024-01-01T00:00:00Z',
    }));
    const supabase = buildHealthMock({ queueRows: rows });
    const result = await getSystemHealthSummary(supabase as any);
    expect(result?.overallHealth).toBe('critical');
  });

  it('exposes correct metric values in the result', async () => {
    const supabase = buildHealthMock({
      queueRows: [{ retry_attempt: 1, platform: 'slack', next_attempt_at: '2024-01-01T00:00:00Z' }],
      embeddingPendingCount: 3,
      failureCount: 0,
    });
    const result = await getSystemHealthSummary(supabase as any);
    expect(result?.metrics.queueDepth).toBe(1);
  });
});
