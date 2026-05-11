-- ============================================================================
-- MIGRATION 032: Switch embedding dimension from 768 → 1024
-- Supports Voyage AI voyage-3 (primary, 1024 dims) with
-- Gemini gemini-embedding-001 fallback (also set to 1024 dims).
-- ============================================================================

-- 1. Update the memories table column dimension
ALTER TABLE memories
  ALTER COLUMN embedding TYPE vector(1024)
  USING embedding::text::vector(1024);

-- 2. Drop old HNSW index (dimension-specific)
DROP INDEX IF EXISTS memories_embedding_hnsw_idx;

-- 3. Recreate HNSW index at 1024 dims
CREATE INDEX memories_embedding_hnsw_idx
  ON memories USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- 4. Drop old search functions
DROP FUNCTION IF EXISTS hybrid_search(text, vector(768), int, uuid, timestamptz, timestamptz);
DROP FUNCTION IF EXISTS hybrid_search(text, vector(768), int, uuid);
DROP FUNCTION IF EXISTS match_memories(vector(768), float, int, uuid);

-- 5. Recreate hybrid_search at 1024 dims
CREATE OR REPLACE FUNCTION hybrid_search(
  query_text      TEXT,
  query_embedding vector(1024),
  match_count     INT,
  user_id_arg     UUID,
  start_date      TIMESTAMPTZ DEFAULT NULL,
  end_date        TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  id              UUID,
  platform        TEXT,
  source_id       TEXT,
  event_type      TEXT,
  title           TEXT,
  content         TEXT,
  author          TEXT,
  source_url      TEXT,
  event_timestamp TIMESTAMPTZ,
  metadata        JSONB,
  is_flagged      BOOLEAN,
  similarity      FLOAT,
  keyword_rank    FLOAT,
  combined_score  FLOAT
)
LANGUAGE sql
AS $$
  SELECT
    m.id,
    m.platform,
    m.source_id,
    m.event_type,
    m.title,
    m.content,
    m.author,
    m.source_url,
    m.timestamp            AS event_timestamp,
    m.metadata,
    m.is_flagged,
    (1 - (m.embedding <=> query_embedding))::FLOAT                            AS similarity,
    ts_rank_cd(m.fts, websearch_to_tsquery('english', query_text))::FLOAT     AS keyword_rank,
    (
      (1 - (m.embedding <=> query_embedding)) * 0.7
      + ts_rank_cd(m.fts, websearch_to_tsquery('english', query_text)) * 0.3
    )::FLOAT                                                                   AS combined_score
  FROM memories m
  WHERE m.user_id = user_id_arg
    AND m.embedding IS NOT NULL
    AND (start_date IS NULL OR m.timestamp >= start_date)
    AND (end_date   IS NULL OR m.timestamp <= end_date)
    AND (
      (1 - (m.embedding <=> query_embedding)) > 0.15
      OR m.fts @@ websearch_to_tsquery('english', query_text)
    )
  ORDER BY combined_score DESC
  LIMIT match_count;
$$;

-- 6. Recreate match_memories at 1024 dims
CREATE OR REPLACE FUNCTION match_memories(
  query_embedding vector(1024),
  match_threshold FLOAT,
  match_count     INT,
  user_id_arg     UUID
)
RETURNS TABLE (
  id              UUID,
  platform        TEXT,
  title           TEXT,
  content         TEXT,
  event_timestamp TIMESTAMPTZ,
  similarity      FLOAT
)
LANGUAGE sql
AS $$
  SELECT
    m.id,
    m.platform,
    m.title,
    m.content,
    m.timestamp  AS event_timestamp,
    (1 - (m.embedding <=> query_embedding))::FLOAT AS similarity
  FROM memories m
  WHERE m.user_id = user_id_arg
    AND m.embedding IS NOT NULL
    AND (1 - (m.embedding <=> query_embedding)) > match_threshold
  ORDER BY similarity DESC
  LIMIT match_count;
$$;

-- Grant execution
GRANT EXECUTE ON FUNCTION hybrid_search TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION match_memories TO authenticated, service_role;

-- 7. Clear all existing embeddings (they were 768-dim, now incompatible)
-- They will be re-embedded automatically by the next embeddings cron run
UPDATE memories SET embedding = NULL WHERE embedding IS NOT NULL;
