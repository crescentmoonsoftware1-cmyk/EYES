-- 039: privacy_excludes + alerts tables

-- ── Privacy Excludes ─────────────────────────────────────────────────────────
-- User can exclude specific email addresses, Slack channels, or Discord servers
-- from being indexed. Per §2.11 of the spec (simplified V1 version).

CREATE TABLE IF NOT EXISTS privacy_excludes (
  id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  connector_id    TEXT    NOT NULL,     -- 'gmail', 'slack', 'discord', etc.
  exclude_type    TEXT    NOT NULL      -- 'email_address', 'slack_channel', 'discord_server'
    CHECK (exclude_type IN ('email_address', 'slack_channel', 'discord_server', 'github_repo')),
  exclude_value   TEXT    NOT NULL,     -- the actual address / channel name / server id
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, connector_id, exclude_value)
);

CREATE INDEX IF NOT EXISTS idx_privacy_excludes_user
  ON privacy_excludes(user_id, connector_id);

ALTER TABLE privacy_excludes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "privacy_excludes_user_isolation"
  ON privacy_excludes FOR ALL
  USING (auth.uid() = user_id);

-- ── Alerts (Acute Layer) ─────────────────────────────────────────────────────
-- Real-time commitment/ask alerts surfaced in the chat interface.
-- Populated by Gmail/Slack webhook handlers.

CREATE TABLE IF NOT EXISTS alerts (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  alert_type          TEXT        NOT NULL DEFAULT 'commitment'
    CHECK (alert_type IN ('commitment', 'ask', 'deadline', 'loop_entry', 'drift')),
  title               TEXT        NOT NULL,   -- short headline
  body                TEXT        NOT NULL,   -- full alert message
  source_memory_id    UUID        REFERENCES memories(id) ON DELETE SET NULL,
  citation_memory_ids UUID[]      DEFAULT '{}',  -- prior commitments cross-referenced
  is_dismissed        BOOLEAN     DEFAULT false,
  dismissed_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alerts_user_undismissed
  ON alerts(user_id, created_at DESC)
  WHERE is_dismissed = false;

ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "alerts_user_isolation"
  ON alerts FOR ALL
  USING (auth.uid() = user_id);
