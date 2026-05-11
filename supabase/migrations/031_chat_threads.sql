-- ============================================================
-- 031_chat_threads.sql
-- Chat history persistence: threads + messages per user
-- ============================================================

-- Threads table (one row per conversation)
CREATE TABLE IF NOT EXISTS chat_threads (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       TEXT        NOT NULL DEFAULT 'New Chat',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Messages table (one row per message in a thread)
CREATE TABLE IF NOT EXISTS chat_messages (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id   UUID        NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        TEXT        NOT NULL CHECK (role IN ('user', 'assistant')),
  content     TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for fast per-user/per-thread lookups
CREATE INDEX IF NOT EXISTS idx_chat_threads_user_id   ON chat_threads(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_thread   ON chat_messages(thread_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_user_id  ON chat_messages(user_id);

-- Auto-update updated_at on thread when a message is added
CREATE OR REPLACE FUNCTION update_thread_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE chat_threads SET updated_at = NOW() WHERE id = NEW.thread_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_thread_ts ON chat_messages;
CREATE TRIGGER trg_update_thread_ts
  AFTER INSERT ON chat_messages
  FOR EACH ROW EXECUTE FUNCTION update_thread_updated_at();

-- RLS: users can only see and manage their own threads/messages
ALTER TABLE chat_threads  ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chat_threads_user_policy"  ON chat_threads;
DROP POLICY IF EXISTS "chat_messages_user_policy" ON chat_messages;

CREATE POLICY "chat_threads_user_policy"
  ON chat_threads FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "chat_messages_user_policy"
  ON chat_messages FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
