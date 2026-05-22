import crypto from 'node:crypto';

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { POST as syncGithub } from '@/app/api/sync/github/route';
import { POST as syncGmail } from '@/app/api/sync/gmail/route';
import { POST as syncGoogleCalendar } from '@/app/api/sync/google-calendar/route';
import { POST as syncNotion } from '@/app/api/sync/notion/route';
import { POST as syncReddit } from '@/app/api/sync/reddit/route';
import { POST as syncSlack } from '@/app/api/sync/slack/route';
import { POST as syncDiscord } from '@/app/api/sync/discord/route';
import { POST as syncEmbeddings } from '@/app/api/sync/embeddings/route';
import { logCronMetrics, logAsyncJobFailure } from '@/utils/monitoring';
import type { EmbeddingOutcome } from '@/services/sync/embeddings-sync';

type TokenRow = {
  user_id: string;
  platform: string;
};

type PlatformOutcome = {
  platform: string;
  routePlatform: string;
  success: boolean;
  status: number | null;
  durationMs: number;
  error?: string;
};

type UserSyncOutcome = {
  userId: string;
  platformResults: PlatformOutcome[];
  embeddings: EmbeddingOutcome;
};

type SyncRunLogInsertRow = {
  run_id: string;
  user_id: string;
  platform: string;
  trigger: 'cron' | 'manual' | 'recovery';
  status: 'success' | 'error' | 'skipped';
  http_status: number | null;
  duration_ms: number;
  attempt: number;
  started_at: string;
  completed_at: string;
  error_message: string | null;
  metadata: Record<string, unknown>;
};

type RetryQueueRow = {
  user_id: string;
  platform: string;
  retry_attempt: number;
  next_attempt_at: string;
};

type RetryQueueUpsertRow = {
  user_id: string;
  platform: string;
  retry_attempt: number;
  next_attempt_at: string;
  last_http_status: number | null;
  last_error_message: string | null;
  metadata: Record<string, unknown>;
  updated_at: string;
};

type RetryDeadLetterInsertRow = {
  run_id: string;
  user_id: string;
  platform: string;
  retry_attempt: number;
  last_http_status: number | null;
  error_message: string | null;
  failure_reason: 'max_attempts_exceeded' | 'non_retriable_status';
  metadata: Record<string, unknown>;
};

type EscalationSeverity = 'info' | 'warning' | 'critical';
type EscalationStatus = 'open' | 'resolved';

type EscalationEventRow = {
  user_id: string;
  code: string;
  severity: EscalationSeverity;
  status: EscalationStatus;
  owner: string;
  first_triggered_at: string;
  last_triggered_at: string;
  resolved_at: string | null;
  trigger_count: number;
  last_observed: number;
  threshold: number;
  message: string;
  last_dispatched_at: string | null;
  dispatch_count: number;
  metadata: Record<string, unknown>;
};

type EscalationCandidate = {
  code: string;
  severity: 'warning' | 'critical';
  owner: string;
  message: string;
  observed: number;
  threshold: number;
  metrics: {
    pendingRetries: number;
    maxRetryAttempt: number;
    deadLetters24h: number;
    runs24h: number;
    failures24h: number;
    failureRate24h: number;
  };
};

type UserEscalationMetrics = {
  pendingRetries: number;
  maxRetryAttempt: number;
  deadLetters24h: number;
  runs24h: number;
  failures24h: number;
  failureRate24h: number;
};

type RetryQueueMetricRow = {
  user_id: string;
  retry_attempt: number;
};

type RetryDeadLetterMetricRow = {
  user_id: string;
};

type RunLogMetricRow = {
  user_id: string;
  run_id: string;
  status: 'success' | 'error' | 'skipped';
};

type DispatchCandidate = {
  userId: string;
  code: string;
  severity: EscalationSeverity;
  owner: string;
  message: string;
  observed: number;
  threshold: number;
  metrics: EscalationCandidate['metrics'];
  nextDispatchCount: number;
};

type EscalationDispatchResult = {
  attempted: boolean;
  success: boolean;
  status: number | null;
  error?: string;
};

function toFiniteNumber(raw: string | undefined, fallback: number) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return parsed;
}

// All platforms that can be synced via the daily cron.
// OAuth platforms come from oauth_tokens; direct-key platforms are injected below.
const SUPPORTED_PLATFORMS = new Set([
  // Original 7
  'github', 'gmail', 'google_calendar', 'notion', 'reddit', 'slack', 'discord',
  // Expanded — all OAuth platforms added in later sessions
  'dropbox', 'asana', 'linear', 'clickup', 'netlify', 'webflow', 'canva',
  'strava', 'fitbit', 'withings', 'sentry', 'twitter',
]);
// Direct API-key platforms (no oauth_tokens row) — always included if env key set
const DIRECT_KEY_PLATFORMS: Array<{ platform: string; envKey: string }> = [
  { platform: 'vercel', envKey: 'VERCEL_API_TOKEN' },
  { platform: 'trello', envKey: 'TRELLO_API_KEY' },
  { platform: 'posthog', envKey: 'POSTHOG_API_KEY' },
  { platform: 'devin', envKey: 'DEVIN_API_KEY' },
  { platform: 'cursor', envKey: 'CURSOR_API_KEY' },
];
const SUPPORTED_RETRY_PLATFORMS = new Set([...SUPPORTED_PLATFORMS, 'embeddings']);

// ─── Runtime tuning constants ────────────────────────────────────────────────
const SYNC_TIMEOUT_MS = Number(process.env.CRON_SYNC_TIMEOUT_MS || 20000);
const EMBEDDINGS_TIMEOUT_MS = Number(process.env.CRON_EMBEDDINGS_TIMEOUT_MS || 25000);
const DEFAULT_MAX_USERS_PER_RUN = Number(process.env.CRON_MAX_USERS_PER_RUN || 10);
const USER_CONCURRENCY = Number(process.env.CRON_USER_CONCURRENCY || 3);
const PLATFORM_CONCURRENCY = Number(process.env.CRON_PLATFORM_CONCURRENCY || 2);
const RETRY_BASE_DELAY_MS = Number(process.env.CRON_RETRY_BASE_DELAY_MS || 60000);
const RETRY_MAX_DELAY_MS = Number(process.env.CRON_RETRY_MAX_DELAY_MS || 60 * 60 * 1000);
const RETRY_MAX_ATTEMPTS = Number(process.env.CRON_RETRY_MAX_ATTEMPTS || 4);
const RETRY_DUE_LIMIT = Number(process.env.CRON_RETRY_DUE_LIMIT || 100);
const RETRY_JITTER_RATIO = Number(process.env.CRON_RETRY_JITTER_RATIO || 0.2);

const ALERT_PENDING_RETRY_THRESHOLD = Math.max(
  1,
  Math.floor(toFiniteNumber(process.env.SYNC_ALERT_PENDING_RETRY_THRESHOLD, 8))
);
const ALERT_DEAD_LETTER_24H_THRESHOLD = Math.max(
  1,
  Math.floor(toFiniteNumber(process.env.SYNC_ALERT_DEAD_LETTER_24H_THRESHOLD, 3))
);
const ALERT_MAX_RETRY_ATTEMPT_THRESHOLD = Math.max(
  1,
  Math.floor(toFiniteNumber(process.env.SYNC_ALERT_MAX_RETRY_ATTEMPT_THRESHOLD, 3))
);
const ALERT_FAILURE_RATE_24H_THRESHOLD = Math.max(
  0,
  Math.min(1, toFiniteNumber(process.env.SYNC_ALERT_FAILURE_RATE_24H_THRESHOLD, 0.25))
);
const ESCALATION_WEBHOOK_URL = process.env.SYNC_ESCALATION_WEBHOOK_URL?.trim() || null;
const ESCALATION_DISPATCH_COOLDOWN_MINUTES = Math.max(
  1,
  Math.floor(toFiniteNumber(process.env.SYNC_ESCALATION_COOLDOWN_MINUTES, 60))
);
const ESCALATION_OWNER_WARNING = process.env.SYNC_ESCALATION_OWNER_WARNING || 'ops-review';
const ESCALATION_OWNER_CRITICAL = process.env.SYNC_ESCALATION_OWNER_CRITICAL || 'ops-oncall';
const ESCALATION_INCLUDE_WARNING = ['1', 'true', 'yes', 'on'].includes(
  (process.env.SYNC_ESCALATION_INCLUDE_WARNING || '').toLowerCase()
);

function toSyncRoutePlatform(platform: string) {
  if (platform === 'google_calendar') return 'google-calendar';
  return platform.replace(/_/g, '-');
}

function getSyncHandler(routePlatform: string) {
  switch (routePlatform) {
    case 'github':
      return syncGithub;
    case 'gmail':
      return syncGmail;
    case 'google-calendar':
      return syncGoogleCalendar;
    case 'notion':
      return syncNotion;
    case 'reddit':
      return syncReddit;
    case 'slack':
      return syncSlack;
    case 'discord':
      return syncDiscord;
    default:
      return null;
  }
}

function parseResponsePayload(rawBody: string) {
  if (!rawBody) return null;

  try {
    return JSON.parse(rawBody);
  } catch {
    return { message: rawBody.slice(0, 300) };
  }
}

function resolveBaseUrl(request: Request) {
  // If we are on localhost, always use relative or local origin to avoid hitting production
  const host = request.headers.get('host');
  if (host) {
    const protocol = host.includes('localhost') ? 'http' : 'https';
    return `${protocol}://${host}`;
  }

  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '');
  }

  return new URL(request.url).origin;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isMissingTable(errorCode?: string) {
  // Postgres undefined_table
  return errorCode === '42P01';
}

function toRetryQueueKey(userId: string, platform: string) {
  return `${userId}::${platform}`;
}

function fromRetryQueueKey(key: string) {
  const [userId, platform] = key.split('::');
  return { userId, platform };
}

export function computeRetryDelayMs(retryAttempt: number) {
  const normalizedAttempt = Math.max(1, retryAttempt);
  const exponent = normalizedAttempt - 1;
  const raw = RETRY_BASE_DELAY_MS * Math.pow(2, exponent);
  return Math.min(RETRY_MAX_DELAY_MS, raw);
}

function clampJitterRatio(raw: number) {
  if (!Number.isFinite(raw)) {
    return 0;
  }

  return Math.max(0, Math.min(1, raw));
}

export function computeRetryDelayWithJitterMs(retryAttempt: number, randomValue = Math.random()) {
  const baseDelay = computeRetryDelayMs(retryAttempt);
  const jitterRatio = clampJitterRatio(RETRY_JITTER_RATIO);
  if (jitterRatio <= 0) {
    return baseDelay;
  }

  const normalizedRandom = Math.max(0, Math.min(1, randomValue));
  const minFactor = 1 - jitterRatio;
  const maxFactor = 1 + jitterRatio;
  const factor = minFactor + (maxFactor - minFactor) * normalizedRandom;
  const jittered = Math.round(baseDelay * factor);
  return Math.min(RETRY_MAX_DELAY_MS, Math.max(1000, jittered));
}

function computeNextRetryAttemptAt(retryAttempt: number, retryDelayMs?: number) {
  const delayMs = typeof retryDelayMs === 'number' ? retryDelayMs : computeRetryDelayWithJitterMs(retryAttempt);
  return new Date(Date.now() + delayMs).toISOString();
}

function toRunAttemptFromRetryAttempt(retryAttempt: number | undefined) {
  if (!retryAttempt || retryAttempt < 1) {
    return 1;
  }

  return retryAttempt + 1;
}

function isNonRetriableHttpStatus(status: number | null) {
  if (status === null) {
    return false;
  }

  return status >= 400 && status < 500 && status !== 429;
}

function toEscalationOwner(severity: 'warning' | 'critical') {
  return severity === 'critical' ? ESCALATION_OWNER_CRITICAL : ESCALATION_OWNER_WARNING;
}

function toEscalationKey(userId: string, code: string) {
  return `${userId}::${code}`;
}

export function shouldDispatchEscalation(params: {
  lastDispatchedAt?: string | null;
  nowMs?: number;
  cooldownMinutes?: number;
}) {
  const { lastDispatchedAt, nowMs = Date.now(), cooldownMinutes = ESCALATION_DISPATCH_COOLDOWN_MINUTES } = params;

  if (!lastDispatchedAt) {
    return true;
  }

  const dispatchedAtMs = new Date(lastDispatchedAt).getTime();
  if (Number.isNaN(dispatchedAtMs)) {
    return true;
  }

  const elapsedMs = nowMs - dispatchedAtMs;
  const requiredMs = Math.max(1, cooldownMinutes) * 60 * 1000;
  return elapsedMs >= requiredMs;
}

export function toEscalationCandidates(metrics: UserEscalationMetrics): EscalationCandidate[] {
  const candidates: EscalationCandidate[] = [];
  const {
    pendingRetries,
    maxRetryAttempt,
    deadLetters24h,
    runs24h,
    failureRate24h,
  } = metrics;

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

  // Preserve deterministic ordering for dedupe and tests.
  const rank: Record<EscalationSeverity, number> = {
    critical: 0,
    warning: 1,
    info: 2,
  };

  return candidates.sort((a, b) => rank[a.severity] - rank[b.severity] || a.code.localeCompare(b.code));
}

async function dispatchEscalationWebhook(payload: Record<string, unknown>): Promise<EscalationDispatchResult> {
  if (!ESCALATION_WEBHOOK_URL) {
    return {
      attempted: false,
      success: false,
      status: null,
      error: 'SYNC_ESCALATION_WEBHOOK_URL is not configured.',
    };
  }

  try {
    const response = await fetchWithTimeout(
      ESCALATION_WEBHOOK_URL,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      },
      5000
    );

    if (!response.ok) {
      const body = await response.text();
      return {
        attempted: true,
        success: false,
        status: response.status,
        error: body.slice(0, 300) || `Webhook dispatch failed (${response.status}).`,
      };
    }

    return {
      attempted: true,
      success: true,
      status: response.status,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      attempted: true,
      success: false,
      status: null,
      error: message,
    };
  }
}

function getCronSecret(request: Request): string | null {
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice('Bearer '.length).trim();
  }

  const xSecret = request.headers.get('x-cron-secret');
  if (xSecret) return xSecret.trim();

  const url = new URL(request.url);
  return url.searchParams.get('secret')?.trim() || null;
}

function isAuthorizedCron(request: Request): boolean {
  const expectedSecret = process.env.CRON_SECRET;
  if (!expectedSecret) {
    return false;
  }

  const providedSecret = getCronSecret(request);
  return !!providedSecret && providedSecret === expectedSecret;
}

function toLogStatus(success: boolean, attempted = true): 'success' | 'error' | 'skipped' {
  if (!attempted) {
    return 'skipped';
  }

  return success ? 'success' : 'error';
}

function toIsoFromNowMinusDuration(durationMs: number) {
  return new Date(Date.now() - Math.max(0, durationMs)).toISOString();
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      cache: 'no-store',
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];

  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;

      if (index >= items.length) {
        return;
      }

      results[index] = await worker(items[index]);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => runWorker());
  await Promise.all(workers);

  return results;
}

async function runPlatformSync(
  baseUrl: string,
  platform: string,
  userId: string,
  secret: string
): Promise<PlatformOutcome> {
  const routePlatform = toSyncRoutePlatform(platform);
  const startedAt = Date.now();

  try {
    const handler = getSyncHandler(routePlatform);
    if (!handler) {
      // ── HTTP fallback for platforms without a direct in-process import ──────
      // All newer platforms (dropbox, asana, linear, clickup, netlify, webflow,
      // canva, strava, fitbit, withings, sentry, twitter, vercel, trello,
      // posthog, devin, cursor) are handled via HTTP sub-request.
      try {
        const requestUrl = `${baseUrl}/api/sync/${routePlatform}`;
        const response = await fetchWithTimeout(
          requestUrl,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-cron-secret': secret,
              'x-cron-user-id': userId,
            },
          },
          SYNC_TIMEOUT_MS
        );
        const rawBody = await response.text();
        const body = parseResponsePayload(rawBody);
        if (!response.ok) {
          return {
            platform, routePlatform, success: false, status: response.status,
            durationMs: Date.now() - startedAt,
            error: typeof body === 'object' && body && 'error' in body ? String(body.error) : `Sync failed (${response.status})`,
          };
        }
        return { platform, routePlatform, success: true, status: response.status, durationMs: Date.now() - startedAt };
      } catch (httpErr) {
        const message = httpErr instanceof Error ? httpErr.message : String(httpErr);
        return { platform, routePlatform, success: false, status: null, durationMs: Date.now() - startedAt, error: message };
      }
    }

    const requestUrl = new URL(`${baseUrl}/api/sync/${routePlatform}`);
    const response = await handler(
      new Request(requestUrl.toString(), {
        method: 'POST',
        headers: {
          'x-cron-secret': secret,
          'x-cron-user-id': userId,
        },
      })
    );

    const rawBody = await response.text();
    const body = parseResponsePayload(rawBody);

    if (!response.ok) {
      return {
        platform,
        routePlatform,
        success: false,
        status: response.status,
        durationMs: Date.now() - startedAt,
        error: typeof body === 'object' && body && 'error' in body ? String(body.error) : `Sync failed (${response.status})`,
      };
    }

    return {
      platform,
      routePlatform,
      success: true,
      status: response.status,
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      platform,
      routePlatform,
      success: false,
      status: null,
      durationMs: Date.now() - startedAt,
      error: message,
    };
  }
}

async function runEmbeddingsSync(baseUrl: string, userId: string, secret: string): Promise<EmbeddingOutcome> {
  const startedAt = Date.now();

  try {
    const requestUrl = new URL(`${baseUrl}/api/sync/embeddings`);
    const response = await syncEmbeddings(
      new Request(requestUrl.toString(), {
        method: 'POST',
        headers: {
          'x-cron-secret': secret,
          'x-cron-user-id': userId,
        },
      })
    );

    const rawBody = await response.text();
    const body = parseResponsePayload(rawBody);

    if (!response.ok) {
      return {
        attempted: true,
        success: false,
        status: response.status,
        durationMs: Date.now() - startedAt,
        error: typeof body === 'object' && body && 'error' in body ? String(body.error) : `Embeddings sync failed (${response.status})`,
      };
    }

    return {
      attempted: true,
      success: true,
      status: response.status,
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      attempted: true,
      success: false,
      status: null,
      durationMs: Date.now() - startedAt,
      error: message,
    };
  }
}

async function runCronSync(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET is not configured.' }, { status: 500 });
  }

  let supabase;
  try {
    supabase = createAdminClient();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: 'Admin client configuration is missing.', detail }, { status: 500 });
  }

  const params = new URL(request.url).searchParams;
  const forcedUserId = params.get('userId')?.trim();

  if (forcedUserId && !isUuid(forcedUserId)) {
    return NextResponse.json({ error: 'Invalid userId query parameter.' }, { status: 400 });
  }

  const requestedMaxUsers = Number(params.get('maxUsers') || DEFAULT_MAX_USERS_PER_RUN);
  const maxUsers = Number.isFinite(requestedMaxUsers)
    ? Math.max(1, Math.min(Math.floor(requestedMaxUsers), 100))
    : DEFAULT_MAX_USERS_PER_RUN;

  let query = supabase
    .from('oauth_tokens')
    .select('user_id, platform')
    .order('updated_at', { ascending: false })
    .limit(1000);

  if (forcedUserId) {
    query = query.eq('user_id', forcedUserId);
  }

  const { data: tokenRows, error: tokenError } = await query;

  if (tokenError) {
    return NextResponse.json(
      {
        error: 'Failed to load connected platforms for cron sync.',
        detail: tokenError.message,
      },
      { status: 500 }
    );
  }

  let retryRows: RetryQueueRow[] = [];
  let retryQueueWarning: string | null = null;
  let retryQueueReady = true;

  let retryQuery = supabase
    .from('sync_retry_queue')
    .select('user_id,platform,retry_attempt,next_attempt_at')
    .lte('next_attempt_at', new Date().toISOString())
    .order('next_attempt_at', { ascending: true })
    .limit(Math.max(1, RETRY_DUE_LIMIT));

  if (forcedUserId) {
    retryQuery = retryQuery.eq('user_id', forcedUserId);
  }

  const { data: retryRowsData, error: retryRowsError } = await retryQuery;
  if (retryRowsError) {
    retryQueueReady = false;
    if (isMissingTable(retryRowsError.code)) {
      retryQueueWarning = 'sync_retry_queue table is not available. Apply migration 006_sync_retry_queue.sql.';
    } else {
      retryQueueWarning = `Failed to read retry queue: ${retryRowsError.message}`;
    }

    console.warn('[Cron Sync] Retry queue unavailable:', retryQueueWarning);
  } else {
    retryRows = (retryRowsData ?? []) as RetryQueueRow[];
  }

  const userPlatformMap = new Map<string, Set<string>>();
  const retryAttemptMap = new Map<string, number>();
  const embeddingsRetryUsers = new Set<string>();
  const retryPriorityOrder = new Map<string, number>();

  (tokenRows as TokenRow[] | null)?.forEach((row) => {
    // Accept ALL platforms — SUPPORTED_PLATFORMS guards retry logic, not initial token scan
    if (!userPlatformMap.has(row.user_id)) {
      userPlatformMap.set(row.user_id, new Set());
    }
    userPlatformMap.get(row.user_id)?.add(row.platform);
  });

  // Inject direct-key platforms for every user that has oauth tokens (shared infrastructure)
  const directPlatformsToAdd = DIRECT_KEY_PLATFORMS
    .filter((p) => Boolean(process.env[p.envKey]))
    .map((p) => p.platform);
  for (const [uid] of userPlatformMap) {
    for (const dp of directPlatformsToAdd) {
      userPlatformMap.get(uid)?.add(dp);
    }
  }

  retryRows.forEach((row, index) => {
    if (!SUPPORTED_RETRY_PLATFORMS.has(row.platform)) {
      return;
    }

    if (!userPlatformMap.has(row.user_id)) {
      userPlatformMap.set(row.user_id, new Set());
    }

    if (!retryPriorityOrder.has(row.user_id)) {
      retryPriorityOrder.set(row.user_id, index);
    }

    retryAttemptMap.set(toRetryQueueKey(row.user_id, row.platform), Math.max(1, row.retry_attempt || 1));

    if (row.platform === 'embeddings') {
      embeddingsRetryUsers.add(row.user_id);
      return;
    }

    userPlatformMap.get(row.user_id)?.add(row.platform);
  });

  const users = Array.from(userPlatformMap.entries())
    .map(([userId, platforms]) => ({
      userId,
      platforms: Array.from(platforms),
    }))
    .sort((left, right) => {
      const leftPriority = retryPriorityOrder.has(left.userId) ? retryPriorityOrder.get(left.userId)! : Number.MAX_SAFE_INTEGER;
      const rightPriority = retryPriorityOrder.has(right.userId) ? retryPriorityOrder.get(right.userId)! : Number.MAX_SAFE_INTEGER;
      return leftPriority - rightPriority;
    })
    .slice(0, maxUsers);

  if (users.length === 0) {
    return NextResponse.json({
      ok: true,
      message: 'No eligible users with connected platforms were found.',
      processedUsers: 0,
      retry: {
        queueReady: retryQueueReady,
        dueCount: retryRows.length,
        scheduledCount: 0,
        resolvedCount: 0,
        droppedCount: 0,
        deadLetteredCount: 0,
        warning: retryQueueWarning,
      },
      observability: {
        runLogsPersisted: true,
        retryQueuePersisted: retryQueueReady,
        deadLetterPersisted: true,
        warning: retryQueueWarning,
      },
      outcomes: [],
    });
  }

  const baseUrl = resolveBaseUrl(request);
  const runId = crypto.randomUUID();
  const startedAt = Date.now();

  const outcomes = await runWithConcurrency(
    users,
    Math.max(1, USER_CONCURRENCY),
    async ({ userId, platforms }): Promise<UserSyncOutcome> => {
      const platformResults = await runWithConcurrency(
        platforms,
        Math.max(1, PLATFORM_CONCURRENCY),
        (platform) => runPlatformSync(baseUrl, platform, userId, cronSecret)
      );

      const anyPlatformSuccess = platformResults.some((result) => result.success);
      const hasEmbeddingsRetry = embeddingsRetryUsers.has(userId);
      const embeddings = anyPlatformSuccess || hasEmbeddingsRetry
        ? await runEmbeddingsSync(baseUrl, userId, cronSecret)
        : {
            attempted: false,
            success: false,
            status: null,
            durationMs: 0,
          };

      return {
        userId,
        platformResults,
        embeddings,
      };
    }
  );

  const processedUserIds = Array.from(new Set(outcomes.map((outcome) => outcome.userId)));

  const platformRuns = outcomes.flatMap((outcome) => outcome.platformResults);
  const platformSuccessCount = platformRuns.filter((result) => result.success).length;
  const platformFailureCount = platformRuns.length - platformSuccessCount;

  const embeddingsAttempted = outcomes.filter((outcome) => outcome.embeddings.attempted).length;
  const embeddingsSuccessCount = outcomes.filter((outcome) => outcome.embeddings.success).length;

  const syncRunLogs: SyncRunLogInsertRow[] = outcomes.flatMap((outcome) => {
    const completedAtIso = new Date().toISOString();

    const platformRows = outcome.platformResults.map((result) => {
      const retryAttempt = retryAttemptMap.get(toRetryQueueKey(outcome.userId, result.platform));

      return {
        run_id: runId,
        user_id: outcome.userId,
        platform: result.platform,
        trigger: 'cron' as const,
        status: toLogStatus(result.success),
        http_status: result.status,
        duration_ms: Math.max(0, result.durationMs),
        attempt: toRunAttemptFromRetryAttempt(retryAttempt),
        started_at: toIsoFromNowMinusDuration(result.durationMs),
        completed_at: completedAtIso,
        error_message: result.error ?? null,
        metadata: {
          routePlatform: result.routePlatform,
          retrySource: retryAttempt ? 'queue' : 'fresh',
          retryAttempt: retryAttempt ?? 0,
        },
      };
    });

    const embeddings = outcome.embeddings;
    const embeddingsRetryAttempt = retryAttemptMap.get(toRetryQueueKey(outcome.userId, 'embeddings'));
    const embeddingsRow: SyncRunLogInsertRow = {
      run_id: runId,
      user_id: outcome.userId,
      platform: 'embeddings',
      trigger: 'cron',
      status: toLogStatus(embeddings.success, embeddings.attempted),
      http_status: embeddings.status,
      duration_ms: Math.max(0, embeddings.durationMs),
      attempt: toRunAttemptFromRetryAttempt(embeddingsRetryAttempt),
      started_at: toIsoFromNowMinusDuration(embeddings.durationMs),
      completed_at: completedAtIso,
      error_message: embeddings.error ?? null,
      metadata: {
        attempted: embeddings.attempted,
        retrySource: embeddingsRetryAttempt ? 'queue' : 'fresh',
        retryAttempt: embeddingsRetryAttempt ?? 0,
      },
    };

    return [...platformRows, embeddingsRow];
  });

  const retryQueueUpserts: RetryQueueUpsertRow[] = [];
  const retryQueueDeleteKeySet = new Set<string>();
  const retryDeadLetters: RetryDeadLetterInsertRow[] = [];
  let retryDroppedCount = 0;
  let retryDeadLetteredCount = 0;

  const queueRetryForFailure = (params: {
    userId: string;
    platform: string;
    priorRetryAttempt: number;
    status: number | null;
    error: string | undefined;
  }) => {
    const { userId, platform, priorRetryAttempt, status, error } = params;
    const runAttempt = toRunAttemptFromRetryAttempt(priorRetryAttempt > 0 ? priorRetryAttempt : undefined);
    const queueKey = toRetryQueueKey(userId, platform);

    // Log async job failure for monitoring (Work Item #7)
    const jobType = platform === 'embeddings' ? 'embedding' : 'sync';
    logAsyncJobFailure(supabase, {
      jobId: `${runId}-${userId}-${platform}-${runAttempt}`,
      type: jobType as 'sync' | 'embedding',
      userId,
      platform,
      error: error || `HTTP ${status}`,
      timestamp: new Date().toISOString(),
      retriable: !isNonRetriableHttpStatus(status),
    }).catch((logError) => {
      console.warn('[Cron Sync] Failed to log async job failure:', logError);
    });

    if (isNonRetriableHttpStatus(status)) {
      retryDeadLetteredCount += 1;
      retryDroppedCount += 1;
      retryQueueDeleteKeySet.add(queueKey);
      retryDeadLetters.push({
        run_id: runId,
        user_id: userId,
        platform,
        retry_attempt: runAttempt,
        last_http_status: status,
        error_message: error ?? null,
        failure_reason: 'non_retriable_status',
        metadata: {
          runAttempt,
          maxRetryAttempts: Math.max(1, RETRY_MAX_ATTEMPTS),
          source: priorRetryAttempt > 0 ? 'retry' : 'cron',
        },
      });
      return;
    }

    if (runAttempt >= Math.max(1, RETRY_MAX_ATTEMPTS)) {
      retryDeadLetteredCount += 1;
      retryDroppedCount += 1;
      retryQueueDeleteKeySet.add(queueKey);
      retryDeadLetters.push({
        run_id: runId,
        user_id: userId,
        platform,
        retry_attempt: runAttempt,
        last_http_status: status,
        error_message: error ?? null,
        failure_reason: 'max_attempts_exceeded',
        metadata: {
          runAttempt,
          maxRetryAttempts: Math.max(1, RETRY_MAX_ATTEMPTS),
          source: priorRetryAttempt > 0 ? 'retry' : 'cron',
        },
      });
      return;
    }

    const nextRetryAttempt = priorRetryAttempt > 0 ? priorRetryAttempt + 1 : 1;
    const retryDelayMs = computeRetryDelayWithJitterMs(nextRetryAttempt);
    retryQueueUpserts.push({
      user_id: userId,
      platform,
      retry_attempt: nextRetryAttempt,
      next_attempt_at: computeNextRetryAttemptAt(nextRetryAttempt, retryDelayMs),
      last_http_status: status,
      last_error_message: error ?? null,
      metadata: {
        source: priorRetryAttempt > 0 ? 'retry' : 'cron',
        retryDelayMs,
        baseDelayMs: computeRetryDelayMs(nextRetryAttempt),
        jitterRatio: RETRY_JITTER_RATIO,
        maxRetryAttempts: Math.max(1, RETRY_MAX_ATTEMPTS),
        runId,
      },
      updated_at: new Date().toISOString(),
    });
  };

  outcomes.forEach((outcome) => {
    outcome.platformResults.forEach((result) => {
      const key = toRetryQueueKey(outcome.userId, result.platform);
      const priorRetryAttempt = retryAttemptMap.get(key) ?? 0;

      if (result.success) {
        retryQueueDeleteKeySet.add(key);
      } else {
        queueRetryForFailure({
          userId: outcome.userId,
          platform: result.platform,
          priorRetryAttempt,
          status: result.status,
          error: result.error,
        });
      }
    });

    if (!outcome.embeddings.attempted) {
      return;
    }

    const embeddingsKey = toRetryQueueKey(outcome.userId, 'embeddings');
    const priorEmbeddingsRetryAttempt = retryAttemptMap.get(embeddingsKey) ?? 0;

    if (outcome.embeddings.success) {
      retryQueueDeleteKeySet.add(embeddingsKey);
      return;
    }

    queueRetryForFailure({
      userId: outcome.userId,
      platform: 'embeddings',
      priorRetryAttempt: priorEmbeddingsRetryAttempt,
      status: outcome.embeddings.status,
      error: outcome.embeddings.error,
    });
  });

  const dedupedRetryQueueUpserts = Array.from(
    new Map(retryQueueUpserts.map((row) => [toRetryQueueKey(row.user_id, row.platform), row])).values()
  );
  const retryUpsertKeySet = new Set(dedupedRetryQueueUpserts.map((row) => toRetryQueueKey(row.user_id, row.platform)));
  const retryQueueDeleteRows = Array.from(retryQueueDeleteKeySet)
    .filter((key) => !retryUpsertKeySet.has(key))
    .map(fromRetryQueueKey);

  let logPersistenceError: string | null = null;
  if (syncRunLogs.length > 0) {
    const { error: runLogError } = await supabase.from('sync_run_logs').insert(syncRunLogs);
    if (runLogError) {
      // Keep scheduler execution successful even if observability persistence fails.
      logPersistenceError = runLogError.message;
      console.warn('[Cron Sync] Failed to persist sync run logs:', runLogError.message);
    }
  }

  let retryQueuePersistenceError: string | null = retryQueueWarning;
  let retryQueuePersisted = retryQueueReady;
  let deadLetterPersistenceError: string | null = null;
  let deadLetterPersisted = true;
  let escalationEvaluationWarning: string | null = null;
  let escalationPersistenceError: string | null = null;
  let escalationDispatchWarning: string | null = null;
  let escalationPersisted = true;
  let escalationActiveCount = 0;
  let escalationOpenedCount = 0;
  let escalationResolvedCount = 0;
  let escalationDispatchedCount = 0;
  let escalationDispatchFailureCount = 0;

  if (retryQueueReady) {
    if (dedupedRetryQueueUpserts.length > 0) {
      const { error: retryUpsertError } = await supabase
        .from('sync_retry_queue')
        .upsert(dedupedRetryQueueUpserts, { onConflict: 'user_id,platform' });

      if (retryUpsertError) {
        retryQueuePersisted = false;
        retryQueuePersistenceError = `Failed to upsert retry queue: ${retryUpsertError.message}`;
        console.warn('[Cron Sync] Failed to upsert retry queue:', retryUpsertError.message);
      }
    }

    if (retryQueueDeleteRows.length > 0) {
      const deleteResults = await Promise.all(
        retryQueueDeleteRows.map((row) =>
          supabase.from('sync_retry_queue').delete().eq('user_id', row.userId).eq('platform', row.platform)
        )
      );

      const firstDeleteError = deleteResults.find((result) => result.error)?.error;
      if (firstDeleteError) {
        retryQueuePersisted = false;
        retryQueuePersistenceError = `Failed to clear retry queue rows: ${firstDeleteError.message}`;
        console.warn('[Cron Sync] Failed to clear retry queue rows:', firstDeleteError.message);
      }
    }
  }

  if (retryDeadLetters.length > 0) {
    const { error: deadLetterInsertError } = await supabase.from('sync_retry_dead_letters').insert(retryDeadLetters);
    if (deadLetterInsertError) {
      deadLetterPersisted = false;
      if (isMissingTable(deadLetterInsertError.code)) {
        deadLetterPersistenceError = 'sync_retry_dead_letters table is not available. Apply migration 007_sync_retry_dead_letters.sql.';
      } else {
        deadLetterPersistenceError = `Failed to persist retry dead letters: ${deadLetterInsertError.message}`;
      }
      console.warn('[Cron Sync] Failed to persist retry dead letters:', deadLetterPersistenceError);
    }
  }

  if (processedUserIds.length > 0) {
    const since24hIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const metricWarnings: string[] = [];

    const metricsByUser = new Map<string, UserEscalationMetrics>();
    processedUserIds.forEach((userId) => {
      metricsByUser.set(userId, {
        pendingRetries: 0,
        maxRetryAttempt: 0,
        deadLetters24h: 0,
        runs24h: 0,
        failures24h: 0,
        failureRate24h: 0,
      });
    });

    const [retryMetricsResult, deadLetterMetricsResult, runLogMetricsResult] = await Promise.all([
      supabase
        .from('sync_retry_queue')
        .select('user_id,retry_attempt')
        .in('user_id', processedUserIds)
        .limit(Math.max(200, processedUserIds.length * 50)),
      supabase
        .from('sync_retry_dead_letters')
        .select('user_id')
        .in('user_id', processedUserIds)
        .gte('created_at', since24hIso)
        .limit(Math.max(200, processedUserIds.length * 100)),
      supabase
        .from('sync_run_logs')
        .select('user_id,run_id,status')
        .in('user_id', processedUserIds)
        .gte('created_at', since24hIso)
        .limit(Math.max(500, processedUserIds.length * 250)),
    ]);

    if (retryMetricsResult.error) {
      if (isMissingTable(retryMetricsResult.error.code)) {
        metricWarnings.push('sync_retry_queue table is not available. Apply migration 006_sync_retry_queue.sql.');
      } else {
        metricWarnings.push(`Failed to evaluate retry queue metrics: ${retryMetricsResult.error.message}`);
      }
    } else {
      ((retryMetricsResult.data ?? []) as RetryQueueMetricRow[]).forEach((row) => {
        const metrics = metricsByUser.get(row.user_id);
        if (!metrics) return;

        metrics.pendingRetries += 1;
        metrics.maxRetryAttempt = Math.max(metrics.maxRetryAttempt, row.retry_attempt || 0);
      });
    }

    if (deadLetterMetricsResult.error) {
      if (isMissingTable(deadLetterMetricsResult.error.code)) {
        metricWarnings.push('sync_retry_dead_letters table is not available. Apply migration 007_sync_retry_dead_letters.sql.');
      } else {
        metricWarnings.push(`Failed to evaluate dead-letter metrics: ${deadLetterMetricsResult.error.message}`);
      }
    } else {
      ((deadLetterMetricsResult.data ?? []) as RetryDeadLetterMetricRow[]).forEach((row) => {
        const metrics = metricsByUser.get(row.user_id);
        if (!metrics) return;
        metrics.deadLetters24h += 1;
      });
    }

    if (runLogMetricsResult.error) {
      if (isMissingTable(runLogMetricsResult.error.code)) {
        metricWarnings.push('sync_run_logs table is not available. Apply migration 005_sync_run_logs.sql.');
      } else {
        metricWarnings.push(`Failed to evaluate scheduler run metrics: ${runLogMetricsResult.error.message}`);
      }
    } else {
      const runsByUser = new Map<string, Map<string, boolean>>();

      ((runLogMetricsResult.data ?? []) as RunLogMetricRow[]).forEach((row) => {
        if (!runsByUser.has(row.user_id)) {
          runsByUser.set(row.user_id, new Map());
        }

        const userRunMap = runsByUser.get(row.user_id)!;
        const hasFailure = userRunMap.get(row.run_id) ?? false;
        userRunMap.set(row.run_id, hasFailure || row.status === 'error');
      });

      runsByUser.forEach((userRunMap, userId) => {
        const metrics = metricsByUser.get(userId);
        if (!metrics) return;

        metrics.runs24h = userRunMap.size;
        metrics.failures24h = Array.from(userRunMap.values()).filter(Boolean).length;
        metrics.failureRate24h = metrics.runs24h > 0 ? metrics.failures24h / metrics.runs24h : 0;
      });
    }

    const activeCandidatesByKey = new Map<string, { userId: string; candidate: EscalationCandidate }>();
    metricsByUser.forEach((metrics, userId) => {
      const candidates = toEscalationCandidates(metrics);
      candidates.forEach((candidate) => {
        activeCandidatesByKey.set(toEscalationKey(userId, candidate.code), { userId, candidate });
      });
    });

    escalationActiveCount = activeCandidatesByKey.size;

    const { data: escalationRowsData, error: escalationRowsError } = await supabase
      .from('sync_escalation_events')
      .select('user_id,code,severity,status,owner,first_triggered_at,last_triggered_at,resolved_at,trigger_count,last_observed,threshold,message,last_dispatched_at,dispatch_count,metadata')
      .in('user_id', processedUserIds)
      .limit(Math.max(200, processedUserIds.length * 20));

    if (escalationRowsError) {
      escalationPersisted = false;
      if (isMissingTable(escalationRowsError.code)) {
        escalationPersistenceError =
          'sync_escalation_events table is not available. Apply migration 008_sync_escalation_events.sql.';
      } else {
        escalationPersistenceError = `Failed to read escalation events: ${escalationRowsError.message}`;
      }
      console.warn('[Cron Sync] Escalation persistence unavailable:', escalationPersistenceError);
    } else {
      const existingEscalationRows = (escalationRowsData ?? []) as EscalationEventRow[];
      const existingByKey = new Map(
        existingEscalationRows.map((row) => [toEscalationKey(row.user_id, row.code), row])
      );

      const nowIso = new Date().toISOString();
      const activeUpserts: Array<{
        user_id: string;
        code: string;
        severity: EscalationSeverity;
        status: EscalationStatus;
        owner: string;
        first_triggered_at: string;
        last_triggered_at: string;
        resolved_at: string | null;
        trigger_count: number;
        last_observed: number;
        threshold: number;
        message: string;
        last_dispatched_at: string | null;
        dispatch_count: number;
        metadata: Record<string, unknown>;
        updated_at: string;
      }> = [];

      const dispatchCandidates: DispatchCandidate[] = [];
      const activeKeys = new Set<string>();

      activeCandidatesByKey.forEach(({ userId, candidate }, key) => {
        activeKeys.add(key);
        const existing = existingByKey.get(key);
        const existingMetadata = existing?.metadata && typeof existing.metadata === 'object' ? existing.metadata : {};

        if (!existing || existing.status !== 'open') {
          escalationOpenedCount += 1;
        }

        activeUpserts.push({
          user_id: userId,
          code: candidate.code,
          severity: candidate.severity,
          status: 'open',
          owner: candidate.owner,
          first_triggered_at: !existing || existing.status !== 'open' ? nowIso : existing.first_triggered_at,
          last_triggered_at: nowIso,
          resolved_at: null,
          trigger_count: (existing?.trigger_count ?? 0) + 1,
          last_observed: candidate.observed,
          threshold: candidate.threshold,
          message: candidate.message,
          last_dispatched_at: existing?.last_dispatched_at ?? null,
          dispatch_count: existing?.dispatch_count ?? 0,
          metadata: {
            ...existingMetadata,
            lastEvaluatedAt: nowIso,
            lastRunId: runId,
            metrics: candidate.metrics,
          },
          updated_at: nowIso,
        });

        const shouldAttemptDispatch =
          !!ESCALATION_WEBHOOK_URL &&
          (candidate.severity === 'critical' || ESCALATION_INCLUDE_WARNING) &&
          shouldDispatchEscalation({
            lastDispatchedAt: existing?.last_dispatched_at ?? null,
          });

        if (shouldAttemptDispatch) {
          dispatchCandidates.push({
            userId,
            code: candidate.code,
            severity: candidate.severity,
            owner: candidate.owner,
            message: candidate.message,
            observed: candidate.observed,
            threshold: candidate.threshold,
            metrics: candidate.metrics,
            nextDispatchCount: (existing?.dispatch_count ?? 0) + 1,
          });
        }
      });

      const rowsToResolve = existingEscalationRows.filter((row) => {
        if (row.status !== 'open') {
          return false;
        }

        return !activeKeys.has(toEscalationKey(row.user_id, row.code));
      });

      escalationResolvedCount = rowsToResolve.length;

      if (activeUpserts.length > 0) {
        const { error: escalationUpsertError } = await supabase
          .from('sync_escalation_events')
          .upsert(activeUpserts, { onConflict: 'user_id,code' });

        if (escalationUpsertError) {
          escalationPersisted = false;
          escalationPersistenceError = `Failed to upsert escalation events: ${escalationUpsertError.message}`;
          console.warn('[Cron Sync] Failed to upsert escalation events:', escalationUpsertError.message);
        }
      }

      if (rowsToResolve.length > 0) {
        const resolveResults = await Promise.all(
          rowsToResolve.map((row) =>
            supabase
              .from('sync_escalation_events')
              .update({
                status: 'resolved',
                resolved_at: nowIso,
                updated_at: nowIso,
              })
              .eq('user_id', row.user_id)
              .eq('code', row.code)
          )
        );

        const firstResolveError = resolveResults.find((result) => result.error)?.error;
        if (firstResolveError) {
          escalationPersisted = false;
          escalationPersistenceError = `Failed to resolve escalation events: ${firstResolveError.message}`;
          console.warn('[Cron Sync] Failed to resolve escalation events:', firstResolveError.message);
        }
      }

      if (!ESCALATION_WEBHOOK_URL && escalationActiveCount > 0) {
        escalationDispatchWarning =
          'SYNC_ESCALATION_WEBHOOK_URL is not configured. Escalations were persisted without outbound dispatch.';
      }

      if (dispatchCandidates.length > 0 && ESCALATION_WEBHOOK_URL) {
        for (const candidate of dispatchCandidates) {
          const dispatchPayload = {
            service: 'the-eyes',
            event: 'sync-escalation',
            emittedAt: new Date().toISOString(),
            runId,
            userId: candidate.userId,
            code: candidate.code,
            severity: candidate.severity,
            owner: candidate.owner,
            message: candidate.message,
            observed: candidate.observed,
            threshold: candidate.threshold,
            metrics: candidate.metrics,
          };

          const dispatchResult = await dispatchEscalationWebhook(dispatchPayload);
          if (!dispatchResult.success) {
            escalationDispatchFailureCount += dispatchResult.attempted ? 1 : 0;
            const message = dispatchResult.error || 'Unknown webhook dispatch error.';
            console.warn('[Cron Sync] Escalation webhook dispatch failed:', message);
            escalationDispatchWarning = escalationDispatchWarning
              ? `${escalationDispatchWarning} | ${candidate.code}:${message}`
              : `${candidate.code}:${message}`;
            continue;
          }

          const dispatchedAtIso = new Date().toISOString();
          const { error: dispatchUpdateError } = await supabase
            .from('sync_escalation_events')
            .update({
              last_dispatched_at: dispatchedAtIso,
              dispatch_count: candidate.nextDispatchCount,
              updated_at: dispatchedAtIso,
            })
            .eq('user_id', candidate.userId)
            .eq('code', candidate.code);

          if (dispatchUpdateError) {
            escalationPersisted = false;
            escalationPersistenceError = `Failed to update escalation dispatch metadata: ${dispatchUpdateError.message}`;
            console.warn('[Cron Sync] Failed to persist escalation dispatch metadata:', dispatchUpdateError.message);
            continue;
          }

          escalationDispatchedCount += 1;
        }
      }
    }

    if (metricWarnings.length > 0) {
      escalationEvaluationWarning = metricWarnings.join(' | ');
    }
  }

  let observabilityWarning = [
    logPersistenceError,
    retryQueuePersistenceError,
    deadLetterPersistenceError,
    escalationEvaluationWarning,
    escalationPersistenceError,
    escalationDispatchWarning,
  ]
    .filter(Boolean)
    .join(' | ') || null;

  // Log cron execution metrics for monitoring (Work Item #7)
  const cronMetricsResult = await logCronMetrics(supabase, {
    runId,
    durationMs: Date.now() - startedAt,
    processedUsers: outcomes.length,
    platformRuns: platformRuns.length,
    platformSuccessCount,
    platformFailureCount,
    embeddingsAttempted: embeddingsAttempted > 0,
    embeddingsSuccessCount,
    embeddingsFailureCount: embeddingsAttempted - embeddingsSuccessCount,
    retryQueueDepth: dedupedRetryQueueUpserts.length,
    deadLetterCount24h: retryDeadLetteredCount,
    escalationCount: escalationActiveCount,
    successRate: platformRuns.length > 0 ? platformSuccessCount / platformRuns.length : 0,
    timestamp: new Date().toISOString(),
  });

  if (!cronMetricsResult.success) {
    const monitoringWarning = `Cron metrics logging failed: ${cronMetricsResult.error}`;
    console.warn('[Cron Sync] Monitoring:', monitoringWarning);
    observabilityWarning = observabilityWarning
      ? `${observabilityWarning} | ${monitoringWarning}`
      : monitoringWarning;
  }

  return NextResponse.json({
    ok: true,
    message: 'Cron sync cycle completed.',
    runId,
    durationMs: Date.now() - startedAt,
    processedUsers: outcomes.length,
    platformRuns: platformRuns.length,
    platformSuccessCount,
    platformFailureCount,
    embeddingsAttempted,
    embeddingsSuccessCount,
    retry: {
      queueReady: retryQueueReady,
      dueCount: retryRows.length,
      scheduledCount: dedupedRetryQueueUpserts.length,
      resolvedCount: retryQueueDeleteRows.length,
      droppedCount: retryDroppedCount,
      deadLetteredCount: retryDeadLetteredCount,
      warning: retryQueuePersistenceError,
    },
    escalation: {
      activeCount: escalationActiveCount,
      openedCount: escalationOpenedCount,
      resolvedCount: escalationResolvedCount,
      dispatchedCount: escalationDispatchedCount,
      dispatchFailureCount: escalationDispatchFailureCount,
      warning: [escalationEvaluationWarning, escalationPersistenceError, escalationDispatchWarning]
        .filter(Boolean)
        .join(' | ') || null,
    },
    observability: {
      runLogsPersisted: !logPersistenceError,
      retryQueuePersisted,
      deadLetterPersisted,
      escalationPersisted,
      cronMetricsLogged: cronMetricsResult.success,
      warning: observabilityWarning,
    },
    outcomes,
  });
}

export async function GET(request: Request) {
  return runCronSync(request);
}

export async function POST(request: Request) {
  return runCronSync(request);
}
