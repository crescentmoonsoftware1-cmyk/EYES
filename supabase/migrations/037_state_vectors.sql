-- 037: state_vectors table
-- One row per user per calendar day.
-- Powers: clustering, loop detection, drift detection, forward inference.

CREATE TABLE IF NOT EXISTS state_vectors (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date                DATE        NOT NULL,

  -- Activity volume
  message_volume      INTEGER     DEFAULT 0,   -- total memories ingested that day
  output_cadence      FLOAT       DEFAULT 0,   -- ratio of outbound to total messages

  -- Cognitive texture
  sentiment_score     FLOAT       DEFAULT 0,   -- -1.0 (negative) to +1.0 (positive)
  topic_entropy       FLOAT       DEFAULT 0,   -- topic diversity (0 = mono-topic, 1 = scattered)
  query_depth         FLOAT       DEFAULT 0,   -- avg length/complexity of user queries that day

  -- Social + platform signals
  social_breadth      INTEGER     DEFAULT 0,   -- distinct people interacted with
  platform_mix        JSONB       DEFAULT '{}', -- { gmail: 0.4, slack: 0.3, notion: 0.3 }

  -- Temporal pattern
  time_of_day_bias    FLOAT       DEFAULT 0,   -- 0 = morning-heavy, 1 = night-heavy

  -- Dominant platform/theme
  dominant_platform   TEXT,
  dominant_topic      TEXT,

  -- Cluster assignment (filled after clustering cron runs)
  cluster_id          UUID        REFERENCES cognitive_clusters(id) ON DELETE SET NULL,
  cluster_version     INTEGER     DEFAULT 0,

  computed_at         TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_state_vectors_user_date
  ON state_vectors(user_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_state_vectors_cluster
  ON state_vectors(user_id, cluster_id);

ALTER TABLE state_vectors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "state_vectors_user_isolation"
  ON state_vectors FOR ALL
  USING (auth.uid() = user_id);
