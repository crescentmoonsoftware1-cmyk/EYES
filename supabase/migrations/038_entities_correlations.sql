-- 038: entities + entity_correlations tables
-- entities: canonical people/orgs/tools extracted from memories
-- entity_correlations: which entities co-occur with which cognitive clusters

CREATE TABLE IF NOT EXISTS entities (
  id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  canonical_id    TEXT    NOT NULL,          -- stable ID e.g. "person_abc123"
  name            TEXT    NOT NULL,          -- "Valentin Henry"
  entity_type     TEXT    NOT NULL           -- 'person', 'organization', 'tool', 'place'
    CHECK (entity_type IN ('person', 'organization', 'tool', 'place', 'other')),
  mention_count   INTEGER DEFAULT 1,
  first_seen_at   TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, canonical_id)
);

CREATE INDEX IF NOT EXISTS idx_entities_user
  ON entities(user_id);
CREATE INDEX IF NOT EXISTS idx_entities_type
  ON entities(user_id, entity_type);

ALTER TABLE entities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "entities_user_isolation"
  ON entities FOR ALL
  USING (auth.uid() = user_id);

-- ── Entity ↔ Cluster correlations ──────────────────────────────────────────
-- "Conversations with Valentin correlate +0.78 with expansion-mode"

CREATE TABLE IF NOT EXISTS entity_correlations (
  id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_id       UUID    NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  cluster_id      UUID    NOT NULL REFERENCES cognitive_clusters(id) ON DELETE CASCADE,
  lift_score      FLOAT   NOT NULL,   -- positive = co-occurs above base rate
  sample_size     INTEGER DEFAULT 0,  -- number of days used to compute
  computed_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(entity_id, cluster_id)
);

CREATE INDEX IF NOT EXISTS idx_entity_correlations_user
  ON entity_correlations(user_id, lift_score DESC);

ALTER TABLE entity_correlations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "entity_correlations_user_isolation"
  ON entity_correlations FOR ALL
  USING (auth.uid() = user_id);
