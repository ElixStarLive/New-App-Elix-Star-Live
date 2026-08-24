CREATE TABLE IF NOT EXISTS mvp_scores (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  room_id TEXT NOT NULL DEFAULT '',
  host_user_id TEXT NOT NULL DEFAULT '',
  points BIGINT NOT NULL DEFAULT 0 CHECK (points >= 0),
  source TEXT NOT NULL DEFAULT 'gift',
  day_key DATE NOT NULL DEFAULT (CURRENT_DATE),
  gift_transaction_id UUID REFERENCES gift_transactions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mvp_scores_day_points
  ON mvp_scores(day_key, points DESC);
CREATE INDEX IF NOT EXISTS idx_mvp_scores_user
  ON mvp_scores(user_id, day_key);
CREATE UNIQUE INDEX IF NOT EXISTS idx_mvp_scores_gift_txn
  ON mvp_scores(gift_transaction_id)
  WHERE gift_transaction_id IS NOT NULL;
