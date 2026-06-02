-- EYES V1 Cognitive Layer — Database Migration
-- Run this against Supabase production to ensure all tables exist.
-- Safe to run multiple times (uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Enrich existing memories table (content_type + date_bucket + entities)
-- ═══════════════════════════════════════════════════════════════════════════

-- content_type: 'stated' (intentions), 'lived' (actions), 'mixed' (default)
ALTER TABLE memories ADD COLUMN IF NOT EXISTS content_type TEXT DEFAULT 'mixed';
ALTER TABLE memories ADD COLUMN IF NOT EXISTS date_bucket DATE;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS entities_extracted JSONB DEFAULT '[]'::jsonb;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS excluded_from_chronic BOOLEAN DEFAULT false;

-- Backfill date_bucket from timestamp for existing data
UPDATE memories SET date_bucket = DATE(timestamp) WHERE date_bucket IS NULL AND timestamp IS NOT NULL;

-- Indexes for state vector computation and drift detection
CREATE INDEX IF NOT EXISTS idx_memories_user_date ON memories(user_id, date_bucket);
CREATE INDEX IF NOT EXISTS idx_memories_content_type ON memories(user_id, content_type);

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Alerts table (Acute Layer)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  alert_type TEXT NOT NULL DEFAULT 'ask',
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  source_memory_id TEXT,
  citation_memory_ids JSONB DEFAULT '[]'::jsonb,
  is_dismissed BOOLEAN DEFAULT false,
  dismissed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alerts_user_status ON alerts(user_id, is_dismissed, created_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Entities table (Entity extraction)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  canonical_id TEXT NOT NULL,
  name TEXT NOT NULL,
  entity_type TEXT NOT NULL DEFAULT 'person',
  mention_count INT DEFAULT 0,
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, canonical_id)
);

CREATE INDEX IF NOT EXISTS idx_entities_user_type ON entities(user_id, entity_type);

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Entity Correlations table
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS entity_correlations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  entity_id UUID NOT NULL,
  cluster_id TEXT NOT NULL,
  lift_score FLOAT NOT NULL DEFAULT 1.0,
  sample_size INT DEFAULT 0,
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(entity_id, cluster_id)
);

CREATE INDEX IF NOT EXISTS idx_entity_corr_user ON entity_correlations(user_id, lift_score DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Detected Loops table
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS detected_loops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  loop_description TEXT NOT NULL,
  trigger_pattern TEXT,
  occurrence_count INT DEFAULT 0,
  avg_duration_days FLOAT DEFAULT 0,
  evidence_memory_ids JSONB DEFAULT '[]'::jsonb,
  is_active BOOLEAN DEFAULT true,
  last_occurrence_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, loop_description)
);

CREATE INDEX IF NOT EXISTS idx_loops_user ON detected_loops(user_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Drift Snapshots table
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS drift_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  gaps JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_drift_user_date ON drift_snapshots(user_id, created_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. Cognitive Clusters table (may already exist)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS cognitive_clusters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  cluster_id TEXT NOT NULL,
  cluster_label TEXT NOT NULL,
  cluster_description TEXT,
  characteristics JSONB DEFAULT '[]'::jsonb,
  evidence_memory_ids JSONB DEFAULT '[]'::jsonb,
  is_current BOOLEAN DEFAULT true,
  occurrence_count INT DEFAULT 0,
  cluster_version INT DEFAULT 1,
  umap_coords TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, cluster_id)
);

CREATE INDEX IF NOT EXISTS idx_clusters_user_status ON cognitive_clusters(user_id, is_current);

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. State Vectors table (may already exist)
-- ═══════════════════════════════════════════════════════════════════════════

-- Already exists. Just ensure cluster_id column is present.
ALTER TABLE state_vectors ADD COLUMN IF NOT EXISTS cluster_id UUID;
ALTER TABLE state_vectors ADD COLUMN IF NOT EXISTS cluster_version INT;

-- ═══════════════════════════════════════════════════════════════════════════
-- 9. RLS policies (ensure alerts are user-scoped)
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'alerts' AND policyname = 'Users can only see their own alerts'
  ) THEN
    CREATE POLICY "Users can only see their own alerts" ON alerts FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;
