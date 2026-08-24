CREATE TABLE upload_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  content_type TEXT NOT NULL,
  byte_size BIGINT NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  width INTEGER,
  height INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',
  bunny_url TEXT,
  published_id UUID,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT upload_sessions_kind_chk CHECK (kind IN ('video', 'story')),
  CONSTRAINT upload_sessions_status_chk CHECK (status IN ('pending', 'uploaded', 'published', 'failed', 'aborted')),
  CONSTRAINT upload_sessions_user_idempotency UNIQUE (user_id, idempotency_key)
);
CREATE INDEX upload_sessions_status_updated_idx ON upload_sessions (status, updated_at);
CREATE INDEX upload_sessions_user_idx ON upload_sessions (user_id, created_at DESC);
