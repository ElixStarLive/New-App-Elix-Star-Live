CREATE TABLE IF NOT EXISTS user_engagement (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  total_xp BIGINT NOT NULL DEFAULT 0 CHECK (total_xp >= 0),
  fan_level INTEGER NOT NULL DEFAULT 0 CHECK (fan_level >= 0),
  battle_energy BIGINT NOT NULL DEFAULT 0 CHECK (battle_energy >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
