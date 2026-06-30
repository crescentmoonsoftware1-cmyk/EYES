/**
 * lib/cron/escalation.ts
 * Pure functions for the sync escalation engine.
 * Extracted from api/cron/sync/route.ts (H-NEW-3 split).
 * These are independently testable and have no side-effects.
 */

// ── Constants (overridable by env vars) ──────────────────────────────────────
export const ALERT_PENDING_RETRY_THRESHOLD = Math.max(
  1,
  Math.floor(Number(process.env.SYNC_ALERT_PENDING_RETRY_THRESHOLD ?? 8))
);
export const ALERT_DEAD_LETTER_24H_THRESHOLD = Math.max(
  1,
  Math.floor(Number(process.env.SYNC_ALERT_DEAD_LETTER_24H_THRESHOLD ?? 3))
);
export const ALERT_MAX_RETRY_ATTEMPT_THRESHOLD = Math.max(
  1,
  Math.floor(Number(process.env.SYNC_ALERT_MAX_RETRY_ATTEMPT_THRESHOLD ?? 3))
);
export const ALERT_FAILURE_RATE_24H_THRESHOLD = Math.max(
  0,
  Math.min(1, Number(process.env.SYNC_ALERT_FAILURE_RATE_24H_THRESHOLD ?? 0.25))
);
export const ESCALATION_DISPATCH_COOLDOWN_MINUTES = Math.max(
  1,
  Math.floor(Number(process.env.SYNC_ESCALATION_COOLDOWN_MINUTES ?? 60))
);
export const ESCALATION_OWNER_WARNING  = process.env.SYNC_ESCALATION_OWNER_WARNING  || 'ops-review';
export const ESCALATION_OWNER_CRITICAL = process.env.SYNC_ESCALATION_OWNER_CRITICAL || 'ops-oncall';

// ── Types ─────────────────────────────────────────────────────────────────────
export type EscalationSeverity = 'info' | 'warning' | 'critical';
export type EscalationStatus   = 'open' | 'resolved';

export type UserEscalationMetrics = {
  pendingRetries: number;
  maxRetryAttempt: number;
  deadLetters24h: number;
  runs24h: number;
  failures24h: number;
  failureRate24h: number;
};

export type EscalationCandidate = {
  code: string;
  severity: 'warning' | 'critical';
  owner: string;
  message: string;
  observed: number;
  threshold: number;
  metrics: UserEscalationMetrics;
};

// ── Pure helper functions ─────────────────────────────────────────────────────

export function toEscalationKey(userId: string, code: string): string {
  return `${userId}::${code}`;
}

function toEscalationOwner(severity: 'warning' | 'critical'): string {
  return severity === 'critical' ? ESCALATION_OWNER_CRITICAL : ESCALATION_OWNER_WARNING;
}

/**
 * Converts per-user sync metrics into zero or more escalation candidates.
 * Results are deterministically ordered (critical before warning, then alphabetical)
 * to make deduplication and tests reliable.
 */
export function toEscalationCandidates(
  metrics: UserEscalationMetrics,
): EscalationCandidate[] {
  const candidates: EscalationCandidate[] = [];
  const { pendingRetries, maxRetryAttempt, deadLetters24h, runs24h, failureRate24h } = metrics;

  if (pendingRetries >= ALERT_PENDING_RETRY_THRESHOLD) {
    candidates.push({
      code: 'retry_queue_backlog',
      severity: 'warning',
      owner: toEscalationOwner('warning'),
      message: `Retry queue backlog is elevated (${pendingRetries} pending).`,
      observed: pendingRetries,
      threshold: ALERT_PENDING_RETRY_THRESHOLD,
      metrics,
    });
  }

  if (maxRetryAttempt >= ALERT_MAX_RETRY_ATTEMPT_THRESHOLD) {
    candidates.push({
      code: 'high_retry_attempts',
      severity: 'warning',
      owner: toEscalationOwner('warning'),
      message: `Retry attempts are climbing (max attempt ${maxRetryAttempt}).`,
      observed: maxRetryAttempt,
      threshold: ALERT_MAX_RETRY_ATTEMPT_THRESHOLD,
      metrics,
    });
  }

  if (deadLetters24h >= ALERT_DEAD_LETTER_24H_THRESHOLD) {
    candidates.push({
      code: 'dead_letter_volume',
      severity: 'critical',
      owner: toEscalationOwner('critical'),
      message: `Dead-letter volume in 24h exceeded threshold (${deadLetters24h}).`,
      observed: deadLetters24h,
      threshold: ALERT_DEAD_LETTER_24H_THRESHOLD,
      metrics,
    });
  }

  if (runs24h > 0 && failureRate24h >= ALERT_FAILURE_RATE_24H_THRESHOLD) {
    candidates.push({
      code: 'scheduler_failure_rate',
      severity: 'critical',
      owner: toEscalationOwner('critical'),
      message: `Scheduler failure rate is high (${Math.round(failureRate24h * 100)}%).`,
      observed: Number((failureRate24h * 100).toFixed(2)),
      threshold: Number((ALERT_FAILURE_RATE_24H_THRESHOLD * 100).toFixed(2)),
      metrics,
    });
  }

  // Deterministic ordering for deduplication and tests
  const rank: Record<EscalationSeverity, number> = { critical: 0, warning: 1, info: 2 };
  return candidates.sort(
    (a, b) => rank[a.severity] - rank[b.severity] || a.code.localeCompare(b.code)
  );
}

/**
 * Returns true if enough time has elapsed since the last webhook dispatch
 * to allow a new one (respects cooldown period).
 */
export function shouldDispatchEscalation(params: {
  lastDispatchedAt?: string | null;
  nowMs?: number;
  cooldownMinutes?: number;
}): boolean {
  const {
    lastDispatchedAt,
    nowMs = Date.now(),
    cooldownMinutes = ESCALATION_DISPATCH_COOLDOWN_MINUTES,
  } = params;

  if (!lastDispatchedAt) return true;

  const dispatchedAtMs = new Date(lastDispatchedAt).getTime();
  if (Number.isNaN(dispatchedAtMs)) return true;

  const elapsedMs = nowMs - dispatchedAtMs;
  const requiredMs = Math.max(1, cooldownMinutes) * 60 * 1_000;
  return elapsedMs >= requiredMs;
}
