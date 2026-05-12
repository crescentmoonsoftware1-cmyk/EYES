-- Migration: query_behavior + audits tables
-- These tables are referenced in ai.ts (behavioral logging) and pdf-generator.ts (audit PDF export)
-- but were missing from previous migrations, causing silent runtime failures.

-- ─── query_behavior: Anonymized AI interaction logs (GDPR-safe, SHA-256 user hash) ───
CREATE TABLE IF NOT EXISTS query_behavior (
  id            BIGSERIAL PRIMARY KEY,
  user_hash     TEXT NOT NULL,           -- SHA-256(user_id + salt) — no PII
  query_text    TEXT,
  query_type    TEXT,                    -- 'chat' | 'classify' | 'embed'
  model_used    TEXT,
  latency_ms    INTEGER,
  result_count  INTEGER,
  response_length INTEGER,
  sources_used  JSONB DEFAULT '[]',
  coarse_geography TEXT DEFAULT 'unknown',
  coarse_time_bucket TEXT,              -- 'morning' | 'afternoon' | 'evening' | 'night'
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Index for analytics queries
CREATE INDEX IF NOT EXISTS query_behavior_user_hash_idx ON query_behavior (user_hash);
CREATE INDEX IF NOT EXISTS query_behavior_created_at_idx ON query_behavior (created_at DESC);
CREATE INDEX IF NOT EXISTS query_behavior_model_idx ON query_behavior (model_used);

-- RLS: No row-level user access (anonymized, ops-only)
ALTER TABLE query_behavior ENABLE ROW LEVEL SECURITY;
-- Service role only (no user-facing RLS policy needed — data is anonymized)

-- ─── audits: AI-generated neural audit records ────────────────────────────────
CREATE TABLE IF NOT EXISTS audits (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES user_profiles(user_id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'pending',   -- 'pending' | 'processing' | 'complete' | 'failed'
  summary       TEXT,
  findings      JSONB DEFAULT '[]',                -- Array of audit finding objects
  risk_score    NUMERIC(5,2),                      -- 0-100
  platform_breakdown JSONB DEFAULT '{}',
  total_memories_analyzed INTEGER DEFAULT 0,
  flagged_count  INTEGER DEFAULT 0,
  pdf_url       TEXT,                              -- Signed URL to generated PDF
  requested_at  TIMESTAMPTZ DEFAULT NOW(),
  completed_at  TIMESTAMPTZ,
  error_message TEXT,
  metadata      JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS audits_user_id_idx ON audits (user_id);
CREATE INDEX IF NOT EXISTS audits_status_idx ON audits (status);
CREATE INDEX IF NOT EXISTS audits_requested_at_idx ON audits (requested_at DESC);

-- RLS: users can only see their own audits
ALTER TABLE audits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own audits"
  ON audits FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own audits"
  ON audits FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own audits"
  ON audits FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access on audits"
  ON audits FOR ALL
  USING (TRUE)
  WITH CHECK (TRUE);
