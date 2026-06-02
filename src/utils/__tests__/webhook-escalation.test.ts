/**
 * Unit tests for src/utils/webhook-escalation.ts
 * Tests: optimizeWebhookPayload, restoreWebhookPayload, batchWebhookPayloads,
 *        calculateWebhookRetryDelay, isRetriableWebhookError,
 *        calculateEscalationCooldown, getWebhookTimeoutMs, createWebhookDispatchError
 */

import { describe, it, expect } from 'vitest';
import {
  optimizeWebhookPayload,
  restoreWebhookPayload,
  batchWebhookPayloads,
  calculateWebhookRetryDelay,
  isRetriableWebhookError,
  calculateEscalationCooldown,
  getWebhookTimeoutMs,
  createWebhookDispatchError,
} from '../webhook-escalation';

// ─── Shared test fixture ──────────────────────────────────────────────────────

const FULL_PAYLOAD = {
  service: 'the-eyes',
  event: 'sync-escalation',
  emittedAt: '2024-06-01T00:00:00Z',
  runId: '12345678-abcd-efgh-ijkl-000000000000',
  userId: 'user-abcd-efgh-ijkl-000000000000',
  code: 'SYNC_FAILURE',
  severity: 'critical' as const,
  owner: 'admin@example.com',
  message: 'Platform sync failed after maximum retries.',
  observed: 5,
  threshold: 3,
  metrics: {
    pendingRetries: 8,
    deadLetters24h: 2,
    failureRate24h: 0.45,
  },
};

// ─── optimizeWebhookPayload ───────────────────────────────────────────────────

describe('optimizeWebhookPayload', () => {
  it('compacts severity "critical" to "c"', () => {
    const opt = optimizeWebhookPayload(FULL_PAYLOAD);
    expect(opt.s).toBe('c');
  });

  it('compacts severity "warning" to "w"', () => {
    const opt = optimizeWebhookPayload({ ...FULL_PAYLOAD, severity: 'warning' });
    expect(opt.s).toBe('w');
  });

  it('truncates runId and userId to 8 characters', () => {
    const opt = optimizeWebhookPayload(FULL_PAYLOAD);
    expect(opt.r).toBe('12345678');
    expect(opt.u).toBe('user-abc');
  });

  it('truncates message to 200 characters max', () => {
    const longMessage = 'A'.repeat(300);
    const opt = optimizeWebhookPayload({ ...FULL_PAYLOAD, message: longMessage });
    expect(opt.m).toHaveLength(200);
  });

  it('includes compact metrics when pendingRetries > 0', () => {
    const opt = optimizeWebhookPayload(FULL_PAYLOAD);
    expect(opt.mt?.pr).toBe(8);
  });

  it('includes compact metrics when deadLetters24h > 0', () => {
    const opt = optimizeWebhookPayload(FULL_PAYLOAD);
    expect(opt.mt?.dl).toBe(2);
  });

  it('converts failureRate24h to percentage (0-100)', () => {
    const opt = optimizeWebhookPayload(FULL_PAYLOAD);
    expect(opt.mt?.fr).toBe(45); // 0.45 * 100
  });

  it('omits mt field when all metrics are 0', () => {
    const opt = optimizeWebhookPayload({
      ...FULL_PAYLOAD,
      metrics: { pendingRetries: 0, deadLetters24h: 0, failureRate24h: 0 },
    });
    expect(opt.mt).toBeUndefined();
  });
});

// ─── restoreWebhookPayload ────────────────────────────────────────────────────

describe('restoreWebhookPayload', () => {
  it('restores severity "c" to "critical"', () => {
    const opt = optimizeWebhookPayload(FULL_PAYLOAD);
    const restored = restoreWebhookPayload(opt);
    expect(restored.severity).toBe('critical');
  });

  it('restores severity "w" to "warning"', () => {
    const opt = optimizeWebhookPayload({ ...FULL_PAYLOAD, severity: 'warning' });
    const restored = restoreWebhookPayload(opt);
    expect(restored.severity).toBe('warning');
  });

  it('restores failureRate24h from percentage back to 0-1', () => {
    const opt = optimizeWebhookPayload(FULL_PAYLOAD);
    const restored = restoreWebhookPayload(opt);
    expect(restored.metrics.failureRate24h).toBeCloseTo(0.45);
  });

  it('returns 0 values for missing metric fields', () => {
    const opt = optimizeWebhookPayload({
      ...FULL_PAYLOAD,
      metrics: {},
    });
    const restored = restoreWebhookPayload(opt);
    expect(restored.metrics.pendingRetries).toBe(0);
    expect(restored.metrics.deadLetters24h).toBe(0);
    expect(restored.metrics.failureRate24h).toBe(0);
  });

  it('preserves service and event fields through round-trip', () => {
    const opt = optimizeWebhookPayload(FULL_PAYLOAD);
    const restored = restoreWebhookPayload(opt);
    expect(restored.service).toBe(FULL_PAYLOAD.service);
    expect(restored.event).toBe(FULL_PAYLOAD.event);
  });
});

// ─── batchWebhookPayloads ─────────────────────────────────────────────────────

describe('batchWebhookPayloads', () => {
  it('creates a batch with the correct count', () => {
    const batch = batchWebhookPayloads([FULL_PAYLOAD, { ...FULL_PAYLOAD, code: 'CODE2' }], 'run-abc');
    expect(batch.count).toBe(2);
    expect(batch.escalations).toHaveLength(2);
  });

  it('uses "sync-escalation-batch" event name', () => {
    const batch = batchWebhookPayloads([FULL_PAYLOAD], 'run-xyz');
    expect(batch.event).toBe('sync-escalation-batch');
  });

  it('passes runId through correctly', () => {
    const batch = batchWebhookPayloads([FULL_PAYLOAD], 'my-run-id');
    expect(batch.runId).toBe('my-run-id');
  });

  it('handles empty payload array', () => {
    const batch = batchWebhookPayloads([], 'run-000');
    expect(batch.count).toBe(0);
    expect(batch.escalations).toHaveLength(0);
  });
});

// ─── calculateWebhookRetryDelay ───────────────────────────────────────────────

describe('calculateWebhookRetryDelay', () => {
  it('returns a positive delay for attempt 0', () => {
    expect(calculateWebhookRetryDelay(0)).toBeGreaterThan(0);
  });

  it('increases delay with each attempt', () => {
    const d1 = calculateWebhookRetryDelay(1, 1000);
    const d2 = calculateWebhookRetryDelay(2, 1000);
    expect(d2).toBeGreaterThan(d1);
  });

  it('caps exponent at 5 (no runaway delays)', () => {
    // At attempt 5, delay = 1000 * 2^5 = 32000ms. attempt 100 should be same base.
    const d5 = calculateWebhookRetryDelay(5, 1000);
    const d100 = calculateWebhookRetryDelay(100, 1000);
    // Both should be in the same magnitude range (within 2x due to jitter 10%)
    expect(d100 / d5).toBeLessThanOrEqual(1.2);
  });
});

// ─── isRetriableWebhookError ──────────────────────────────────────────────────

describe('isRetriableWebhookError', () => {
  it('returns true for null status (network error)', () => {
    expect(isRetriableWebhookError(null, null)).toBe(true);
  });

  it('returns true for 5xx server errors', () => {
    expect(isRetriableWebhookError(500, null)).toBe(true);
    expect(isRetriableWebhookError(503, null)).toBe(true);
  });

  it('returns true for 429 rate limit', () => {
    expect(isRetriableWebhookError(429, null)).toBe(true);
  });

  it('returns true for 408 request timeout', () => {
    expect(isRetriableWebhookError(408, null)).toBe(true);
  });

  it('returns false for 4xx client errors (not 408/429)', () => {
    expect(isRetriableWebhookError(400, null)).toBe(false);
    expect(isRetriableWebhookError(401, null)).toBe(false);
    expect(isRetriableWebhookError(403, null)).toBe(false);
    expect(isRetriableWebhookError(404, null)).toBe(false);
  });

  it('returns false for 2xx success codes', () => {
    expect(isRetriableWebhookError(200, null)).toBe(false);
    expect(isRetriableWebhookError(201, null)).toBe(false);
  });
});

// ─── calculateEscalationCooldown ─────────────────────────────────────────────

describe('calculateEscalationCooldown', () => {
  it('returns base cooldown (60 min) for first dispatch (count=0)', () => {
    const cooldown = calculateEscalationCooldown(0);
    // (0+1) * 60 min * 60s * 1000ms = 3_600_000
    expect(cooldown).toBe(3_600_000);
  });

  it('doubles for second dispatch (count=1)', () => {
    expect(calculateEscalationCooldown(1)).toBe(7_200_000);
  });

  it('caps multiplier at 5', () => {
    const atFive = calculateEscalationCooldown(4); // min(4+1, 5) = 5
    const atSix = calculateEscalationCooldown(5);  // min(5+1, 5) = 5
    expect(atFive).toBe(atSix);
  });

  it('respects custom baseCooldownMinutes', () => {
    const cooldown = calculateEscalationCooldown(0, 30);
    expect(cooldown).toBe(30 * 60 * 1000);
  });
});

// ─── getWebhookTimeoutMs ──────────────────────────────────────────────────────

describe('getWebhookTimeoutMs', () => {
  it('returns 10 000 ms for critical severity', () => {
    expect(getWebhookTimeoutMs('critical')).toBe(10_000);
  });

  it('returns 5 000 ms for warning severity', () => {
    expect(getWebhookTimeoutMs('warning')).toBe(5_000);
  });
});

// ─── createWebhookDispatchError ───────────────────────────────────────────────

describe('createWebhookDispatchError', () => {
  it('marks 500 errors as retriable', () => {
    const err = createWebhookDispatchError('SYNC_FAIL', 'critical', 500, 'Server down');
    expect(err.retriable).toBe(true);
  });

  it('marks 404 errors as NOT retriable', () => {
    const err = createWebhookDispatchError('NOT_FOUND', 'warning', 404, 'Not found');
    expect(err.retriable).toBe(false);
  });

  it('truncates message to 200 chars', () => {
    const longMsg = 'X'.repeat(300);
    const err = createWebhookDispatchError('CODE', 'warning', null, longMsg);
    expect(err.message).toHaveLength(200);
  });

  it('includes a timestamp in ISO format', () => {
    const err = createWebhookDispatchError('CODE', 'warning', null, 'err');
    expect(() => new Date(err.timestamp)).not.toThrow();
    expect(new Date(err.timestamp).toISOString()).toBe(err.timestamp);
  });
});
