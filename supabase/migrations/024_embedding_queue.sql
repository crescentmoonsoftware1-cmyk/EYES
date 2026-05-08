-- Priority 3: Embedding Queue for Asynchronous Background Processing
-- Separates embeddings generation from sync response, allowing faster user feedback

CREATE TABLE IF NOT EXISTS embedding_queue (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  raw_event_id UUID NOT NULL REFERENCES raw_events(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  retry_count INT NOT NULL DEFAULT 0,
  error_message TEXT,
  processed_at TIMESTAMP WITH TIME ZONE
);

-- Indexes for efficient processing
CREATE INDEX IF NOT EXISTS idx_embedding_queue_status_user_id 
  ON embedding_queue(status, user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_embedding_queue_failed 
  ON embedding_queue(status, retry_count) WHERE status = 'failed';

CREATE UNIQUE INDEX IF NOT EXISTS idx_embedding_queue_active_raw_event
  ON embedding_queue(raw_event_id)
  WHERE status IN ('pending', 'processing');

-- Enable RLS
ALTER TABLE embedding_queue ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only see their own queue items
CREATE POLICY embedding_queue_user_isolation 
  ON embedding_queue 
  FOR ALL 
  USING (auth.uid() = user_id);

-- Allow service role (cron) full access
CREATE POLICY embedding_queue_service_role 
  ON embedding_queue 
  FOR ALL 
  TO service_role
  USING (true);
