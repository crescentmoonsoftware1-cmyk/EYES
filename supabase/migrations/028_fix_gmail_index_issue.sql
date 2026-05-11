-- MIGRATION: Fix Gmail Sync Index Issue
-- The btree index on raw_events is too large for some rows.
-- Solution: Drop the problematic index and use a simpler one.

-- 1. Drop the problematic btree index
DROP INDEX IF EXISTS idx_raw_events_user_timestamp_desc;

-- 2. Create a smaller, more efficient index using NULLS LAST
CREATE INDEX CONCURRENTLY idx_raw_events_user_created_at 
ON raw_events(user_id, created_at DESC NULLS LAST);

-- 3. Ensure full-text search index exists for hybrid_search
CREATE INDEX IF NOT EXISTS idx_raw_events_fts 
ON raw_events USING GIN(fts);

COMMENT ON INDEX idx_raw_events_user_created_at IS 'Index for efficient user event retrieval without large column conflicts.';
