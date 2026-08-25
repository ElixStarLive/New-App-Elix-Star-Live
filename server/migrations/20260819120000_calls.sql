CREATE TABLE IF NOT EXISTS calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  caller_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  callee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  room_name TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'ringing',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  CONSTRAINT calls_status_chk CHECK (status IN ('ringing', 'active', 'ended', 'rejected')),
  CONSTRAINT calls_no_self CHECK (caller_id <> callee_id)
);
CREATE INDEX IF NOT EXISTS calls_callee_idx ON calls(callee_id, created_at DESC);
CREATE INDEX IF NOT EXISTS calls_caller_idx ON calls(caller_id, created_at DESC);
