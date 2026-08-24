-- PAGE-055: extend the established rs_* contract. Do not invent a second table set.

ALTER TABLE rs_seasons
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS created_by TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE rs_seasons SET status = 'active' WHERE status = 'open';
UPDATE rs_seasons SET status = 'draft' WHERE status NOT IN ('draft', 'active', 'closed');
ALTER TABLE rs_seasons ALTER COLUMN status SET DEFAULT 'draft';
ALTER TABLE rs_seasons DROP CONSTRAINT IF EXISTS rs_seasons_status_check;
ALTER TABLE rs_seasons ADD CONSTRAINT rs_seasons_status_check
  CHECK (status IN ('draft', 'active', 'closed'));

CREATE TABLE IF NOT EXISTS rs_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id UUID NOT NULL REFERENCES rs_seasons(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (season_id, slug)
);

CREATE TABLE IF NOT EXISTS rs_regions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id UUID NOT NULL REFERENCES rs_seasons(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  country_codes JSONB NOT NULL DEFAULT '[]'::jsonb,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (season_id, slug)
);

ALTER TABLE rs_challenges
  ADD COLUMN IF NOT EXISTS category_id UUID,
  ADD COLUMN IF NOT EXISTS region_id UUID,
  ADD COLUMN IF NOT EXISTS week_index INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS sound_provider TEXT NOT NULL DEFAULT 'epidemic',
  ADD COLUMN IF NOT EXISTS sound_track_id TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS sound_meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS exclusive_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS leaderboard_frozen BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS live_qualifier_room_id TEXT,
  ADD COLUMN IF NOT EXISTS live_final_room_id TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

INSERT INTO rs_categories (season_id, slug, title, sort_order)
SELECT s.id, 'general', 'General', 0
FROM rs_seasons s
WHERE NOT EXISTS (
  SELECT 1 FROM rs_categories c WHERE c.season_id = s.id
);

UPDATE rs_challenges ch
SET category_id = cat.id
FROM rs_categories cat
WHERE cat.season_id = ch.season_id
  AND cat.slug = 'general'
  AND ch.category_id IS NULL;

UPDATE rs_challenges SET category_id = (
  SELECT c.id FROM rs_categories c WHERE c.season_id = rs_challenges.season_id ORDER BY c.sort_order ASC LIMIT 1
)
WHERE category_id IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM rs_challenges WHERE category_id IS NULL) THEN
    RAISE EXCEPTION 'rs_challenges.category_id backfill failed';
  END IF;
END $$;

ALTER TABLE rs_challenges ALTER COLUMN category_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'rs_challenges_category_id_fkey'
  ) THEN
    ALTER TABLE rs_challenges
      ADD CONSTRAINT rs_challenges_category_id_fkey
      FOREIGN KEY (category_id) REFERENCES rs_categories(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'rs_challenges_region_id_fkey'
  ) THEN
    ALTER TABLE rs_challenges
      ADD CONSTRAINT rs_challenges_region_id_fkey
      FOREIGN KEY (region_id) REFERENCES rs_regions(id) ON DELETE SET NULL;
  END IF;
END $$;

UPDATE rs_challenges
SET status = 'open'
WHERE status NOT IN ('scheduled', 'open', 'voting', 'qualified', 'final', 'closed');

ALTER TABLE rs_challenges DROP CONSTRAINT IF EXISTS rs_challenges_status_check;
ALTER TABLE rs_challenges ADD CONSTRAINT rs_challenges_status_check
  CHECK (status IN ('scheduled', 'open', 'voting', 'qualified', 'final', 'closed'));

CREATE INDEX IF NOT EXISTS idx_rs_challenges_season_status
  ON rs_challenges(season_id, status);
CREATE INDEX IF NOT EXISTS idx_rs_challenges_category_region
  ON rs_challenges(category_id, region_id);

CREATE TABLE IF NOT EXISTS rs_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id UUID NOT NULL REFERENCES rs_seasons(id) ON DELETE CASCADE,
  region_id UUID REFERENCES rs_regions(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  captain_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (season_id, slug)
);

CREATE TABLE IF NOT EXISTS rs_team_members (
  team_id UUID NOT NULL REFERENCES rs_teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member'
    CHECK (role IN ('member', 'captain')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (team_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_rs_team_members_user ON rs_team_members(user_id);

ALTER TABLE rs_entries
  ADD COLUMN IF NOT EXISTS team_id UUID,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

UPDATE rs_entries
SET status = 'active'
WHERE status NOT IN ('pending', 'active', 'disqualified', 'advanced', 'eliminated', 'withdrawn');

ALTER TABLE rs_entries DROP CONSTRAINT IF EXISTS rs_entries_status_check;
ALTER TABLE rs_entries ADD CONSTRAINT rs_entries_status_check
  CHECK (status IN ('pending', 'active', 'disqualified', 'advanced', 'eliminated', 'withdrawn'));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'rs_entries_team_id_fkey'
  ) THEN
    ALTER TABLE rs_entries
      ADD CONSTRAINT rs_entries_team_id_fkey
      FOREIGN KEY (team_id) REFERENCES rs_teams(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS rs_phase_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id UUID NOT NULL REFERENCES rs_challenges(id) ON DELETE CASCADE,
  phase TEXT NOT NULL CHECK (phase IN ('qualifier', 'final')),
  entry_id UUID NOT NULL REFERENCES rs_entries(id) ON DELETE CASCADE,
  rank INT NOT NULL,
  vote_count_snapshot INT NOT NULL DEFAULT 0,
  live_score_snapshot INT NOT NULL DEFAULT 0,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (challenge_id, phase, entry_id),
  UNIQUE (challenge_id, phase, rank)
);

CREATE TABLE IF NOT EXISTS rs_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id UUID NOT NULL REFERENCES rs_seasons(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  image_url TEXT,
  kind TEXT NOT NULL
    CHECK (kind IN ('participation', 'top10', 'finalist', 'winner', 'region', 'team', 'season')),
  UNIQUE (season_id, code)
);

CREATE TABLE IF NOT EXISTS rs_user_badges (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_id UUID NOT NULL REFERENCES rs_badges(id) ON DELETE CASCADE,
  challenge_id UUID REFERENCES rs_challenges(id) ON DELETE SET NULL,
  awarded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  awarded_by TEXT,
  PRIMARY KEY (user_id, badge_id)
);

CREATE INDEX IF NOT EXISTS idx_rs_user_badges_user ON rs_user_badges(user_id);

CREATE TABLE IF NOT EXISTS rs_reward_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id UUID NOT NULL REFERENCES rs_seasons(id) ON DELETE CASCADE,
  place_from INT NOT NULL DEFAULT 1,
  place_to INT NOT NULL DEFAULT 1,
  category_id UUID REFERENCES rs_categories(id) ON DELETE SET NULL,
  region_id UUID REFERENCES rs_regions(id) ON DELETE SET NULL,
  reward_kind TEXT NOT NULL
    CHECK (reward_kind IN ('badge', 'cosmetic', 'featured', 'cash_off_platform', 'creator_credit_manual', 'none')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  CHECK (place_from >= 1 AND place_to >= place_from)
);

CREATE TABLE IF NOT EXISTS rs_reward_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  definition_id UUID NOT NULL REFERENCES rs_reward_definitions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  challenge_id UUID REFERENCES rs_challenges(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'granted', 'rejected')),
  granted_by TEXT,
  granted_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (definition_id, user_id, challenge_id)
);

CREATE TABLE IF NOT EXISTS rs_admin_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rs_admin_audit_created ON rs_admin_audit(created_at DESC);
