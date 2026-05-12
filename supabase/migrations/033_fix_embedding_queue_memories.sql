-- ============================================================================
-- MIGRATION 033: Fix embedding_queue to reference memories (not raw_events)
--
-- The old queue referenced raw_events.id which is part of the deprecated
-- two-table design. The system now uses the unified `memories` table.
-- This migration drops the old FK column and adds memory_id instead.
-- ============================================================================

-- 1. Drop the old unique index that references raw_event_id
DROP INDEX IF EXISTS idx_embedding_queue_active_raw_event;

-- 2. Drop the old FK column (raw_event_id → raw_events)
ALTER TABLE embedding_queue
  DROP COLUMN IF EXISTS raw_event_id;

-- 3. Add the new memory_id FK column (→ memories)
ALTER TABLE embedding_queue
  ADD COLUMN IF NOT EXISTS memory_id UUID REFERENCES memories(id) ON DELETE CASCADE;

-- 4. New unique index: only one pending/processing job per memory at a time
--    Prevents duplicate embedding work if sync runs overlap.
CREATE UNIQUE INDEX IF NOT EXISTS idx_embedding_queue_active_memory
  ON embedding_queue(memory_id)
  WHERE status IN ('pending', 'processing');

-- 5. Index for efficient status-based polling by the worker
CREATE INDEX IF NOT EXISTS idx_embedding_queue_status_memory
  ON embedding_queue(status, created_at)
  WHERE status = 'pending';

-- ============================================================================
-- NOTE: The cron/embeddings worker now directly scans memories WHERE
-- embedding IS NULL, which is simpler and more reliable than this queue.
-- This queue table remains available for future use (e.g. priority queuing,
-- per-user rate-limiting, or webhook-triggered re-embedding).
-- ============================================================================
