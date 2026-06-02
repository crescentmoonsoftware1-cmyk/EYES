-- 042: Materialized Views for Cognitive Search & Dashboards
-- These materialized views replace expensive runtime queries to aggregate data
-- across 100k+ rows, ensuring instant dashboard loads.

-- 1. Memory Density Over Time (Materialized View)
-- Aggregates the number of memories per platform per day.
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_memory_density_daily AS
SELECT
  user_id,
  platform,
  date_trunc('day', timestamp) AS day,
  COUNT(id) AS memory_count,
  COUNT(id) FILTER (WHERE is_flagged = true) AS flagged_count
FROM
  memories
WHERE
  timestamp IS NOT NULL
GROUP BY
  user_id, platform, date_trunc('day', timestamp);

-- Index for fast lookup by user and date
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_memory_density_daily_unique 
ON mv_memory_density_daily (user_id, platform, day);

CREATE INDEX IF NOT EXISTS idx_mv_memory_density_daily_user 
ON mv_memory_density_daily (user_id);


-- 2. Frequent Search Terms / Entities (Materialized View)
-- Extracts top keywords per user from their memories content using PostgreSQL's tsvector
-- We aggregate lexemes directly for production safety in Supabase.

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_frequent_terms AS
WITH user_lexemes AS (
  SELECT 
    user_id,
    unnest(tsvector_to_array(to_tsvector('english', COALESCE(title, '') || ' ' || COALESCE(content, '')))) as term
  FROM memories
  WHERE timestamp > NOW() - INTERVAL '90 days'
)
SELECT 
  user_id,
  term,
  COUNT(*) as frequency
FROM user_lexemes
WHERE length(term) >= 4 AND term ~ '^[a-z]+$'
GROUP BY user_id, term
HAVING COUNT(*) > 2;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_frequent_terms_unique 
ON mv_frequent_terms (user_id, term);

CREATE INDEX IF NOT EXISTS idx_mv_frequent_terms_freq 
ON mv_frequent_terms (user_id, frequency DESC);


-- 3. Function to Refresh Materialized Views
-- This can be called by a Supabase pg_cron job or a Next.js cron API route
CREATE OR REPLACE FUNCTION refresh_cognitive_materialized_views()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- CONCURRENTLY requires a unique index on the materialized view
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_memory_density_daily;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_frequent_terms;
END;
$$;

-- Note: Materialized Views cannot use standard RLS policies directly.
-- Access to these views via API should be wrapped in an RLS-enforced function or 
-- the backend API (Next.js route) should explicitly filter by user_id = auth.uid() when querying.
