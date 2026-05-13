-- 035: Cognitive Layer Tables
-- State clusters, detected loops, and drift snapshots
-- These tables power the EYES cognitive intelligence layer:
-- "What state am I in?", "Am I in a loop?", "Where's my drift?"

-- ── State Clusters ─────────────────────────────────────────────────────────
-- Stores Claude-identified cognitive/behavioral pattern clusters per user.
-- One row per distinct cluster; is_current=true marks the active state.
CREATE TABLE IF NOT EXISTS cognitive_clusters (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cluster_id          text        NOT NULL,                  -- e.g. "pattern-1"
  cluster_label       text        NOT NULL,                  -- e.g. "Deep Work Mode"
  cluster_description text,
  characteristics     text[]      DEFAULT '{}',
  evidence_memory_ids text[]      DEFAULT '{}',
  is_current          boolean     DEFAULT false,
  days_in_cluster     integer     DEFAULT 0,
  occurrence_count    integer     DEFAULT 1,
  last_entered_at     timestamptz DEFAULT now(),
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cognitive_clusters_user
  ON cognitive_clusters(user_id);
CREATE INDEX IF NOT EXISTS idx_cognitive_clusters_current
  ON cognitive_clusters(user_id, is_current)
  WHERE is_current = true;

ALTER TABLE cognitive_clusters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cognitive_clusters_user_isolation"
  ON cognitive_clusters FOR ALL
  USING (auth.uid() = user_id);

-- ── Detected Loops ─────────────────────────────────────────────────────────
-- Recurring behavioral sequences the user has run before.
-- "This is the 4th time you've entered isolation mode after a funding setback."
CREATE TABLE IF NOT EXISTS detected_loops (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  loop_description    text        NOT NULL,
  trigger_pattern     text,                                  -- what typically kicks it off
  occurrence_count    integer     DEFAULT 0,
  avg_duration_days   numeric     DEFAULT 0,
  last_occurrence_at  timestamptz DEFAULT now(),
  evidence_memory_ids text[]      DEFAULT '{}',
  is_active           boolean     DEFAULT false,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_detected_loops_user
  ON detected_loops(user_id);
CREATE INDEX IF NOT EXISTS idx_detected_loops_active
  ON detected_loops(user_id, is_active)
  WHERE is_active = true;

ALTER TABLE detected_loops ENABLE ROW LEVEL SECURITY;
CREATE POLICY "detected_loops_user_isolation"
  ON detected_loops FOR ALL
  USING (auth.uid() = user_id);

-- ── Drift Snapshots ────────────────────────────────────────────────────────
-- Stated values (Notion, journal, emails) vs. lived behavior (calendar, output).
-- Each row = one analysis period; gaps[] = specific stated-vs-lived mismatches.
CREATE TABLE IF NOT EXISTS drift_snapshots (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_start date        NOT NULL,
  period_end   date        NOT NULL,
  gaps         jsonb       NOT NULL DEFAULT '[]',  -- array of { stated, lived, gap_summary }
  created_at   timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_drift_snapshots_user_date
  ON drift_snapshots(user_id, created_at DESC);

ALTER TABLE drift_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "drift_snapshots_user_isolation"
  ON drift_snapshots FOR ALL
  USING (auth.uid() = user_id);
