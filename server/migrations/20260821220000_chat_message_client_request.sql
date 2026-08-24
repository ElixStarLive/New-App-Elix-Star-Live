ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS client_request_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS chat_messages_idempotency_idx
  ON chat_messages (thread_id, sender_id, client_request_id)
  WHERE client_request_id IS NOT NULL;
