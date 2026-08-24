-- PAGE-030 Inbox Requests: live shares from people the viewer does not follow.
CREATE TABLE IF NOT EXISTS live_share_inbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sharer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stream_key TEXT NOT NULL,
  host_user_id UUID NOT NULL,
  host_name TEXT NOT NULL DEFAULT '',
  host_avatar TEXT NOT NULL DEFAULT '',
  sharer_name TEXT NOT NULL DEFAULT '',
  sharer_avatar TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (recipient_id, sharer_id, stream_key)
);
CREATE INDEX IF NOT EXISTS live_share_inbox_recipient_idx
  ON live_share_inbox (recipient_id, created_at DESC);
