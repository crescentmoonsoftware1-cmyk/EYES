-- ============================================================================
-- MIGRATION 030: Fix Hybrid Search for Unified Memories Table
-- Drops all old RPCs referencing vector(1536) and creates correct
-- hybrid_search against the new 'memories' table with vector(768).
-- ============================================================================

-- Drop old functions with wrong dimensions / wrong table
DROP FUNCTION IF EXISTS match_embeddings(vector(1536), float, int, uuid);
DROP FUNCTION IF EXISTS hybrid_search(text, vector(1536), int, uuid);
DROP FUNCTION IF EXISTS hybrid_search(text, vector(1536), int, uuid, timestamp, timestamp);

-- ============================================================================
-- NEW: hybrid_search against unified memories table (768 dims)
-- Combines:
--   70% weight → cosine vector similarity (semantic meaning)
--   30% weight → PostgreSQL full-text rank (exact keywords)
-- 
-- NOTE: 'timestamp' is a reserved word in PostgreSQL so we alias it as
--       event_timestamp in the RETURNS TABLE to avoid the syntax error.
-- ============================================================================
CREATE OR REPLACE FUNCTION hybrid_search(
  query_text      TEXT,
  query_embedding vector(768),
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
      (1 - (m.embedding <=> query_embedding)) > 0.35
      OR m.fts @@ websearch_to_tsquery('english', query_text)
    )
  ORDER BY combined_score DESC
  LIMIT match_count;
$$;

-- ============================================================================
-- NEW: simple vector-only search (used by MCP server)
-- ============================================================================
CREATE OR REPLACE FUNCTION match_memories(
  query_embedding vector(768),
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
