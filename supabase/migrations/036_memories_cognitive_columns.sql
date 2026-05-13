-- 036: Add cognitive layer columns to memories
-- Required by: state vectors, drift detection, clustering exclusion

-- date_bucket: which calendar day this memory belongs to (for daily aggregation)
ALTER TABLE memories ADD COLUMN IF NOT EXISTS date_bucket DATE;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS content_type TEXT DEFAULT 'mixed'
  CHECK (content_type IN ('stated', 'lived', 'mixed'));
ALTER TABLE memories ADD COLUMN IF NOT EXISTS excluded_from_chronic BOOLEAN DEFAULT false;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS entities_extracted JSONB DEFAULT '[]';

-- Backfill date_bucket from existing timestamp
UPDATE memories
SET date_bucket = DATE(COALESCE(timestamp, updated_at))
WHERE date_bucket IS NULL;

-- Backfill content_type based on platform
UPDATE memories SET content_type = 'lived'
WHERE platform IN ('google-calendar', 'github', 'strava', 'fitbit', 'withings')
  AND content_type = 'mixed';

UPDATE memories SET content_type = 'stated'
WHERE platform IN ('notion')
  AND content_type = 'mixed';

-- Index for fast daily aggregation per user
CREATE INDEX IF NOT EXISTS idx_memories_user_date_bucket
  ON memories(user_id, date_bucket);

CREATE INDEX IF NOT EXISTS idx_memories_content_type
  ON memories(user_id, content_type);

CREATE INDEX IF NOT EXISTS idx_memories_chronic_eligible
  ON memories(user_id, date_bucket)
  WHERE excluded_from_chronic = false;
