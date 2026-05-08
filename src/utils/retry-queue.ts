/**
 * Retry queue management utilities - Work Item #5: Retry Queue Optimization
 * Provides batch operations for retry queue processing with exponential backoff
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface RetryQueueEntry {
  user_id: string;
  platform: string;
  retry_attempt: number;
  next_attempt_at: string;
  last_http_status: number | null;
  last_error_message: string | null;
}

export interface RetryQueueUpdateRequest {
  user_id: string;
  platform: string;
  retry_attempt: number;
  next_attempt_at: string;
  http_status: number | null;
  error_message: string | null;
  metadata?: Record<string, unknown>;
}

export interface RetryDeadLetterEntry {
  user_id: string;
  platform: string;
  retry_attempt: number;
  http_status: number | null;
  error_message: string | null;
  failure_reason: 'max_attempts_exceeded' | 'non_retriable_status';
}

const BASE_RETRY_DELAY_MS = Number(process.env.CRON_RETRY_BASE_DELAY_MS || 60000);
const MAX_RETRY_DELAY_MS = Number(process.env.CRON_RETRY_MAX_DELAY_MS || 3600000);
const MAX_RETRY_ATTEMPTS = Number(process.env.CRON_RETRY_MAX_ATTEMPTS || 4);
const JITTER_RATIO = Number(process.env.CRON_RETRY_JITTER_RATIO || 0.2);

/**
 * Calculate exponential backoff delay with jitter
 * Work Item #5: Ensures proper spacing between retry attempts
 */
export function calculateRetryDelay(attemptNumber: number): number {
  const normalizedAttempt = Math.max(1, attemptNumber);
  const exponent = normalizedAttempt - 1;
  const baseDelay = BASE_RETRY_DELAY_MS * Math.pow(2, exponent);
  const cappedDelay = Math.min(MAX_RETRY_DELAY_MS, baseDelay);
  
  // Apply jitter to prevent thundering herd
  const jitterAmount = cappedDelay * Math.min(1, Math.max(0, JITTER_RATIO));
  const jitter = (Math.random() - 0.5) * 2 * jitterAmount;
  
  return Math.floor(cappedDelay + jitter);
}

/**
 * Check if a retry should proceed (not exceeding max attempts)
 */
export function shouldRetry(attemptNumber: number): boolean {
  return attemptNumber < MAX_RETRY_ATTEMPTS;
}

/**
 * Batch fetch ready retries from queue
 * Work Item #5: Efficient batch reading reduces query load
 */
export async function getReadyRetries(
  supabase: SupabaseClient,
  limit: number = 100,
  userId?: string
): Promise<RetryQueueEntry[]> {
  let query = supabase
    .from('sync_retry_queue')
    .select('user_id,platform,retry_attempt,next_attempt_at,last_http_status,last_error_message')
    .lte('next_attempt_at', new Date().toISOString())
    .order('next_attempt_at', { ascending: true })
    .limit(limit);

  if (userId) {
    query = query.eq('user_id', userId);
  }

  const { data, error } = await query;
  
  if (error) {
    console.error('[Retry Queue] Error fetching ready retries:', error);
    return [];
  }

  return (data ?? []) as RetryQueueEntry[];
}

/**
 * Batch update retry queue entries with new attempts
 * Work Item #5: Single operation instead of individual updates
 */
export async function batchUpdateRetries(
  supabase: SupabaseClient,
  updates: RetryQueueUpdateRequest[]
): Promise<{ success: number; failed: number }> {
  if (updates.length === 0) {
    return { success: 0, failed: 0 };
  }

  // Deduplicate by user_id+platform
  const deduped = new Map<string, RetryQueueUpdateRequest>();
  for (const update of updates) {
    const key = `${update.user_id}::${update.platform}`;
    deduped.set(key, update);
  }

  const uniqueUpdates = Array.from(deduped.values());
  let successCount = 0;
  let failedCount = 0;

  try {
    const upsertRows = uniqueUpdates.map(u => ({
      user_id: u.user_id,
      platform: u.platform,
      retry_attempt: u.retry_attempt,
      next_attempt_at: u.next_attempt_at,
      last_http_status: u.http_status,
      last_error_message: u.error_message,
      updated_at: new Date().toISOString(),
      metadata: u.metadata || {},
    }));

    const { error } = await supabase
      .from('sync_retry_queue')
      .upsert(upsertRows, { onConflict: 'user_id,platform' });

    if (error) {
      console.error('[Retry Queue] Batch update error:', error);
      failedCount = uniqueUpdates.length;
    } else {
      successCount = uniqueUpdates.length;
    }
  } catch (error) {
    console.error('[Retry Queue] Batch update failed:', error);
    failedCount = uniqueUpdates.length;
  }

  return { success: successCount, failed: failedCount };
}

/**
 * Batch move entries to dead letter queue when max attempts exceeded
 * Work Item #5: Efficient batch operation
 */
export async function batchMoveToDeadLetters(
  supabase: SupabaseClient,
  entries: RetryDeadLetterEntry[],
  runId: string = ''
): Promise<{ moved: number; failed: number }> {
  if (entries.length === 0) {
    return { moved: 0, failed: 0 };
  }

  let movedCount = 0;
  let failedCount = 0;

  try {
    const deadLetterRows = entries.map(e => ({
      run_id: runId || `dead-letter-batch-${Date.now()}`,
      user_id: e.user_id,
      platform: e.platform,
      retry_attempt: e.retry_attempt,
      last_http_status: e.http_status,
      error_message: e.error_message,
      failure_reason: e.failure_reason,
      created_at: new Date().toISOString(),
      metadata: {},
    }));

    const { error: insertError } = await supabase
      .from('sync_retry_dead_letters')
      .insert(deadLetterRows);

    if (insertError) {
      console.error('[Retry Queue] Dead letter insert error:', insertError);
      failedCount = entries.length;
      return { moved: 0, failed: failedCount };
    }

    // Delete from active queue
    const deleteKeys = entries.map(e => ({ user_id: e.user_id, platform: e.platform }));
    let deletedCount = 0;

    for (const { user_id, platform } of deleteKeys) {
      const { error: deleteError } = await supabase
        .from('sync_retry_queue')
        .delete()
        .eq('user_id', user_id)
        .eq('platform', platform);

      if (!deleteError) {
        deletedCount++;
      }
    }

    movedCount = deletedCount;
    failedCount = entries.length - deletedCount;
  } catch (error) {
    console.error('[Retry Queue] Move to dead letters failed:', error);
    failedCount = entries.length;
  }

  return { moved: movedCount, failed: failedCount };
}

/**
 * Batch remove entries from retry queue (successful retries)
 * Work Item #5: Efficient cleanup after successful retries
 */
export async function batchRemoveRetries(
  supabase: SupabaseClient,
  entries: Array<{ user_id: string; platform: string }>
): Promise<{ removed: number; failed: number }> {
  if (entries.length === 0) {
    return { removed: 0, failed: 0 };
  }

  let removedCount = 0;
  let failedCount = 0;

  // Batch delete by creating OR conditions
  // Since we can't do batch delete directly, we process in parallel
  const deletePromises = entries.map(({ user_id, platform }) =>
    supabase
      .from('sync_retry_queue')
      .delete()
      .eq('user_id', user_id)
      .eq('platform', platform)
  );

  const results = await Promise.allSettled(deletePromises);
  
  for (const result of results) {
    if (result.status === 'fulfilled' && !result.value.error) {
      removedCount++;
    } else {
      failedCount++;
    }
  }

  return { removed: removedCount, failed: failedCount };
}

/**
 * Get retry queue metrics for monitoring
 * Work Item #5: Observability into queue health
 */
export async function getRetryQueueMetrics(
  supabase: SupabaseClient
): Promise<{
  totalPending: number;
  byAttempt: Record<number, number>;
  oldest: string | null;
} | null> {
  try {
    const { data, error } = await supabase
      .from('sync_retry_queue')
      .select('retry_attempt,next_attempt_at');

    if (error) {
      console.error('[Retry Queue] Metrics fetch error:', error);
      return null;
    }

    const entries = (data ?? []) as Array<{ retry_attempt: number; next_attempt_at: string }>;
    const byAttempt: Record<number, number> = {};
    let oldest: string | null = null;

    for (const entry of entries) {
      byAttempt[entry.retry_attempt] = (byAttempt[entry.retry_attempt] ?? 0) + 1;
      if (!oldest || entry.next_attempt_at < oldest) {
        oldest = entry.next_attempt_at;
      }
    }

    return {
      totalPending: entries.length,
      byAttempt,
      oldest,
    };
  } catch (error) {
    console.error('[Retry Queue] Metrics calculation failed:', error);
    return null;
  }
}
