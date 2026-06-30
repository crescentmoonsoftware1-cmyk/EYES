-- Migration 050: Insights unique constraint + cognitive_processed_at column
-- Fixes M-NEW-3: Without this, repeated phase5_organs runs insert duplicate insight rows
-- because each run generates a new random UUID as the primary key.
-- Adding a unique constraint on (user_id, kind) lets us upsert correctly.

-- 1. Add unique constraint on insights (user_id, kind)
--    This allows phase5_organs.py to use a deterministic ID and upsert properly.
--    If duplicates already exist, keep the most recent one (is_current = true).
DO $$
BEGIN
  -- Remove duplicate insights, keeping only the latest per (user_id, kind)
  -- (runs safely even if there are no duplicates)
  DELETE FROM insights
  WHERE id NOT IN (
    SELECT DISTINCT ON (user_id, kind) id
    FROM insights
    ORDER BY user_id, kind, created_at DESC NULLS LAST
  );
EXCEPTION WHEN OTHERS THEN
  -- If the table or column doesn't exist yet, skip gracefully
  RAISE NOTICE 'insights dedup skipped: %', SQLERRM;
END;
$$;

-- Add unique constraint if it doesn't already exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'insights_user_id_kind_key'
    AND contype = 'u'
  ) THEN
    ALTER TABLE insights ADD CONSTRAINT insights_user_id_kind_key UNIQUE (user_id, kind);
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'insights unique constraint skipped: %', SQLERRM;
END;
$$;

-- 2. Add cognitive_processed_at column to memories table
--    Used by /api/cognitive/extract to mark which memories have been through GLiNER.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'memories'
    AND column_name = 'cognitive_processed_at'
  ) THEN
    ALTER TABLE memories ADD COLUMN cognitive_processed_at TIMESTAMPTZ;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'cognitive_processed_at column skipped: %', SQLERRM;
END;
$$;

-- Index for finding unprocessed memories (used by future batch processor)
CREATE INDEX IF NOT EXISTS idx_memories_cognitive_processed_at
  ON memories (user_id, cognitive_processed_at)
  WHERE cognitive_processed_at IS NULL;

-- 3. Add source_memory_id column to chronic_edges if not present
--    Used by /api/cognitive/extract to link edges back to their source memory.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chronic_edges'
    AND column_name = 'source_memory_id'
  ) THEN
    ALTER TABLE chronic_edges ADD COLUMN source_memory_id UUID REFERENCES memories(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'source_memory_id column skipped: %', SQLERRM;
END;
$$;

COMMENT ON CONSTRAINT insights_user_id_kind_key ON insights IS
  'Ensures one active insight per (user_id, kind) so phase5_organs.py upserts correctly.';

COMMENT ON COLUMN memories.cognitive_processed_at IS
  'Timestamp when this memory was processed by the GLiNER Chronic Layer engine via /api/cognitive/extract. NULL = not yet processed.';

COMMENT ON COLUMN chronic_edges.source_memory_id IS
  'The memory record that caused this edge to be written (traceability for graph edges).';
