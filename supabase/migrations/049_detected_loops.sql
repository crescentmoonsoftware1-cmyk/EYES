-- Migration 049: detected_loops table
-- Required by src/engine/phase5_organs.py (Phase 5 Behavioral Loop Mining)
-- Also required by batch_leiden.py cognitive clustering output

CREATE TABLE IF NOT EXISTS detected_loops (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  loop_description    TEXT NOT NULL,
  trigger_pattern     TEXT,
  occurrence_count    INTEGER NOT NULL DEFAULT 1,
  avg_duration_days   FLOAT,
  last_occurrence_at  TIMESTAMPTZ,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for per-user queries (phase5_organs.py reads by user_id)
CREATE INDEX IF NOT EXISTS idx_detected_loops_user_id
  ON detected_loops (user_id);

-- Index for active loops (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_detected_loops_user_active
  ON detected_loops (user_id, is_active);

-- RLS: users can only see their own loops
ALTER TABLE detected_loops ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own loops"
  ON detected_loops FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role has full access to loops"
  ON detected_loops FOR ALL
  USING (true)
  WITH CHECK (true);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_detected_loops_updated_at()
  RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_detected_loops_updated_at
  BEFORE UPDATE ON detected_loops
  FOR EACH ROW EXECUTE FUNCTION update_detected_loops_updated_at();

COMMENT ON TABLE detected_loops IS
  'Behavioral loop patterns mined from chronic_edges by phase5_organs.py. '
  'Each row represents a recurring (head, relation_label) pattern for a user.';
