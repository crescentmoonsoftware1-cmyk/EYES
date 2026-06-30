-- Migration 051: Ensure chronic_nodes and chronic_edges schema
-- Safe to run multiple times.

-- 1. Create chronic_nodes if not exists
CREATE TABLE IF NOT EXISTS chronic_nodes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  label       TEXT NOT NULL,
  attributes  JSONB DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, label, name)
);

CREATE INDEX IF NOT EXISTS idx_chronic_nodes_user ON chronic_nodes(user_id);
CREATE INDEX IF NOT EXISTS idx_chronic_nodes_lookup ON chronic_nodes(user_id, label, name);

-- 2. Create chronic_edges if not exists
CREATE TABLE IF NOT EXISTS chronic_edges (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  head_node_id        UUID NOT NULL REFERENCES chronic_nodes(id) ON DELETE CASCADE,
  tail_node_id        UUID NOT NULL REFERENCES chronic_nodes(id) ON DELETE CASCADE,
  relation_label      TEXT NOT NULL,
  confidence          NUMERIC NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  valid_from          TIMESTAMPTZ,
  valid_to            TIMESTAMPTZ,
  observed_from       TIMESTAMPTZ,
  observed_to         TIMESTAMPTZ,
  source_record_id    TEXT NOT NULL,
  chunk_start_char    INTEGER NOT NULL,
  chunk_end_char      INTEGER NOT NULL,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  is_contradicted_by  UUID REFERENCES chronic_edges(id) ON DELETE SET NULL,
  source_memory_id    UUID REFERENCES memories(id) ON DELETE SET NULL,
  UNIQUE(user_id, head_node_id, tail_node_id, relation_label, source_record_id, chunk_start_char)
);

CREATE INDEX IF NOT EXISTS idx_chronic_edges_user ON chronic_edges(user_id);
CREATE INDEX IF NOT EXISTS idx_chronic_edges_active ON chronic_edges(user_id, valid_to) WHERE valid_to IS NULL;
