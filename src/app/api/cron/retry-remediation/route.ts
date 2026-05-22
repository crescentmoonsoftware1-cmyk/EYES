import crypto from 'node:crypto';

import { NextResponse } from 'next/server';

import { createAdminClient } from '@/utils/supabase/admin';

type RemediationAction = 'requeue' | 'purge';

type RetryDeadLetterRow = {
  id: string;
  run_id: string;
  user_id: string;
  platform: string;
  retry_attempt: number;
  last_http_status: number | null;
  error_message: string | null;
  failure_reason: 'max_attempts_exceeded' | 'non_retriable_status';
  metadata: Record<string, unknown>;
  created_at: string;
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

const SUPPORTED_REMEDIATION_PLATFORMS = new Set([
  'github',
  'gmail',
  'google_calendar',
  'notion',
  'reddit',
  'embeddings',
]);

const DEFAULT_REMEDIATION_LIMIT = Number(process.env.CRON_REMEDIATION_MAX_PER_RUN || 50);
const DEFAULT_PURGE_OLDER_THAN_HOURS = Number(process.env.CRON_REMEDIATION_PURGE_OLDER_THAN_HOURS || 24 * 14);

const RETRY_BASE_DELAY_MS = Number(process.env.CRON_RETRY_BASE_DELAY_MS || 60000);
const RETRY_MAX_DELAY_MS = Number(process.env.CRON_RETRY_MAX_DELAY_MS || 60 * 60 * 1000);
const RETRY_JITTER_RATIO = Number(process.env.CRON_RETRY_JITTER_RATIO || 0.2);

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isMissingTable(errorCode?: string) {
  return errorCode === '42P01';
}

function getCronSecret(request: Request): string | null {
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice('Bearer '.length).trim();
  }

  const xSecret = request.headers.get('x-cron-secret');
  return xSecret?.trim() || null;
}

function isAuthorizedCron(request: Request): boolean {
  const expectedSecret = process.env.CRON_SECRET;
  if (!expectedSecret) {
    return false;
  }

  const providedSecret = getCronSecret(request);
  return !!providedSecret && providedSecret === expectedSecret;
}

function toQueueKey(userId: string, platform: string) {
  return `${userId}::${platform}`;
}

function clampInteger(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, Math.floor(value)));
}

function parseBoolean(raw: string | null) {
  if (!raw) {
    return false;
  }

  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
}

function parseAction(raw: string | null): RemediationAction | null {
  const normalized = (raw || 'requeue').toLowerCase();
  if (normalized === 'requeue' || normalized === 'purge') {
    return normalized;
  }

  return null;
}

function clampJitterRatio(raw: number) {
  if (!Number.isFinite(raw)) {
    return 0;
  }

  return Math.max(0, Math.min(1, raw));
}

function computeRetryDelayMs(retryAttempt: number) {
  const normalizedAttempt = Math.max(1, retryAttempt);
  const exponent = normalizedAttempt - 1;
  const raw = RETRY_BASE_DELAY_MS * Math.pow(2, exponent);
  return Math.min(RETRY_MAX_DELAY_MS, raw);
}

function computeRetryDelayWithJitterMs(retryAttempt: number, randomValue = Math.random()) {
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

async function runRetryRemediation(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  // Default to 'requeue' so Vercel cron (which cannot pass query params) works correctly.
  const action = parseAction(params.get('action')?.trim() ?? 'requeue');
  if (!action) {
    return NextResponse.json({ error: 'Invalid action. Use action=requeue or action=purge.' }, { status: 400 });
  }

  const forcedUserId = params.get('userId')?.trim();
  if (forcedUserId && !isUuid(forcedUserId)) {
    return NextResponse.json({ error: 'Invalid userId query parameter.' }, { status: 400 });
  }

  const forcedPlatform = params.get('platform')?.trim();
  if (forcedPlatform && !SUPPORTED_REMEDIATION_PLATFORMS.has(forcedPlatform)) {
    return NextResponse.json(
      {
        error: 'Invalid platform query parameter.',
        supportedPlatforms: Array.from(SUPPORTED_REMEDIATION_PLATFORMS),
      },
      { status: 400 }
    );
  }

  const dryRun = parseBoolean(params.get('dryRun'));
  const limit = clampInteger(Number(params.get('limit') || DEFAULT_REMEDIATION_LIMIT), 1, 500);
  const olderThanHours = clampInteger(
    Number(params.get('olderThanHours') || DEFAULT_PURGE_OLDER_THAN_HOURS),
    1,
    24 * 365
  );

  if (action === 'purge' && !dryRun) {
    const confirm = params.get('confirm')?.trim().toLowerCase();
    if (confirm !== 'purge') {
      return NextResponse.json(
        {
          error: 'Purge requires confirm=purge unless dryRun=1.',
        },
        { status: 400 }
      );
    }
  }

  let supabase;
  try {
    supabase = createAdminClient();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: 'Admin client configuration is missing.', detail }, { status: 500 });
  }

  let query = supabase
    .from('sync_retry_dead_letters')
    .select('id,run_id,user_id,platform,retry_attempt,last_http_status,error_message,failure_reason,metadata,created_at')
    .order('created_at', { ascending: true })
    .limit(limit);

  if (forcedUserId) {
    query = query.eq('user_id', forcedUserId);
  }

  if (forcedPlatform) {
    query = query.eq('platform', forcedPlatform);
  }

  if (action === 'purge') {
    const cutoffIso = new Date(Date.now() - olderThanHours * 60 * 60 * 1000).toISOString();
    query = query.lte('created_at', cutoffIso);
  }

  const { data, error } = await query;
  if (error) {
    if (isMissingTable(error.code)) {
      return NextResponse.json(
        {
          error: 'sync_retry_dead_letters table is not available. Apply migration 007_sync_retry_dead_letters.sql.',
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        error: 'Failed to load dead-letter rows.',
        detail: error.message,
      },
      { status: 500 }
    );
  }

  const deadLetterRows = (data ?? []) as RetryDeadLetterRow[];

  if (deadLetterRows.length === 0) {
    return NextResponse.json({
      ok: true,
      action,
      dryRun,
      selectedCount: 0,
      requeuedCount: 0,
      purgedCount: 0,
      message: 'No dead-letter candidates found.',
    });
  }

  if (action === 'purge') {
    if (dryRun) {
      return NextResponse.json({
        ok: true,
        action,
        dryRun,
        selectedCount: deadLetterRows.length,
        purgedCount: 0,
        candidateSample: deadLetterRows.slice(0, 5).map((row) => ({
          id: row.id,
          userId: row.user_id,
          platform: row.platform,
          retryAttempt: row.retry_attempt,
          createdAt: row.created_at,
          failureReason: row.failure_reason,
        })),
      });
    }

    const ids = deadLetterRows.map((row) => row.id);
    const { error: deleteError } = await supabase.from('sync_retry_dead_letters').delete().in('id', ids);
    if (deleteError) {
      return NextResponse.json(
        {
          error: 'Failed to purge dead letters.',
          detail: deleteError.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      action,
      dryRun,
      selectedCount: deadLetterRows.length,
      purgedCount: ids.length,
      message: 'Dead-letter rows purged.',
    });
  }

  const remediationRunId = crypto.randomUUID();
  const nowIso = new Date().toISOString();

  const dedupedRows = Array.from(
    new Map(deadLetterRows.map((row) => [toQueueKey(row.user_id, row.platform), row])).values()
  );

  const retryQueueUpserts: RetryQueueUpsertRow[] = dedupedRows.map((row) => {
    const retryDelayMs = computeRetryDelayWithJitterMs(1);

    return {
      user_id: row.user_id,
      platform: row.platform,
      retry_attempt: 1,
      next_attempt_at: new Date(Date.now() + retryDelayMs).toISOString(),
      last_http_status: row.last_http_status,
      last_error_message: row.error_message,
      metadata: {
        remediationRunId,
        remediatedAt: nowIso,
        replayedFromDeadLetterId: row.id,
        replayedFromRunId: row.run_id,
        priorFailureReason: row.failure_reason,
        priorRetryAttempt: row.retry_attempt,
        retryDelayMs,
        jitterRatio: RETRY_JITTER_RATIO,
      },
      updated_at: nowIso,
    };
  });

  if (dryRun) {
    return NextResponse.json({
      ok: true,
      action,
      dryRun,
      runId: remediationRunId,
      selectedCount: deadLetterRows.length,
      requeuedCount: retryQueueUpserts.length,
      resolvedDeadLetters: 0,
      candidateSample: retryQueueUpserts.slice(0, 5).map((row) => ({
        userId: row.user_id,
        platform: row.platform,
        nextAttemptAt: row.next_attempt_at,
      })),
    });
  }

  const { error: retryQueueError } = await supabase
    .from('sync_retry_queue')
    .upsert(retryQueueUpserts, { onConflict: 'user_id,platform' });

  if (retryQueueError) {
    if (isMissingTable(retryQueueError.code)) {
      return NextResponse.json(
        {
          error: 'sync_retry_queue table is not available. Apply migration 006_sync_retry_queue.sql.',
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        error: 'Failed to replay dead letters into retry queue.',
        detail: retryQueueError.message,
      },
      { status: 500 }
    );
  }

  const deadLetterIds = deadLetterRows.map((row) => row.id);
  const { error: deleteError } = await supabase.from('sync_retry_dead_letters').delete().in('id', deadLetterIds);

  if (deleteError) {
    return NextResponse.json(
      {
        error: 'Dead letters were requeued, but cleanup failed.',
        detail: deleteError.message,
        runId: remediationRunId,
        selectedCount: deadLetterRows.length,
        requeuedCount: retryQueueUpserts.length,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    action,
    dryRun,
    runId: remediationRunId,
    selectedCount: deadLetterRows.length,
    requeuedCount: retryQueueUpserts.length,
    resolvedDeadLetters: deadLetterIds.length,
    message: 'Dead letters replayed to retry queue.',
  });
}

export async function GET(request: Request) {
  return runRetryRemediation(request);
}

export async function POST(request: Request) {
  return runRetryRemediation(request);
}
