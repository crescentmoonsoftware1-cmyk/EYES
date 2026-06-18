-- Migration: Add message_order to chat_messages to guarantee sorting order
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS message_order INT NOT NULL DEFAULT 0;

-- Re-create index to sort by thread and order sequence
DROP INDEX IF EXISTS idx_chat_messages_thread;
CREATE INDEX IF NOT EXISTS idx_chat_messages_thread ON chat_messages(thread_id, message_order ASC);
