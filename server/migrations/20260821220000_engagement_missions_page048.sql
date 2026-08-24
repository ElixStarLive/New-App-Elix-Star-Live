ALTER TABLE engagement_missions
  ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'daily',
  ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS reward_xp INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reward_energy INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

UPDATE engagement_missions
SET description = detail
WHERE description = '' AND detail <> '';

UPDATE engagement_missions SET sort_order = 1 WHERE id = 'daily_watch';
UPDATE engagement_missions SET sort_order = 2 WHERE id = 'daily_like';
UPDATE engagement_missions SET sort_order = 3 WHERE id = 'daily_gift';
