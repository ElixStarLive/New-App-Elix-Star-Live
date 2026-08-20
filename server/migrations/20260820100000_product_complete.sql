ALTER TABLE videos
  ADD COLUMN IF NOT EXISTS privacy TEXT NOT NULL DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS sound_id TEXT;

ALTER TABLE comments ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES comments(id) ON DELETE SET NULL;

ALTER TABLE stories
  ADD COLUMN IF NOT EXISTS thumbnail TEXT,
  ADD COLUMN IF NOT EXISTS media_type TEXT NOT NULL DEFAULT 'video';

ALTER TABLE coin_packages ADD COLUMN IF NOT EXISTS price_pence INTEGER NOT NULL DEFAULT 0;
UPDATE coin_packages SET price_pence = 99 WHERE coins = 100 AND price_pence = 0;
UPDATE coin_packages SET price_pence = 499 WHERE coins = 500 AND price_pence = 0;
UPDATE coin_packages SET price_pence = 999 WHERE coins = 1000 AND price_pence = 0;
UPDATE coin_packages SET price_pence = 4499 WHERE coins = 5000 AND price_pence = 0;
UPDATE coin_packages SET price_pence = 7999 WHERE coins = 10000 AND price_pence = 0;
UPDATE coin_packages SET price_pence = 34999 WHERE coins = 50000 AND price_pence = 0;
UPDATE coin_packages SET price_pence = 64999 WHERE coins = 100000 AND price_pence = 0;
UPDATE coin_packages SET price_pence = 94999 WHERE coins = 150000 AND price_pence = 0;
UPDATE coin_packages SET price_pence = 119999 WHERE coins = 200000 AND price_pence = 0;
UPDATE coin_packages SET price_pence = 199999 WHERE coins = 350000 AND price_pence = 0;

ALTER TABLE videos ADD CONSTRAINT videos_privacy_chk CHECK (privacy IN ('public', 'private'));

CREATE TABLE IF NOT EXISTS sounds (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  artist TEXT NOT NULL DEFAULT '',
  audio_url TEXT NOT NULL,
  cover_url TEXT,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  provider TEXT NOT NULL DEFAULT 'elix',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS comment_likes (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  comment_id UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, comment_id)
);

CREATE TABLE IF NOT EXISTS reposts (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('video', 'live')),
  target_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, target_type, target_id)
);

CREATE TABLE IF NOT EXISTS paid_coin_lots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_txn_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  coins_original INTEGER NOT NULL,
  coins_remaining INTEGER NOT NULL CHECK (coins_remaining >= 0),
  gross_pence BIGINT NOT NULL,
  settlement_status TEXT NOT NULL DEFAULT 'settled',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, provider_txn_id)
);

CREATE TABLE IF NOT EXISTS monetisation_config (
  id SMALLINT PRIMARY KEY DEFAULT 1,
  gift_creator_pct INTEGER NOT NULL DEFAULT 60,
  gift_platform_pct INTEGER NOT NULL DEFAULT 40,
  gift_settlement_hours INTEGER NOT NULL DEFAULT 72,
  CHECK (id = 1),
  CHECK (gift_creator_pct + gift_platform_pct = 100)
);
INSERT INTO monetisation_config (id) VALUES (1) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS creator_earnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES users(id) ON DELETE SET NULL,
  gift_txn_id UUID REFERENCES gift_transactions(id) ON DELETE SET NULL,
  coins INTEGER NOT NULL,
  amount_pence BIGINT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '72 hours',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS creator_earnings_creator_idx ON creator_earnings(creator_id, created_at DESC);

CREATE TABLE IF NOT EXISTS engagement_missions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  metric_key TEXT NOT NULL,
  goal_count INTEGER NOT NULL,
  reward_promo_coins INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS user_mission_progress (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mission_id TEXT NOT NULL REFERENCES engagement_missions(id) ON DELETE CASCADE,
  period_key TEXT NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0,
  claimed BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (user_id, mission_id, period_key)
);

CREATE TABLE IF NOT EXISTS daily_login_claims (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  claim_date DATE NOT NULL,
  streak_day INTEGER NOT NULL,
  PRIMARY KEY (user_id, claim_date)
);

CREATE TABLE IF NOT EXISTS engagement_achievements (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  metric_key TEXT NOT NULL,
  goal_count INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS user_achievements (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  achievement_id TEXT NOT NULL REFERENCES engagement_achievements(id) ON DELETE CASCADE,
  progress INTEGER NOT NULL DEFAULT 0,
  unlocked BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (user_id, achievement_id)
);

INSERT INTO engagement_missions (id, title, detail, metric_key, goal_count, reward_promo_coins) VALUES
  ('daily_watch', 'Watch 3 videos', 'Open three videos today', 'watch', 3, 5),
  ('daily_like', 'Like 5 videos', 'Like five videos today', 'like', 5, 10),
  ('daily_gift', 'Send a gift', 'Send any live gift today', 'gift', 1, 20)
ON CONFLICT DO NOTHING;

INSERT INTO engagement_achievements (id, title, detail, metric_key, goal_count) VALUES
  ('likes_50', '50 likes given', 'Like 50 videos', 'like', 50),
  ('gifts_10', '10 gifts sent', 'Send 10 gifts', 'gift', 10)
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS rs_seasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'open'
);

CREATE TABLE IF NOT EXISTS rs_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id UUID NOT NULL REFERENCES rs_seasons(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  opens_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closes_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 days'
);

CREATE TABLE IF NOT EXISTS rs_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id UUID NOT NULL REFERENCES rs_challenges(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  video_id UUID REFERENCES videos(id) ON DELETE SET NULL,
  vote_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (challenge_id, user_id)
);

CREATE TABLE IF NOT EXISTS rs_votes (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  challenge_id UUID NOT NULL REFERENCES rs_challenges(id) ON DELETE CASCADE,
  entry_id UUID NOT NULL REFERENCES rs_entries(id) ON DELETE CASCADE,
  vote_day DATE NOT NULL DEFAULT CURRENT_DATE,
  PRIMARY KEY (user_id, challenge_id, vote_day)
);

INSERT INTO rs_seasons (slug, title, starts_at, ends_at, status)
SELECT 'season-1', 'Rising Stars Season 1', NOW(), NOW() + INTERVAL '90 days', 'open'
WHERE NOT EXISTS (SELECT 1 FROM rs_seasons);

INSERT INTO rs_challenges (season_id, title)
SELECT id, 'Open challenge' FROM rs_seasons WHERE slug = 'season-1'
AND NOT EXISTS (SELECT 1 FROM rs_challenges);

CREATE TABLE IF NOT EXISTS membership_products (
  provider TEXT NOT NULL CHECK (provider IN ('apple', 'google')),
  product_id TEXT NOT NULL,
  duration_days INTEGER NOT NULL CHECK (duration_days > 0),
  PRIMARY KEY (provider, product_id)
);
INSERT INTO membership_products (provider, product_id, duration_days) VALUES
  ('apple', 'com.elixstarlive.membership', 30),
  ('google', 'com.elixstarlive.membership', 30)
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS membership_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  creator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  product_id TEXT NOT NULL,
  provider_txn_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, provider_txn_id)
);

CREATE INDEX IF NOT EXISTS videos_hashtags_gin ON videos USING GIN (hashtags);
CREATE INDEX IF NOT EXISTS videos_sound_idx ON videos(sound_id) WHERE sound_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS videos_privacy_idx ON videos(privacy) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS paid_coin_lots_user_idx ON paid_coin_lots(user_id, created_at);
