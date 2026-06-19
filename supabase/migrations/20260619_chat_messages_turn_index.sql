-- Migration: Add turn_index to chat_messages for append-only persistence
-- Targets only what does NOT already exist in the schema.
--
-- Already handled by 031_chat_threads.sql:
--   ✅ chat_messages table
--   ✅ chat_threads table
--   ✅ update_thread_updated_at() function
--   ✅ trg_update_thread_ts trigger (fires on INSERT)
--
-- Already handled by 048_chat_message_sequence.sql:
--   ✅ message_order column (INT NOT NULL DEFAULT 0, but never populated)
--
-- NEW in this migration:
--   ❌ → turn_index column (correctly populated, replaces broken message_order)
--   ❌ → chat_messages_thread_turn_unique constraint (enables UPSERT idempotency)

-- 1. Add turn_index column (safe — skips if already exists)
ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS turn_index INTEGER;

-- 2. Back-fill existing rows with stable ordinals ordered by created_at
--    (0-based per thread, so turn 0 = first message, turn 1 = second, etc.)
UPDATE chat_messages cm
SET turn_index = sub.rn - 1
FROM (
  SELECT
    id,
    ROW_NUMBER() OVER (PARTITION BY thread_id ORDER BY created_at ASC) AS rn
  FROM chat_messages
  WHERE turn_index IS NULL
) sub
WHERE cm.id = sub.id;

-- 3. Add unique constraint idempotently
--    This is what makes UPSERT ON CONFLICT (thread_id, turn_index) work atomically.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chat_messages_thread_turn_unique'
  ) THEN
    ALTER TABLE chat_messages
      ADD CONSTRAINT chat_messages_thread_turn_unique
      UNIQUE (thread_id, turn_index);
  END IF;
END;
$$;
