CREATE TABLE IF NOT EXISTS user_sticker_set_completions (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  set_id TEXT NOT NULL REFERENCES sticker_sets(id),
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, set_id)
);
