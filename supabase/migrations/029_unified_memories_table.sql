-- ============================================================================
-- MIGRATION 029: Unified Memories Table
-- Replaces the two-table (raw_events + embeddings) design with a single
-- 'memories' table where each row holds both the content AND its vector.
-- This eliminates the JOIN on every search and the async embedding gap.
-- ============================================================================

-- Enable pgvector if not already enabled
CREATE EXTENSION IF NOT EXISTS vector;

-- Create the unified memories table
CREATE TABLE IF NOT EXISTS memories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform    TEXT NOT NULL,
  source_id   TEXT NOT NULL,           -- original ID from the platform (gmail msg id, github repo id, etc.)
  event_type  TEXT,                    -- 'email' | 'repository' | 'post' | 'message' | 'event' etc.
  title       TEXT,
  content     TEXT NOT NULL,           -- full plain text content
  author      TEXT,
  source_url  TEXT,
  timestamp   TIMESTAMPTZ,             -- when the original event occurred on the platform
  embedding   vector(768),             -- Gemini embedding-001 (768 dims) — stored inline
  metadata    JSONB DEFAULT '{}',
  is_flagged  BOOLEAN DEFAULT FALSE,
  flag_severity TEXT,
  flag_reason TEXT,
  synced_at   TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),

  -- Prevents duplicate ingestion across re-syncs
  UNIQUE (user_id, platform, source_id)
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- HNSW vector index — this is the core pgvector index for semantic search
-- m=16, ef_construction=64 is the standard production balance
CREATE INDEX IF NOT EXISTS idx_memories_embedding_hnsw
  ON memories USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Full-text search column (auto-maintained)
ALTER TABLE memories ADD COLUMN IF NOT EXISTS
  fts tsvector GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content, ''))
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_memories_fts
  ON memories USING gin(fts);

-- Lookup indexes
CREATE INDEX IF NOT EXISTS idx_memories_user_platform
  ON memories(user_id, platform);

CREATE INDEX IF NOT EXISTS idx_memories_user_timestamp
  ON memories(user_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_memories_user_synced
  ON memories(user_id, synced_at DESC);

CREATE INDEX IF NOT EXISTS idx_memories_flagged
  ON memories(user_id, is_flagged)
  WHERE is_flagged = true;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE memories ENABLE ROW LEVEL SECURITY;

CREATE POLICY memories_user_isolation
  ON memories FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY memories_service_role
  ON memories FOR ALL
  TO service_role
  USING (true);

-- ============================================================================
-- NOTES
-- ============================================================================
-- The old raw_events and embeddings tables are kept intact for now.
-- New syncs will write to 'memories' going forward.
-- A separate backfill script can migrate existing raw_events data if needed.
-- ============================================================================
