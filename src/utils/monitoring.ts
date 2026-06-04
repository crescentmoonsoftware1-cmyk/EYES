/**
 * Monitoring and alerting utilities - Work Item #7: Monitoring & Alerting
 * Tracks queue depth, cron health, and async job failures for observability
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface QueueMetrics {
  totalPending: number;
  byAttempt: Record<number, number>;
  byPlatform: Record<string, number>;
  oldest: string | null;
  health: 'healthy' | 'warning' | 'critical';
}

export interface CronMetrics {
  runId: string;
  durationMs: number;
  processedUsers: number;
  platformRuns: number;
  platformSuccessCount: number;
  platformFailureCount: number;
  embeddingsAttempted: boolean;
  embeddingsSuccessCount: number;
  embeddingsFailureCount: number;
  retryQueueDepth: number;
  deadLetterCount24h: number;
  escalationCount: number;
  successRate: number; // 0-1
  timestamp: string;
}

export interface AsyncJobFailure {
  jobId: string;
  type: 'sync' | 'embedding' | 'escalation';
  userId: string;
  platform: string;
  error: string;
  timestamp: string;
  retriable: boolean;
}

/**
 * Get current queue depth metrics
 * Work Item #7: Queue health monitoring
 */
export async function getQueueMetrics(
  supabase: SupabaseClient
): Promise<QueueMetrics | null> {
  try {
    const { data, error } = await supabase
      .from('sync_retry_queue')
      .select('retry_attempt,platform,next_attempt_at');

    if (error) {
      console.error('[Monitoring] Queue metrics fetch error:', error);
      return null;
    }

    const entries = (data ?? []) as Array<{
      retry_attempt: number;
      platform: string;
      next_attempt_at: string;
    }>;

    const byAttempt: Record<number, number> = {};
    const byPlatform: Record<string, number> = {};
    let oldest: string | null = null;

    for (const entry of entries) {
      byAttempt[entry.retry_attempt] = (byAttempt[entry.retry_attempt] ?? 0) + 1;
      byPlatform[entry.platform] = (byPlatform[entry.platform] ?? 0) + 1;

      if (!oldest || entry.next_attempt_at < oldest) {
        oldest = entry.next_attempt_at;
      }
    }

    const totalPending = entries.length;

    // Determine health based on queue depth
    let health: QueueMetrics['health'] = 'healthy';
    if (totalPending > 50) {
      health = 'critical';
    } else if (totalPending > 20) {
      health = 'warning';
    }

    return {
      totalPending,
      byAttempt,
      byPlatform,
      oldest,
      health,
    };
  } catch (error) {
    console.error('[Monitoring] Queue metrics calculation failed:', error);
    return null;
  }
}

/**
 * Get embedding queue depth
 * Work Item #7: Embedding job monitoring
 */
export async function getEmbeddingQueueDepth(
  supabase: SupabaseClient
): Promise<{ pending: number; processing: number } | null> {
  try {
    const { data: pending, error: pendingError } = await supabase
      .from('embedding_queue')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending');

    const { data: processing, error: processingError } = await supabase
      .from('embedding_queue')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'processing');

    if (pendingError || processingError) {
      console.error('[Monitoring] Embedding queue fetch error:', pendingError || processingError);
      return null;
    }

    return {
      pending: pending?.length ?? 0,
      processing: processing?.length ?? 0,
    };
  } catch (error) {
    console.error('[Monitoring] Embedding queue calculation failed:', error);
    return null;
  }
}

/**
 * Log cron execution metrics
 * Work Item #7: Cron cycle observability
 */
export async function logCronMetrics(
  supabase: SupabaseClient,
  metrics: CronMetrics
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('cron_execution_log')
      .insert({
        run_id: metrics.runId,
        duration_ms: metrics.durationMs,
        processed_users: metrics.processedUsers,
        platform_runs: metrics.platformRuns,
        platform_success_count: metrics.platformSuccessCount,
        platform_failure_count: metrics.platformFailureCount,
        embeddings_attempted: metrics.embeddingsAttempted,
        embeddings_success_count: metrics.embeddingsSuccessCount,
        embeddings_failure_count: metrics.embeddingsFailureCount,
        retry_queue_depth: metrics.retryQueueDepth,
        dead_letter_count_24h: metrics.deadLetterCount24h,
        escalation_count: metrics.escalationCount,
        success_rate: metrics.successRate,
        created_at: metrics.timestamp,
      });

    if (error) {
      console.error('[Monitoring] Cron metrics log error:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[Monitoring] Cron metrics log failed:', message);
    return { success: false, error: message };
  }
}

/**
 * Log async job failure for recovery
 * Work Item #7: Failure tracking and recovery
 */
export async function logAsyncJobFailure(
  supabase: SupabaseClient,
  failure: AsyncJobFailure
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('async_job_failures')
      .insert({
        job_id: failure.jobId,
        job_type: failure.type,
        user_id: failure.userId,
        platform: failure.platform,
        error_message: failure.error.slice(0, 500),
        is_retriable: failure.retriable,
        created_at: failure.timestamp,
        metadata: {
          recovery_attempts: 0,
        },
      });

    if (error) {
      console.error('[Monitoring] Async job failure log error:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[Monitoring] Async job failure log failed:', message);
    return { success: false, error: message };
  }
}

/**
 * Get failed jobs available for retry
 * Work Item #7: Async job failure recovery
 */
export async function getRecoverableFailedJobs(
  supabase: SupabaseClient,
  limit: number = 50
): Promise<AsyncJobFailure[]> {
  try {
    const { data, error } = await supabase
      .from('async_job_failures')
      .select('job_id,job_type,user_id,platform,error_message,is_retriable,created_at')
      .eq('is_retriable', true)
      .eq('recovery_status', 'pending')
      .lt('recovery_attempts', 3) // Only items with < 3 recovery attempts
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error) {
      console.error('[Monitoring] Recoverable failures fetch error:', error);
      return [];
    }

    return ((data ?? []) as Array<{
      job_id: string;
      job_type: 'sync' | 'embedding' | 'escalation';
      user_id: string;
      platform: string;
      error_message: string;
      is_retriable: boolean;
      created_at: string;
    }>).map(row => ({
      jobId: row.job_id,
      type: row.job_type,
      userId: row.user_id,
      platform: row.platform,
      error: row.error_message,
      timestamp: row.created_at,
      retriable: row.is_retriable,
    }));
  } catch (error) {
    console.error('[Monitoring] Recoverable failures fetch failed:', error);
    return [];
  }
}

/**
 * Mark async job as recovered
 * Work Item #7: Failure recovery tracking
 */
export async function markJobAsRecovered(
  supabase: SupabaseClient,
  jobId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('async_job_failures')
      .update({
        recovery_status: 'succeeded',
        updated_at: new Date().toISOString(),
      })
      .eq('job_id', jobId);

    if (error) {
      console.error('[Monitoring] Mark recovered error:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[Monitoring] Mark recovered failed:', message);
    return { success: false, error: message };
  }
}

/**
 * Get health summary for dashboard
 * Work Item #7: System health observability
 */
export async function getSystemHealthSummary(
  supabase: SupabaseClient
): Promise<{
  overallHealth: 'healthy' | 'degraded' | 'critical';
  queueHealth: QueueMetrics['health'];
  embeddingQueueHealth: 'healthy' | 'warning' | 'critical';
  metrics: {
    queueDepth: number;
    embeddingPending: number;
    embeddingProcessing: number;
    recoveryableFailures: number;
  };
} | null> {
  try {
    const [queueMetrics, embeddingQueue] = await Promise.all([
      getQueueMetrics(supabase),
      getEmbeddingQueueDepth(supabase),
    ]);

    const { data: failuresData } = await supabase
      .from('async_job_failures')
      .select('id', { count: 'exact', head: true })
      .eq('is_retriable', true)
      .lt('recovery_attempts', 3);

    const recoveryableFailures = failuresData?.length ?? 0;

    // Determine overall health
    let overallHealth: 'healthy' | 'degraded' | 'critical' = 'healthy';
    const queueHealth = queueMetrics?.health ?? 'healthy';
    let embeddingQueueHealth: 'healthy' | 'warning' | 'critical' = 'healthy';

    if (embeddingQueue) {
      const totalEmbedding = embeddingQueue.pending + embeddingQueue.processing;
      if (totalEmbedding > 1000) {
        embeddingQueueHealth = 'critical';
      } else if (totalEmbedding > 500) {
        embeddingQueueHealth = 'warning';
      }
    }

    if (queueHealth === 'critical' || embeddingQueueHealth === 'critical' || recoveryableFailures > 20) {
      overallHealth = 'critical';
    } else if (queueHealth === 'warning' || embeddingQueueHealth === 'warning' || recoveryableFailures > 10) {
      overallHealth = 'degraded';
    }

    return {
      overallHealth,
      queueHealth,
      embeddingQueueHealth,
      metrics: {
        queueDepth: queueMetrics?.totalPending ?? 0,
        embeddingPending: embeddingQueue?.pending ?? 0,
        embeddingProcessing: embeddingQueue?.processing ?? 0,
        recoveryableFailures,
      },
    };
  } catch (error) {
    console.error('[Monitoring] System health summary failed:', error);
    return null;
  }
}
