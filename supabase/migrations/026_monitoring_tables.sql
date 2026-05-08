/**
 * Database monitoring tables - Work Item #7: Monitoring Service
 * SQL migration script to create tables for system health monitoring
 *
 * Creates cron_execution_log and async_job_failures tables
 * Enables observability and failure recovery capabilities
 */

/*
 * MIGRATION: 026_monitoring_tables.sql
 *
 * Creates monitoring tables for cron metrics and async job failure tracking
 * Supports system health monitoring and automated recovery
 */

-- ============================================================================
-- 1. CRON EXECUTION LOG TABLE
-- ============================================================================

-- Table to track cron cycle metrics and performance
CREATE TABLE IF NOT EXISTS cron_execution_log (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  run_id TEXT NOT NULL, -- Unique identifier for each cron run
  duration_ms INTEGER NOT NULL, -- Total execution time in milliseconds
  processed_users INTEGER DEFAULT 0, -- Number of users processed
  platform_runs INTEGER DEFAULT 0, -- Number of platform sync operations
  success_rate DECIMAL(5,2) DEFAULT 0.00, -- Success rate as percentage (0-100)
  total_syncs INTEGER DEFAULT 0, -- Total sync operations attempted
  successful_syncs INTEGER DEFAULT 0, -- Number of successful syncs
  failed_syncs INTEGER DEFAULT 0, -- Number of failed syncs
  retry_queue_processed INTEGER DEFAULT 0, -- Retries processed in this cycle
  embedding_queue_processed INTEGER DEFAULT 0, -- Embeddings processed in this cycle
  errors_encountered INTEGER DEFAULT 0, -- Number of errors during execution
  error_details JSONB DEFAULT '{}', -- Structured error information
  memory_usage_mb INTEGER, -- Memory usage in MB (if available)
  cpu_usage_percent DECIMAL(5,2), -- CPU usage percentage (if available)
  UNIQUE(run_id)
);

-- Indexes for cron execution log
CREATE INDEX IF NOT EXISTS idx_cron_execution_log_created_at
ON cron_execution_log(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cron_execution_log_run_id
ON cron_execution_log(run_id);

CREATE INDEX IF NOT EXISTS idx_cron_execution_log_success_rate
ON cron_execution_log(success_rate);

-- ============================================================================
-- 2. ASYNC JOB FAILURES TABLE
-- ============================================================================

-- Table to track failed async operations for recovery and monitoring
CREATE TABLE IF NOT EXISTS async_job_failures (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  job_id TEXT NOT NULL, -- Unique identifier for the failed job
  job_type TEXT NOT NULL, -- Type of job: 'sync', 'embedding', 'webhook', etc.
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  platform TEXT, -- Platform involved (if applicable)
  error_message TEXT NOT NULL, -- Error description
  error_code TEXT, -- Error code or type
  stack_trace TEXT, -- Full stack trace (if available)
  is_retriable BOOLEAN DEFAULT false, -- Whether this failure can be retried
  recovery_attempts INTEGER DEFAULT 0, -- Number of recovery attempts made
  max_recovery_attempts INTEGER DEFAULT 3, -- Maximum allowed recovery attempts
  last_recovery_attempt TIMESTAMP WITH TIME ZONE, -- When last recovery was attempted
  recovery_status TEXT DEFAULT 'pending' CHECK (recovery_status IN ('pending', 'in_progress', 'succeeded', 'failed', 'abandoned')),
  metadata JSONB DEFAULT '{}', -- Additional context about the failure
  UNIQUE(job_id)
);

-- Indexes for async job failures
CREATE INDEX IF NOT EXISTS idx_async_job_failures_created_at
ON async_job_failures(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_async_job_failures_job_id
ON async_job_failures(job_id);

CREATE INDEX IF NOT EXISTS idx_async_job_failures_user_platform
ON async_job_failures(user_id, platform);

CREATE INDEX IF NOT EXISTS idx_async_job_failures_retriable
ON async_job_failures(is_retriable, recovery_status)
WHERE is_retriable = true AND recovery_status = 'pending';

CREATE INDEX IF NOT EXISTS idx_async_job_failures_recovery_status
ON async_job_failures(recovery_status, last_recovery_attempt);

-- ============================================================================
-- 3. ROW LEVEL SECURITY POLICIES
-- ============================================================================

-- Enable RLS for cron execution log
ALTER TABLE cron_execution_log ENABLE ROW LEVEL SECURITY;

-- Service role can see all cron logs (for monitoring)
CREATE POLICY cron_execution_log_service_role
  ON cron_execution_log
  FOR ALL
  TO service_role
  USING (true);

-- Enable RLS for async job failures
ALTER TABLE async_job_failures ENABLE ROW LEVEL SECURITY;

-- Users can only see their own job failures
CREATE POLICY async_job_failures_user_isolation
  ON async_job_failures
  FOR ALL
  USING (auth.uid() = user_id);

-- Service role can see all job failures (for recovery operations)
CREATE POLICY async_job_failures_service_role
  ON async_job_failures
  FOR ALL
  TO service_role
  USING (true);

-- ============================================================================
-- 4. VALIDATION QUERIES (Run after migration)
-- ============================================================================

-- Verify tables exist
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public' AND table_name IN ('cron_execution_log', 'async_job_failures');

-- Verify indexes exist
-- SELECT indexname FROM pg_indexes
-- WHERE schemaname = 'public' AND tablename IN ('cron_execution_log', 'async_job_failures')
-- ORDER BY tablename, indexname;

-- ============================================================================
-- NOTES FOR DEPLOYMENT
-- ============================================================================

-- 1. These tables support the monitoring service utilities
-- 2. cron_execution_log tracks system performance and health
-- 3. async_job_failures enables automated failure recovery
-- 4. RLS policies ensure proper data isolation
-- 5. Indexes optimize common monitoring queries

-- ============================================================================