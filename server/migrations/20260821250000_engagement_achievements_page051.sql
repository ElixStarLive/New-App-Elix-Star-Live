ALTER TABLE engagement_achievements
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS icon TEXT NOT NULL DEFAULT '🏅',
  ADD COLUMN IF NOT EXISTS reward_xp INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reward_promo_coins INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rarity TEXT NOT NULL DEFAULT 'common',
  ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE engagement_achievements
SET name = COALESCE(NULLIF(BTRIM(name), ''), NULLIF(BTRIM(title), ''), id)
WHERE name IS NULL OR BTRIM(name) = '';

ALTER TABLE engagement_achievements
  ALTER COLUMN name SET NOT NULL;

UPDATE engagement_achievements
SET description = COALESCE(NULLIF(BTRIM(description), ''), NULLIF(BTRIM(detail), ''), '')
WHERE description IS NULL;

ALTER TABLE user_achievements
  ADD COLUMN IF NOT EXISTS unlocked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS claimed BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE user_achievements
SET unlocked_at = COALESCE(unlocked_at, NOW())
WHERE unlocked = TRUE AND unlocked_at IS NULL;

UPDATE engagement_achievements
SET enabled = FALSE
WHERE id IN ('likes_50', 'gifts_10');

INSERT INTO engagement_achievements (
  id, title, detail, name, description, icon, metric_key, goal_count, reward_xp, reward_promo_coins, rarity, enabled
) VALUES
  ('first_gift', 'First Gift', 'Send your first gift', 'First Gift', 'Send your first gift', '🎁', 'gifts_sent', 1, 50, 100, 'common', TRUE),
  ('first_battle', 'First Battle', 'Join your first battle', 'First Battle', 'Join your first battle', '⚔️', 'battles_joined', 1, 50, 100, 'common', TRUE),
  ('watch_100', '100 LIVE Sessions Watched', 'Watch 100 LIVE sessions', '100 LIVE Sessions Watched', 'Watch 100 LIVE sessions', '📺', 'lives_watched', 100, 500, 1000, 'rare', TRUE),
  ('streak_7', 'Seven-Day Streak', 'Claim daily rewards 7 days in a row', 'Seven-Day Streak', 'Claim daily rewards 7 days in a row', '🔥', 'login_streak_days', 7, 300, 500, 'rare', TRUE),
  ('mvp_top10', 'Top 10 MVP', 'Reach top 10 on an MVP board', 'Top 10 MVP', 'Reach top 10 on an MVP board', '👑', 'mvp_top10', 1, 400, 750, 'epic', TRUE),
  ('energy_master', 'Battle Energy Master', 'Spend 5,000 Battle Energy', 'Battle Energy Master', 'Spend 5,000 Battle Energy', '⚡', 'energy_spent', 5000, 400, 500, 'epic', TRUE)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  detail = EXCLUDED.detail,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  metric_key = EXCLUDED.metric_key,
  goal_count = EXCLUDED.goal_count,
  reward_xp = EXCLUDED.reward_xp,
  reward_promo_coins = EXCLUDED.reward_promo_coins,
  rarity = EXCLUDED.rarity,
  enabled = TRUE;

CREATE INDEX IF NOT EXISTS idx_engagement_achievements_metric_enabled
  ON engagement_achievements (metric_key)
  WHERE enabled = TRUE;
