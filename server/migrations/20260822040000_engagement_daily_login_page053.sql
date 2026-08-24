CREATE TABLE IF NOT EXISTS daily_reward_config (
  streak_day INTEGER PRIMARY KEY CHECK (streak_day BETWEEN 1 AND 7),
  reward_xp INTEGER NOT NULL DEFAULT 0 CHECK (reward_xp >= 0),
  reward_promo_coins INTEGER NOT NULL DEFAULT 0 CHECK (reward_promo_coins >= 0),
  reward_label TEXT NOT NULL CHECK (btrim(reward_label) <> '')
);

INSERT INTO daily_reward_config (streak_day, reward_xp, reward_promo_coins, reward_label) VALUES
  (1, 100, 0, '100 XP'),
  (2, 200, 0, '200 XP'),
  (3, 0, 0, 'Gift coupon'),
  (4, 0, 500, '500 Promotional Coins'),
  (5, 0, 0, 'Temporary profile frame'),
  (6, 1000, 0, '1,000 XP'),
  (7, 500, 1000, 'Mystery reward')
ON CONFLICT (streak_day) DO NOTHING;

ALTER TABLE daily_login_claims
  ADD COLUMN IF NOT EXISTS reward_xp INTEGER NOT NULL DEFAULT 0 CHECK (reward_xp >= 0),
  ADD COLUMN IF NOT EXISTS reward_promo_coins INTEGER NOT NULL DEFAULT 0 CHECK (reward_promo_coins >= 0),
  ADD COLUMN IF NOT EXISTS reward_label TEXT NOT NULL DEFAULT '';
