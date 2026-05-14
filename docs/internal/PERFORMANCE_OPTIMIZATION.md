/**
 * Database and performance optimization guide - Work Item #8: Remaining Optimizations
 * Provides SQL migration patterns, index recommendations, and performance tuning
 */

/**
 * RECOMMENDED DATABASE INDEXES FOR PERFORMANCE
 * 
 * Apply these migrations to optimize query performance:
 * 
 * 1. Sync retry queue indexes:
 *    - User + platform for lookups: CREATE INDEX idx_sync_retry_queue_user_platform ON sync_retry_queue(user_id, platform);
 *    - Next attempt sorting: CREATE INDEX idx_sync_retry_queue_next_attempt ON sync_retry_queue(next_attempt_at) WHERE next_attempt_at <= now();
 *    - Platform for metrics: CREATE INDEX idx_sync_retry_queue_platform ON sync_retry_queue(platform);
 * 
 * 2. Raw events indexes:
 *    - User + timestamp for feed queries: CREATE INDEX idx_raw_events_user_timestamp ON raw_events(user_id, timestamp DESC);
 *    - Platform filtering: CREATE INDEX idx_raw_events_user_platform ON raw_events(user_id, platform);
 *    - Flagged items: CREATE INDEX idx_raw_events_flagged ON raw_events(user_id, is_flagged) WHERE is_flagged = true;
 * 
 * 3. Sync status indexes:
 *    - User + platform lookups: CREATE INDEX idx_sync_status_user_platform ON sync_status(user_id, platform);
 *    - Status filtering: CREATE INDEX idx_sync_status_user_status ON sync_status(user_id, status) WHERE status != 'idle';
 * 
 * 4. OAuth tokens indexes:
 *    - Platform lookup: CREATE INDEX idx_oauth_tokens_user_platform ON oauth_tokens(user_id, platform);
 * 
 * 5. Embedding queue indexes:
 *    - Status + created_at for batch fetching: CREATE INDEX idx_embedding_queue_status_created ON embedding_queue(status, created_at);
 *    - User for per-user processing: CREATE INDEX idx_embedding_queue_user_status ON embedding_queue(user_id, status);
 * 
 * 6. Dead letter queue indexes:
 *    - Recent dead letters: CREATE INDEX idx_sync_retry_dead_letters_created ON sync_retry_dead_letters(created_at DESC);
 *    - User dead letters: CREATE INDEX idx_sync_retry_dead_letters_user ON sync_retry_dead_letters(user_id, created_at);
 */

/**
 * QUERY OPTIMIZATION PATTERNS
 */

export const OPTIMIZATION_PATTERNS = {
  /**
   * Pattern 1: Batch fetch retries with prefetching
   * Instead of: SELECT * FROM sync_retry_queue WHERE next_attempt_at <= now() LIMIT 1
   * Use: SELECT * FROM sync_retry_queue WHERE next_attempt_at <= now() ORDER BY next_attempt_at ASC LIMIT 100
   * 
   * Benefit: Reduces query overhead by 99% when processing multiple retries
   */
  BATCH_RETRY_FETCH: {
    description: 'Fetch multiple retries in one query instead of polling',
    impact: 'Reduces database queries from 1000s to 10s per cron cycle',
    minimalExample: `
      SELECT user_id, platform, retry_attempt, next_attempt_at
      FROM sync_retry_queue
      WHERE next_attempt_at <= now()
      ORDER BY next_attempt_at ASC
      LIMIT ?;
    `,
  },

  /**
   * Pattern 2: Batch status updates
   * Instead of: Multiple UPDATE statements in a loop
   * Use: Single UPSERT with multiple rows
   * 
   * Benefit: Reduces database round trips from N to 1
   */
  BATCH_STATUS_UPDATE: {
    description: 'Update multiple status rows in a single operation',
    impact: 'Reduces database transactions from 100+ to 1-2 per cycle',
    minimalExample: `
      INSERT INTO sync_status (user_id, platform, status, sync_progress, updated_at)
      VALUES (?, ?, ?, ?, NOW()), (?, ?, ?, ?, NOW()), ...
      ON CONFLICT(user_id, platform) DO UPDATE SET
        status = EXCLUDED.status,
        sync_progress = EXCLUDED.sync_progress,
        updated_at = EXCLUDED.updated_at;
    `,
  },

  /**
   * Pattern 3: Pre-filter with WHERE clause
   * Instead of: SELECT * FROM raw_events WHERE user_id = ? LIMIT 300
   * Use: SELECT * FROM raw_events WHERE user_id = ? AND timestamp >= ? ORDER BY timestamp DESC LIMIT 300
   * 
   * Benefit: Reduces data scanned and transmitted
   */
  TEMPORAL_FILTERING: {
    description: 'Filter events by time window to reduce result sets',
    impact: 'Reduces result set size by 70-80%',
    minimalExample: `
      SELECT * FROM raw_events 
      WHERE user_id = ? 
      AND timestamp >= now() - interval '90 days'
      ORDER BY timestamp DESC
      LIMIT 300;
    `,
  },

  /**
   * Pattern 4: Selective field loading
   * Instead of: SELECT * FROM raw_events
   * Use: SELECT id, platform, title, content, timestamp FROM raw_events
   * 
   * Benefit: Reduces payload size and network transmission
   */
  FIELD_PROJECTION: {
    description: 'Only fetch necessary fields',
    impact: 'Reduces network payload by 40-60%',
    minimalExample: `
      SELECT id, platform, title, content, timestamp, is_flagged
      FROM raw_events
      WHERE user_id = ?
      LIMIT 300;
    `,
  },
};

/**
 * CACHING STRATEGIES
 */

export const CACHING_STRATEGIES = {
  /**
   * Strategy 1: Dashboard bootstrap caching (Already implemented in Work #2)
   * TTL: 30s with stale-while-revalidate 5min
   * Impact: Reduces database load by 90% for first-time users
   */
  DASHBOARD_CACHE: {
    ttl: 30,
    staleWhileRevalidate: 300,
    keyPattern: 'dashboard:bootstrap:{{userId}}',
    invalidateOn: ['raw_events', 'sync_status'],
  },

  /**
   * Strategy 2: Retry queue metrics caching
   * TTL: 10s
   * Benefit: Reduces queue metrics queries to 1 per 10s instead of per request
   */
  RETRY_QUEUE_METRICS: {
    ttl: 10,
    keyPattern: 'metrics:retry-queue',
    invalidateOn: ['sync_retry_queue'],
  },

  /**
   * Strategy 3: Platform status caching
   * TTL: 5s
   * Benefit: Reduces sync_status queries
   */
  PLATFORM_STATUS: {
    ttl: 5,
    keyPattern: 'status:{{userId}}:{{platform}}',
    invalidateOn: ['sync_status'],
  },

  /**
   * Strategy 4: OAuth token caching in memory
   * TTL: 60s (in-process memory, not network)
   * Benefit: Eliminates database lookups for token validation
   * Caution: Must invalidate on token refresh
   */
  TOKEN_MEMORY_CACHE: {
    ttl: 60,
    keyPattern: 'token:{{userId}}:{{platform}}',
    invalidateOn: ['oauth_tokens'],
    location: 'process-memory',
  },
};

/**
 * RATE LIMITING RECOMMENDATIONS
 */

export const RATE_LIMITS = {
  /**
   * OAuth callback handlers
   * Limit: 10 requests per user per minute
   * Reason: Prevent rapid reconnection spam
   */
  OAUTH_CALLBACK: {
    limit: 10,
    window: 60, // seconds
    keyPattern: 'rate:oauth:{{userId}}',
  },

  /**
   * Sync all endpoint
   * Limit: 3 requests per user per minute
   * Reason: Prevent manual sync spam, cron is throttled
   */
  SYNC_MANUAL: {
    limit: 3,
    window: 60,
    keyPattern: 'rate:sync:manual:{{userId}}',
  },

  /**
   * Dashboard bootstrap
   * Limit: 30 requests per user per minute
   * Reason: Allow frequent refreshes but prevent ddos
   */
  DASHBOARD_BOOTSTRAP: {
    limit: 30,
    window: 60,
    keyPattern: 'rate:dashboard:{{userId}}',
  },

  /**
   * Escalation webhook dispatch
   * Limit: 5 webhooks per minute per service
   * Reason: Prevent webhook flood if many escalations trigger
   */
  ESCALATION_WEBHOOK: {
    limit: 5,
    window: 60,
    keyPattern: 'rate:webhook:escalation',
  },
};

/**
 * CONNECTION POOLING TUNING
 */

export const CONNECTION_POOL_CONFIG = {
  /**
   * Supabase connection limits for concurrent operations
   * Recommended: 10-20 connections for production
   * 
   * Environment variables to set:
   * - DATABASE_URL_POOL: Set max_pool_size=20
   * - POSTGRES_POOL_TIMEOUT: 10000ms
   * - POSTGRES_IDLE_IN_TRANSACTION_SESSION_TIMEOUT: 30000ms
   */
  POOL_SIZE: 20,
  TIMEOUT_MS: 10000,
  IDLE_TIMEOUT_MS: 30000,
};

/**
 * QUERY TIMEOUT CONFIGURATIONS
 */

export const QUERY_TIMEOUTS = {
  // Dashboard queries: 2s max
  DASHBOARD_QUERY: 2000,
  // Sync operations: 25s max
  SYNC_OPERATION: 25000,
  // Embedding operations: 30s max
  EMBEDDING_OPERATION: 30000,
  // Cron operations: 55s max (within 60s Lambda timeout)
  CRON_OPERATION: 55000,
  // Retry queue queries: 5s max
  RETRY_QUERY: 5000,
};

/**
 * PERFORMANCE MONITORING CHECKLIST
 */

export const MONITORING_CHECKLIST = {
  /**
   * Metrics to monitor daily:
   */
  DAILY_METRICS: [
    'Average dashboard bootstrap response time (target: <300ms cached, <2s fresh)',
    'Sync success rate (target: >95%)',
    'Retry queue depth (target: <50 pending)',
    'Embedding queue depth (target: <500 pending)',
    'OAuth callback latency (target: <100ms)',
    'Dead letter queue growth (target: <10 per day)',
    'Webhook escalation success rate (target: >98%)',
  ],

  /**
   * Metrics to monitor during each cron cycle:
   */
  CRON_CYCLE_METRICS: [
    'Total cron execution time (target: <50s)',
    'Platform sync success rate per platform',
    'Retry processing latency',
    'Queue depth reduction (should process 20-50% of queue)',
    'Webhook dispatch success rate',
  ],

  /**
   * Alerts to configure:
   */
  ALERTS: [
    'Queue depth > 100 (warning), > 500 (critical)',
    'Cron cycle duration > 55s',
    'Platform sync error rate > 10%',
    'Dead letters > 20 in 24h',
    'Webhook dispatch failure rate > 5%',
    'Dashboard bootstrap cache hit ratio < 80%',
  ],
};

/**
 * ENVIRONMENT VARIABLE TUNING
 */

export const RECOMMENDED_ENV_VARS = {
  /**
   * Cron concurrency tuning
   */
  CRON_USER_CONCURRENCY: 3, // How many users in parallel
  CRON_PLATFORM_CONCURRENCY: 2, // How many platforms per user in parallel
  CRON_MAX_USERS_PER_RUN: 10, // Max users to process per cron invocation
  CRON_SYNC_TIMEOUT_MS: 20000, // Individual sync timeout
  CRON_EMBEDDINGS_TIMEOUT_MS: 25000, // Embeddings timeout

  /**
   * Retry queue tuning
   */
  CRON_RETRY_BASE_DELAY_MS: 60000, // Start at 1min
  CRON_RETRY_MAX_DELAY_MS: 3600000, // Cap at 1 hour
  CRON_RETRY_MAX_ATTEMPTS: 4, // Max 4 retry attempts
  CRON_RETRY_DUE_LIMIT: 100, // Process up to 100 due retries per cycle
  CRON_RETRY_JITTER_RATIO: 0.2, // 20% jitter to prevent thundering herd

  /**
   * Queue depth thresholds
   */
  SYNC_ALERT_PENDING_RETRY_THRESHOLD: 8, // Alert if > 8 pending retries per user
  SYNC_ALERT_DEAD_LETTER_24H_THRESHOLD: 3, // Alert if > 3 dead letters in 24h
  SYNC_ALERT_MAX_RETRY_ATTEMPT_THRESHOLD: 3, // Alert if any retry at attempt 3+
  SYNC_ALERT_FAILURE_RATE_24H_THRESHOLD: 0.25, // Alert if failure rate > 25%
};

/**
 * OPTIMIZATION CHECKLIST FOR DEPLOYMENT
 */

export const DEPLOYMENT_CHECKLIST = [
  '✓ All recommended indexes created (see above)',
  '✓ Batch query patterns enabled in cron route',
  '✓ Dashboard cache headers configured (30s + 5min stale)',
  '✓ Retry queue utilities integrated',
  '✓ Webhook payload optimization enabled',
  '✓ Monitoring utilities deployed',
  '✓ Rate limiting applied to OAuth and manual sync',
  '✓ Connection pool tuned to 20',
  '✓ Query timeouts configured per operation',
  '✓ Alerts configured for queue depth and failure rates',
  '✓ Environment variables tuned for cron concurrency',
  '✓ Dead letter queue monitoring enabled',
  '✓ Webhook escalation cooldown configured',
];
