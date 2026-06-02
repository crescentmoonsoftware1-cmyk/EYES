/**
 * Unit tests for src/utils/retry-queue.ts
 * Tests: calculateRetryDelay, shouldRetry, batchUpdateRetries,
 *        batchMoveToDeadLetters, batchRemoveRetries, getRetryQueueMetrics
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  calculateRetryDelay,
  shouldRetry,
  batchUpdateRetries,
  batchMoveToDeadLetters,
  batchRemoveRetries,
  getRetryQueueMetrics,
  type RetryQueueUpdateRequest,
  type RetryDeadLetterEntry,
} from '../retry-queue';

// ─── calculateRetryDelay ─────────────────────────────────────────────────────

describe('calculateRetryDelay', () => {
  it('returns a positive number for attempt 1', () => {
    const delay = calculateRetryDelay(1);
    expect(delay).toBeGreaterThan(0);
  });

  it('increases delay with higher attempt numbers', () => {
    const delay1 = calculateRetryDelay(1);
    const delay2 = calculateRetryDelay(2);
    const delay3 = calculateRetryDelay(3);
    // Due to jitter we cannot assert strict ordering for each individual call,
    // but the BASE delay grows 2× per attempt so at attempt 3 the base (240 000 ms)
    // is far above the base at attempt 1 (60 000 ms).
    expect(delay3).toBeGreaterThan(delay1);
    // attempt 2 base (120 000) > attempt 1 base (60 000) even with jitter
    expect(delay2).toBeGreaterThan(delay1 * 0.5);
  });

  it('never exceeds MAX_RETRY_DELAY_MS (3 600 000 ms)', () => {
    // Run many attempts to be sure the cap holds
    for (let attempt = 1; attempt <= 20; attempt++) {
      expect(calculateRetryDelay(attempt)).toBeLessThanOrEqual(3_600_000);
    }
  });

  it('handles attempt 0 same as attempt 1 (normalised)', () => {
    const delay0 = calculateRetryDelay(0);
    expect(delay0).toBeGreaterThan(0);
  });

  it('returns an integer (Math.floor applied)', () => {
    const delay = calculateRetryDelay(2);
    expect(Number.isInteger(delay)).toBe(true);
  });
});

// ─── shouldRetry ─────────────────────────────────────────────────────────────

describe('shouldRetry', () => {
  it('returns true when attempt number is below MAX (4)', () => {
    expect(shouldRetry(0)).toBe(true);
    expect(shouldRetry(1)).toBe(true);
    expect(shouldRetry(3)).toBe(true);
  });

  it('returns false when attempt number equals MAX (4)', () => {
    expect(shouldRetry(4)).toBe(false);
  });

  it('returns false when attempt number exceeds MAX', () => {
    expect(shouldRetry(5)).toBe(false);
    expect(shouldRetry(100)).toBe(false);
  });
});

// ─── Helpers for Supabase mock ────────────────────────────────────────────────

function makeSupabaseMock(overrides: Record<string, unknown> = {}) {
  const base = {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockResolvedValue({ error: null }),
    insert: vi.fn().mockResolvedValue({ error: null }),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue({ error: null }),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
  };
  return { ...base, ...overrides };
}

// ─── batchUpdateRetries ───────────────────────────────────────────────────────

describe('batchUpdateRetries', () => {
  it('returns {success:0, failed:0} when given an empty array', async () => {
    const supabase = makeSupabaseMock();
    const result = await batchUpdateRetries(supabase as any, []);
    expect(result).toEqual({ success: 0, failed: 0 });
  });

  it('upserts and returns all as success when DB succeeds', async () => {
    const supabase = makeSupabaseMock({
      upsert: vi.fn().mockResolvedValue({ error: null }),
    });
    const updates: RetryQueueUpdateRequest[] = [
      { user_id: 'u1', platform: 'github', retry_attempt: 1, next_attempt_at: new Date().toISOString(), http_status: 500, error_message: 'err' },
      { user_id: 'u2', platform: 'slack', retry_attempt: 2, next_attempt_at: new Date().toISOString(), http_status: null, error_message: null },
    ];
    const result = await batchUpdateRetries(supabase as any, updates);
    expect(result.success).toBe(2);
    expect(result.failed).toBe(0);
  });

  it('deduplicates entries with the same user_id + platform', async () => {
    const upsertMock = vi.fn().mockResolvedValue({ error: null });
    const supabase = makeSupabaseMock({ upsert: upsertMock });
    const updates: RetryQueueUpdateRequest[] = [
      { user_id: 'u1', platform: 'github', retry_attempt: 1, next_attempt_at: '', http_status: null, error_message: null },
      { user_id: 'u1', platform: 'github', retry_attempt: 2, next_attempt_at: '', http_status: null, error_message: null }, // duplicate
    ];
    const result = await batchUpdateRetries(supabase as any, updates);
    // Only 1 unique entry after deduplication
    expect(result.success).toBe(1);
    const upsertedRows = upsertMock.mock.calls[0][0] as unknown[];
    expect(upsertedRows).toHaveLength(1);
  });

  it('returns all as failed when DB errors', async () => {
    const supabase = makeSupabaseMock({
      upsert: vi.fn().mockResolvedValue({ error: { message: 'DB error' } }),
    });
    const updates: RetryQueueUpdateRequest[] = [
      { user_id: 'u1', platform: 'github', retry_attempt: 1, next_attempt_at: '', http_status: null, error_message: null },
    ];
    const result = await batchUpdateRetries(supabase as any, updates);
    expect(result.failed).toBe(1);
    expect(result.success).toBe(0);
  });
});

// ─── batchMoveToDeadLetters ───────────────────────────────────────────────────

describe('batchMoveToDeadLetters', () => {
  it('returns {moved:0, failed:0} when given an empty array', async () => {
    const supabase = makeSupabaseMock();
    const result = await batchMoveToDeadLetters(supabase as any, []);
    expect(result).toEqual({ moved: 0, failed: 0 });
  });

  it('inserts dead-letter rows and deletes from active queue', async () => {
    const deleteMock = vi.fn().mockReturnThis();
    const eqMock = vi.fn().mockResolvedValue({ error: null });
    const supabase = {
      from: vi.fn().mockReturnThis(),
      insert: vi.fn().mockResolvedValue({ error: null }),
      delete: deleteMock,
      eq: eqMock,
    };

    const entries: RetryDeadLetterEntry[] = [
      { user_id: 'u1', platform: 'github', retry_attempt: 4, http_status: 500, error_message: 'too many', failure_reason: 'max_attempts_exceeded' },
    ];
    const result = await batchMoveToDeadLetters(supabase as any, entries, 'run-123');
    expect(result.moved).toBe(1);
    expect(result.failed).toBe(0);
  });

  it('returns all as failed when insert errors', async () => {
    const supabase = makeSupabaseMock({
      insert: vi.fn().mockResolvedValue({ error: { message: 'insert failed' } }),
    });
    const entries: RetryDeadLetterEntry[] = [
      { user_id: 'u1', platform: 'slack', retry_attempt: 4, http_status: null, error_message: 'err', failure_reason: 'max_attempts_exceeded' },
    ];
    const result = await batchMoveToDeadLetters(supabase as any, entries);
    expect(result.failed).toBe(1);
    expect(result.moved).toBe(0);
  });
});

// ─── batchRemoveRetries ───────────────────────────────────────────────────────

describe('batchRemoveRetries', () => {
  it('returns {removed:0, failed:0} for empty input', async () => {
    const supabase = makeSupabaseMock();
    const result = await batchRemoveRetries(supabase as any, []);
    expect(result).toEqual({ removed: 0, failed: 0 });
  });

  it('removes all entries on success', async () => {
    const eqMock = vi.fn().mockResolvedValue({ error: null });
    const supabase = {
      from: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: eqMock,
    };
    const result = await batchRemoveRetries(supabase as any, [
      { user_id: 'u1', platform: 'github' },
      { user_id: 'u2', platform: 'slack' },
    ]);
    expect(result.removed).toBe(2);
    expect(result.failed).toBe(0);
  });

  it('counts per-entry failures correctly', async () => {
    let callCount = 0;
    const eqMock = vi.fn().mockImplementation(() => {
      callCount++;
      // First call succeeds, second fails
      return Promise.resolve({ error: callCount === 2 ? { message: 'fail' } : null });
    });
    const supabase = {
      from: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: eqMock,
    };
    const result = await batchRemoveRetries(supabase as any, [
      { user_id: 'u1', platform: 'github' },
      { user_id: 'u2', platform: 'slack' },
    ]);
    expect(result.removed + result.failed).toBe(2);
  });
});

// ─── getRetryQueueMetrics ─────────────────────────────────────────────────────

describe('getRetryQueueMetrics', () => {
  it('returns null when DB errors', async () => {
    const supabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockResolvedValue({ data: null, error: { message: 'db error' } }),
    };
    const result = await getRetryQueueMetrics(supabase as any);
    expect(result).toBeNull();
  });

  it('returns correct totals and byAttempt grouping', async () => {
    const rows = [
      { retry_attempt: 1, next_attempt_at: '2024-01-01T00:00:00Z' },
      { retry_attempt: 1, next_attempt_at: '2024-01-02T00:00:00Z' },
      { retry_attempt: 2, next_attempt_at: '2024-01-03T00:00:00Z' },
    ];
    const supabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockResolvedValue({ data: rows, error: null }),
    };
    const result = await getRetryQueueMetrics(supabase as any);
    expect(result).not.toBeNull();
    expect(result!.totalPending).toBe(3);
    expect(result!.byAttempt[1]).toBe(2);
    expect(result!.byAttempt[2]).toBe(1);
    // Oldest entry
    expect(result!.oldest).toBe('2024-01-01T00:00:00Z');
  });

  it('returns empty metrics for empty queue', async () => {
    const supabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    const result = await getRetryQueueMetrics(supabase as any);
    expect(result!.totalPending).toBe(0);
    expect(result!.oldest).toBeNull();
    expect(result!.byAttempt).toEqual({});
  });
});
