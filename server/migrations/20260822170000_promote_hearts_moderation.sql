CREATE TABLE IF NOT EXISTS promote_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('apple', 'google')),
  product_id TEXT NOT NULL,
  provider_txn_id TEXT NOT NULL,
  content_type TEXT NOT NULL CHECK (content_type IN ('video', 'profile', 'live')),
  content_id TEXT NOT NULL DEFAULT '',
  goal TEXT NOT NULL CHECK (goal IN ('views', 'likes', 'profile', 'followers')),
  amount_pence BIGINT NOT NULL CHECK (amount_pence > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, provider_txn_id)
);

CREATE INDEX IF NOT EXISTS idx_promote_purchases_user ON promote_purchases(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS daily_hearts (
  creator_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  member_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (creator_user_id, member_user_id, day)
);

CREATE INDEX IF NOT EXISTS idx_daily_hearts_creator_day ON daily_hearts(creator_user_id, day);

CREATE TABLE IF NOT EXISTS live_moderation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stream_key TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  category TEXT,
  severity TEXT,
  action_taken TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_live_moderation_log_stream ON live_moderation_log(stream_key, created_at DESC);

CREATE TABLE IF NOT EXISTS live_stream_moderators (
  stream_key TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  granted_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (stream_key, user_id)
);

ALTER TABLE sounds
  ADD COLUMN IF NOT EXISTS copyright_status TEXT NOT NULL DEFAULT 'ACTIVE';

ALTER TABLE sounds
  DROP CONSTRAINT IF EXISTS sounds_copyright_status_chk;

ALTER TABLE sounds
  ADD CONSTRAINT sounds_copyright_status_chk CHECK (copyright_status IN ('ACTIVE', 'BLOCKED'));
