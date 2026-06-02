-- Migration: Add missing monitoring column
-- This fixes the "Could not find the 'dead_letter_count_24h' column" error in the cron daemon

ALTER TABLE cron_execution_log 
ADD COLUMN IF NOT EXISTS dead_letter_count_24h INT DEFAULT 0;

-- Notify PostgREST to reload the schema cache so the API immediately recognizes the new column
NOTIFY pgrst, reload schema;
