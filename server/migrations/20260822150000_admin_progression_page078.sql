-- PAGE-078 admin progression config/audit. Does not invent levels, missions,
-- or daily reward days. Reuses xp_level_requirements, engagement_missions,
-- daily_reward_config, user_engagement, and wallet_balances.starter_coins.

CREATE TABLE IF NOT EXISTS xp_activity_config (
  source TEXT PRIMARY KEY,
  xp_amount INTEGER NOT NULL CHECK (xp_amount >= 0),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  description TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO xp_activity_config (source, xp_amount, description) VALUES
  ('starter_gift_small', 10, 'Small gift sent with Starter Coins'),
  ('starter_gift_medium', 50, 'Medium gift sent with Starter Coins'),
  ('starter_gift_big', 200, 'Large gift sent with Starter Coins'),
  ('starter_gift_universe', 500, 'Special gift sent with Starter Coins'),
  ('paid_gift_small', 10, 'Small paid gift'),
  ('paid_gift_medium', 50, 'Medium paid gift'),
  ('paid_gift_big', 200, 'Large paid gift'),
  ('paid_gift_universe', 500, 'Special paid gift'),
  ('challenge', 100, 'Challenge participation'),
  ('daily_activity', 10, 'Eligible daily activity')
ON CONFLICT (source) DO NOTHING;

CREATE TABLE IF NOT EXISTS xp_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  xp_amount BIGINT NOT NULL CHECK (xp_amount <> 0),
  source TEXT NOT NULL,
  related_activity_type TEXT,
  related_activity_id TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  admin_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_xp_transactions_user_created
  ON xp_transactions(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS engagement_settings (
  key TEXT PRIMARY KEY,
  value_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO engagement_settings (key, value_json) VALUES
  ('feature_flags', '{}'::jsonb),
  ('feature_flags_meta', '{}'::jsonb),
  ('mission_admin_meta', '{}'::jsonb),
  (
    'daily_reward_policy',
    '{"streak_reset_policy":"miss_one_day","effective_start":null,"effective_end":null,"active":true}'::jsonb
  ),
  (
    'battle_energy_caps',
    '{"watch_amount":5,"comment_amount":2,"share_amount":20,"watch_cap":300,"comment_cap":20,"share_cap":1,"storage_cap":10000,"session_cap":500,"daily_cap":2000,"minimum_boost":1,"allowed_boost_values":[1,2,5,10],"fan_energy_threshold":10000,"score_multiplier":1.2,"boost_duration_sec":5,"enabled":true}'::jsonb
  )
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS engagement_admin_audit (
  id BIGSERIAL PRIMARY KEY,
  admin_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  target TEXT NOT NULL,
  previous_value JSONB,
  new_value JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_engagement_admin_audit_created
  ON engagement_admin_audit (created_at DESC);
