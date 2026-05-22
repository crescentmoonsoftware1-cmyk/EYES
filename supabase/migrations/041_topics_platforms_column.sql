-- ============================================================
-- 041_topics_platforms_column.sql
-- L5 fix: add platforms[] column to topics table
-- Previously, topic clusters lost their platforms list on every
-- cache read because the column did not exist in the schema.
-- ============================================================

-- Add platforms column (jsonb array of platform strings)
ALTER TABLE topics
  ADD COLUMN IF NOT EXISTS platforms JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Backfill existing rows with empty array (safe default)
UPDATE topics
SET platforms = '[]'::jsonb
WHERE platforms IS NULL;

-- Index for querying by platform membership (future use)
CREATE INDEX IF NOT EXISTS idx_topics_user_platforms
  ON topics USING GIN (platforms)
  WHERE platforms != '[]'::jsonb;

-- Comment for documentation
COMMENT ON COLUMN topics.platforms IS
  'Array of platform strings that contributed to this cluster (e.g. ["github","gmail"]). '
  'Populated by the topic-clusters API during cache write.';
