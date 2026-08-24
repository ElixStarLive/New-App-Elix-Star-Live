ALTER TABLE calls
  ADD COLUMN IF NOT EXISTS thread_id UUID REFERENCES chat_threads(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS calls_thread_idx ON calls(thread_id);
