CREATE TABLE IF NOT EXISTS xp_level_requirements (
  level INTEGER PRIMARY KEY CHECK (level >= 1),
  total_xp_required BIGINT NOT NULL CHECK (total_xp_required > 0),
  title TEXT,
  badge_code TEXT,
  cosmetic_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO xp_level_requirements (level, total_xp_required, title, badge_code)
SELECT
  level,
  GREATEST(1, ROUND(206.9 * POWER(level::double precision, 2.294744)))::bigint,
  CASE level
    WHEN 1 THEN 'New Supporter'
    WHEN 10 THEN 'Active Fan'
    WHEN 25 THEN 'Super Supporter'
    WHEN 50 THEN 'Elite Supporter'
    ELSE NULL
  END,
  CASE level
    WHEN 1 THEN 'new_supporter'
    WHEN 10 THEN 'active_fan'
    WHEN 25 THEN 'super_supporter'
    WHEN 50 THEN 'elite_supporter'
    ELSE NULL
  END
FROM generate_series(1, 300) AS level
ON CONFLICT (level) DO NOTHING;

UPDATE user_engagement ue
   SET fan_level = COALESCE(
         (SELECT MAX(level) FROM xp_level_requirements WHERE total_xp_required <= ue.total_xp),
         0
       ),
       updated_at = NOW();
