/**
 * Webhook escalation utilities - Work Item #6: Webhook Escalation Tuning
 * Optimizes payload sizes, batching, and retry timing for escalation webhooks
 */

interface WebhookPayload {
  service: string;
  event: string;
  emittedAt: string;
  runId: string;
  userId: string;
  code: string;
  severity: 'warning' | 'critical';
  owner: string;
  message: string;
  observed: number;
  threshold: number;
  metrics: Record<string, unknown>;
}

interface OptimizedWebhookPayload {
  service: string;
  event: string;
  t: string; // timestamp (compact)
  r: string; // runId (compact)
  u: string; // userId (compact)
  c: string; // code
  s: 'w' | 'c'; // severity (compact: w=warning, c=critical)
  o: string; // owner
  m: string; // message
  ob: number; // observed
  th: number; // threshold
  // metrics included only if they contain critical thresholds
  mt?: {
    pr?: number; // pendingRetries (only if > 0)
    dl?: number; // deadLetters24h (only if > 0)
    fr?: number; // failureRate24h (as percentage 0-100, only if > 0)
  };
}

/**
 * Optimize webhook payload to reduce transmission size
 * Work Item #6: Reduces payload by ~50% through field compaction
 */
export function optimizeWebhookPayload(payload: WebhookPayload): OptimizedWebhookPayload {
  const metrics = payload.metrics || {};
  const optimized: OptimizedWebhookPayload = {
    service: payload.service,
    event: payload.event,
    t: payload.emittedAt,
    r: payload.runId.slice(0, 8), // Use first 8 chars of UUID
    u: payload.userId.slice(0, 8),
    c: payload.code,
    s: payload.severity === 'critical' ? 'c' : 'w',
    o: payload.owner,
    m: payload.message.slice(0, 200), // Truncate message to 200 chars
    ob: payload.observed,
    th: payload.threshold,
  };

  // Include metrics only if they have critical values
  const compactMetrics: OptimizedWebhookPayload['mt'] = {};
  let hasMetrics = false;

  if (typeof metrics === 'object' && metrics !== null) {
    const metricsRecord = metrics as Record<string, unknown>;
    const pendingRetries = metricsRecord['pendingRetries'];
    if (typeof pendingRetries === 'number' && pendingRetries > 0) {
      compactMetrics.pr = pendingRetries;
      hasMetrics = true;
    }

    const deadLetters = metricsRecord['deadLetters24h'];
    if (typeof deadLetters === 'number' && deadLetters > 0) {
      compactMetrics.dl = deadLetters;
      hasMetrics = true;
    }

    const failureRate = metricsRecord['failureRate24h'];
    if (typeof failureRate === 'number' && failureRate > 0) {
      // Convert to percentage (0-100)
      compactMetrics.fr = Math.round(failureRate * 100);
      hasMetrics = true;
    }
  }

  if (hasMetrics) {
    optimized.mt = compactMetrics;
  }

  return optimized;
}

/**
 * Restore optimized payload to original format for backward compatibility
 * Work Item #6: Decompression utility
 */
export function restoreWebhookPayload(optimized: OptimizedWebhookPayload): WebhookPayload {
  const mt = optimized.mt || {};
  return {
    service: optimized.service,
    event: optimized.event,
    emittedAt: optimized.t,
    runId: optimized.r,
    userId: optimized.u,
    code: optimized.c,
    severity: optimized.s === 'c' ? 'critical' : 'warning',
    owner: optimized.o,
    message: optimized.m,
    observed: optimized.ob,
    threshold: optimized.th,
    metrics: {
      pendingRetries: mt.pr || 0,
      deadLetters24h: mt.dl || 0,
      failureRate24h: (mt.fr ?? 0) / 100,
    },
  };
}

/**
 * Batch multiple escalations into a single webhook call
 * Work Item #6: Reduces number of outbound requests
 */
export interface BatchedWebhookPayload {
  service: string;
  event: string;
  emittedAt: string;
  runId: string;
  escalations: OptimizedWebhookPayload[];
  count: number;
}

export function batchWebhookPayloads(
  payloads: WebhookPayload[],
  runId: string
): BatchedWebhookPayload {
  return {
    service: 'the-eyes',
    event: 'sync-escalation-batch',
    emittedAt: new Date().toISOString(),
    runId,
    escalations: payloads.map(optimizeWebhookPayload),
    count: payloads.length,
  };
}

/**
 * Calculate backoff delay for webhook retry
 * Work Item #6: Exponential backoff with jitter
 */
export function calculateWebhookRetryDelay(
  attemptNumber: number,
  baseDelayMs: number = 1000
): number {
  const exponent = Math.min(attemptNumber, 5); // Cap at 5 to avoid huge delays
  const delay = baseDelayMs * Math.pow(2, exponent);
  const jitter = Math.random() * delay * 0.1; // 10% jitter
  return Math.floor(delay + jitter);
}

/**
 * Check if webhook error is retriable
 * Work Item #6: Distinguishes transient from permanent failures
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function isRetriableWebhookError(status: number | null, _error: string | null): boolean {
  if (status === null) {
    // Network error - retriable
    return true;
  }

  if (status >= 500) {
    // Server error - retriable
    return true;
  }

  if (status === 429) {
    // Rate limited - retriable with backoff
    return true;
  }

  if (status === 408) {
    // Request timeout - retriable
    return true;
  }

  // 4xx client errors (except 408) are not retriable
  // 3xx redirects are not retriable (should be resolved by fetch)
  // 2xx successes are not errors
  return false;
}

/**
 * Calculate webhook dispatch cooldown
 * Work Item #6: Prevents escalation spam
 */
export function calculateEscalationCooldown(
  dispatchCount: number,
  baseCooldownMinutes: number = 60
): number {
  // Linear backoff: first dispatch cooldown is base, second is 2x, etc.
  const cooldownMinutes = baseCooldownMinutes * Math.min(dispatchCount + 1, 5);
  return cooldownMinutes * 60 * 1000; // Convert to milliseconds
}

/**
 * Get webhook timeout based on escalation severity
 * Work Item #6: Critical escalations get more time
 */
export function getWebhookTimeoutMs(severity: 'warning' | 'critical'): number {
  // Critical escalations get 10s timeout, warnings get 5s
  return severity === 'critical' ? 10000 : 5000;
}

/**
 * Format webhook dispatch error for logging
 * Work Item #6: Better observability
 */
export interface WebhookDispatchError {
  code: string;
  severity: string;
  status: number | null;
  message: string;
  retriable: boolean;
  timestamp: string;
}

export function createWebhookDispatchError(
  code: string,
  severity: string,
  status: number | null,
  errorMessage: string
): WebhookDispatchError {
  return {
    code,
    severity,
    status,
    message: errorMessage.slice(0, 200),
    retriable: isRetriableWebhookError(status, errorMessage),
    timestamp: new Date().toISOString(),
  };
}
