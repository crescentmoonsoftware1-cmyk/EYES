/**
 * lib/cron/retry.ts
 * Pure functions for the sync retry-queue engine.
 * Extracted from api/cron/sync/route.ts (H-NEW-3 split).
 * These are independently testable and have no side-effects.
 */

// ── Constants (overridable by env vars) ──────────────────────────────────────
export const RETRY_BASE_DELAY_MS  = Number(process.env.CRON_RETRY_BASE_DELAY_MS  || 60_000);
export const RETRY_MAX_DELAY_MS   = Number(process.env.CRON_RETRY_MAX_DELAY_MS   || 60 * 60 * 1000);
export const RETRY_MAX_ATTEMPTS   = Number(process.env.CRON_RETRY_MAX_ATTEMPTS   || 4);
export const RETRY_JITTER_RATIO   = Number(process.env.CRON_RETRY_JITTER_RATIO   || 0.2);

// ── Types ─────────────────────────────────────────────────────────────────────
export type RetryQueueRow = {
  user_id: string;
  platform: string;
  retry_attempt: number;
  next_attempt_at: string;
};

export type RetryQueueUpsertRow = {
  user_id: string;
  platform: string;
  retry_attempt: number;
  next_attempt_at: string;
  last_http_status: number | null;
  last_error_message: string | null;
  metadata: Record<string, unknown>;
  updated_at: string;
};

export type RetryDeadLetterInsertRow = {
  run_id: string;
  user_id: string;
  platform: string;
  retry_attempt: number;
  last_http_status: number | null;
  error_message: string | null;
  failure_reason: 'max_attempts_exceeded' | 'non_retriable_status';
  metadata: Record<string, unknown>;
};

// ── Pure helper functions ─────────────────────────────────────────────────────

export function toRetryQueueKey(userId: string, platform: string): string {
  return `${userId}::${platform}`;
}

export function fromRetryQueueKey(key: string): { userId: string; platform: string } {
  const [userId, platform] = key.split('::');
  return { userId, platform };
}

export function toRunAttemptFromRetryAttempt(retryAttempt: number | undefined): number {
  if (!retryAttempt || retryAttempt < 1) return 1;
  return retryAttempt + 1;
}

export function isNonRetriableHttpStatus(status: number | null): boolean {
  if (status === null) return false;
  return status >= 400 && status < 500 && status !== 429;
}

function clampJitterRatio(raw: number): number {
  if (!Number.isFinite(raw)) return 0;
  return Math.max(0, Math.min(1, raw));
}

/**
 * Computes the base retry delay for a given attempt number (exponential back-off).
 * attempt=1 → RETRY_BASE_DELAY_MS, attempt=2 → 2x, etc., capped at RETRY_MAX_DELAY_MS.
 */
export function computeRetryDelayMs(retryAttempt: number): number {
  const normalizedAttempt = Math.max(1, retryAttempt);
  const exponent = normalizedAttempt - 1;
  const raw = RETRY_BASE_DELAY_MS * Math.pow(2, exponent);
  return Math.min(RETRY_MAX_DELAY_MS, raw);
}

/**
 * Adds ±jitter to the base delay to prevent thundering-herd on retry waves.
 * @param randomValue - Inject a fixed value in tests (default: Math.random()).
 */
export function computeRetryDelayWithJitterMs(
  retryAttempt: number,
  randomValue = Math.random(),
): number {
  const baseDelay = computeRetryDelayMs(retryAttempt);
  const jitterRatio = clampJitterRatio(RETRY_JITTER_RATIO);
  if (jitterRatio <= 0) return baseDelay;

  const normalizedRandom = Math.max(0, Math.min(1, randomValue));
  const minFactor = 1 - jitterRatio;
  const maxFactor = 1 + jitterRatio;
  const factor = minFactor + (maxFactor - minFactor) * normalizedRandom;
  const jittered = Math.round(baseDelay * factor);
  return Math.min(RETRY_MAX_DELAY_MS, Math.max(1_000, jittered));
}

export function computeNextRetryAttemptAt(
  retryAttempt: number,
  retryDelayMs?: number,
): string {
  const delayMs =
    typeof retryDelayMs === 'number'
      ? retryDelayMs
      : computeRetryDelayWithJitterMs(retryAttempt);
  return new Date(Date.now() + delayMs).toISOString();
}
