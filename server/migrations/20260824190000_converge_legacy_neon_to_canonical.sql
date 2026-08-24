-- Converge legacy production Neon shape into canonical NEW schema.
-- Data-preserving, additive migration. No destructive drops.

-- 1) Canonical users from legacy auth/profile tables.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'elix_auth_users'
  ) THEN
    INSERT INTO users (
      id,
      email,
      email_normalized,
      username,
      username_normalized,
      password_hash,
      display_name,
      bio,
      avatar_url,
      apple_sub,
      email_confirmed_at,
      is_admin,
      is_verified,
      banned_until,
      created_at,
      updated_at
    )
    SELECT
      u.id::uuid,
      COALESCE(NULLIF(u.email, ''), CONCAT('user-', u.id::text, '@invalid.local')),
      COALESCE(NULLIF(LOWER(u.email), ''), CONCAT('user-', u.id::text, '@invalid.local')),
      COALESCE(NULLIF(u.username, ''), CONCAT('user_', REPLACE(u.id::text, '-', ''))),
      COALESCE(NULLIF(LOWER(u.username), ''), CONCAT('user_', REPLACE(u.id::text, '-', ''))),
      u.password_hash,
      COALESCE(NULLIF(p.display_name, ''), NULLIF(u.display_name, ''), COALESCE(NULLIF(u.username, ''), 'user')),
      COALESCE(p.bio, ''),
      COALESCE(NULLIF(p.avatar_url, ''), NULLIF(u.avatar_url, '')),
      u.apple_sub,
      u.email_confirmed_at,
      COALESCE(p.is_admin, FALSE),
      COALESCE(p.is_verified, FALSE),
      p.banned_until,
      COALESCE(u.created_at, NOW()),
      NOW()
    FROM elix_auth_users u
    LEFT JOIN profiles p ON p.user_id = u.id
    WHERE u.id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    ON CONFLICT (id) DO UPDATE SET
      email = EXCLUDED.email,
      email_normalized = EXCLUDED.email_normalized,
      username = EXCLUDED.username,
      username_normalized = EXCLUDED.username_normalized,
      password_hash = COALESCE(EXCLUDED.password_hash, users.password_hash),
      display_name = EXCLUDED.display_name,
      bio = EXCLUDED.bio,
      avatar_url = EXCLUDED.avatar_url,
      apple_sub = COALESCE(EXCLUDED.apple_sub, users.apple_sub),
      email_confirmed_at = COALESCE(users.email_confirmed_at, EXCLUDED.email_confirmed_at),
      is_admin = EXCLUDED.is_admin,
      is_verified = EXCLUDED.is_verified,
      banned_until = EXCLUDED.banned_until,
      updated_at = NOW();
  END IF;
END $$;

-- 2) Canonical social edges.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'follows'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'follows' AND column_name = 'following_id'
  ) THEN
    ALTER TABLE follows ADD COLUMN IF NOT EXISTS followee_id UUID;
    UPDATE follows
       SET followee_id = following_id
     WHERE followee_id IS NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'elix_blocked_users'
  ) THEN
    INSERT INTO blocks (blocker_id, blocked_id, created_at)
    SELECT
      b.blocker_user_id::uuid,
      b.blocked_user_id::uuid,
      COALESCE(b.created_at, NOW())
    FROM elix_blocked_users b
    WHERE b.blocker_user_id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      AND b.blocked_user_id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    ON CONFLICT (blocker_id, blocked_id) DO NOTHING;
  END IF;
END $$;

-- 3) Canonical video columns on existing videos table.
ALTER TABLE videos ADD COLUMN IF NOT EXISTS bunny_path TEXT;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS caption TEXT DEFAULT '';
ALTER TABLE videos ADD COLUMN IF NOT EXISTS hashtags TEXT[] DEFAULT '{}';
ALTER TABLE videos ADD COLUMN IF NOT EXISTS duration_ms INTEGER DEFAULT 0;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS is_stem BOOLEAN DEFAULT FALSE;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS privacy TEXT DEFAULT 'public';
ALTER TABLE videos ADD COLUMN IF NOT EXISTS views INTEGER DEFAULT 0;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS likes INTEGER DEFAULT 0;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS comments INTEGER DEFAULT 0;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS saves INTEGER DEFAULT 0;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS shares INTEGER DEFAULT 0;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS sound_id TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'videos' AND column_name = 'url'
  ) THEN
    EXECUTE 'UPDATE videos SET bunny_path = COALESCE(NULLIF(bunny_path, ''''), NULLIF(url, '''')) WHERE COALESCE(bunny_path, '''') = ''''';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'videos' AND column_name = 'description'
  ) THEN
    EXECUTE 'UPDATE videos SET caption = COALESCE(NULLIF(caption, ''''), COALESCE(description, ''''))';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'videos' AND column_name = 'thumbnail'
  ) THEN
    EXECUTE 'UPDATE videos SET thumbnail_url = COALESCE(NULLIF(thumbnail_url, ''''), NULLIF(thumbnail, '''')) WHERE COALESCE(thumbnail_url, '''') = ''''';
  END IF;
END $$;

-- 4) Canonical live_streams columns on existing live_streams table.
ALTER TABLE live_streams ADD COLUMN IF NOT EXISTS host_id UUID;
ALTER TABLE live_streams ADD COLUMN IF NOT EXISTS room_id TEXT;
ALTER TABLE live_streams ADD COLUMN IF NOT EXISTS title TEXT DEFAULT '';
ALTER TABLE live_streams ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'ended';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'live_streams' AND column_name = 'user_id'
  ) THEN
    EXECUTE 'UPDATE live_streams
                SET host_id = COALESCE(host_id, user_id::uuid)
              WHERE host_id IS NULL
                AND user_id::text ~* ''^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$''';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'live_streams' AND column_name = 'stream_key'
  ) THEN
    EXECUTE 'UPDATE live_streams SET room_id = COALESCE(NULLIF(room_id, ''''), NULLIF(stream_key, '''')) WHERE COALESCE(room_id, '''') = ''''';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'live_streams' AND column_name = 'display_name'
  ) THEN
    EXECUTE 'UPDATE live_streams SET title = COALESCE(NULLIF(title, ''''), COALESCE(display_name, ''''))';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'live_streams' AND column_name = 'is_live'
  ) THEN
    EXECUTE 'UPDATE live_streams
                SET status = CASE
                  WHEN is_live IS TRUE AND ended_at IS NULL THEN ''live''
                  ELSE ''ended''
                END';
  END IF;

  UPDATE live_streams
     SET room_id = COALESCE(NULLIF(room_id, ''), host_id::text)
   WHERE host_id IS NOT NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS live_streams_room_id_unique_idx ON live_streams(room_id);
CREATE INDEX IF NOT EXISTS live_streams_host_started_idx ON live_streams(host_id, started_at DESC);
CREATE INDEX IF NOT EXISTS live_streams_status_idx ON live_streams(status);

-- 5) Canonical coin packages from legacy catalog.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'elix_coin_packages'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'elix_coin_packages' AND column_name = 'provider'
    ) THEN
      INSERT INTO coin_packages (product_id, provider, coins, label, active)
      SELECT
        product_id,
        provider,
        coins,
        COALESCE(NULLIF(label, ''), product_id),
        COALESCE(active, TRUE)
      FROM elix_coin_packages
      ON CONFLICT (provider, product_id) DO UPDATE SET
        coins = EXCLUDED.coins,
        label = EXCLUDED.label,
        active = EXCLUDED.active;
    ELSIF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'elix_coin_packages' AND column_name = 'platform'
    ) THEN
      INSERT INTO coin_packages (product_id, provider, coins, label, active)
      SELECT
        product_id,
        CASE WHEN LOWER(platform) = 'android' THEN 'google' ELSE 'apple' END,
        coins,
        COALESCE(NULLIF(label, ''), product_id),
        COALESCE(active, TRUE)
      FROM elix_coin_packages
      ON CONFLICT (provider, product_id) DO UPDATE SET
        coins = EXCLUDED.coins,
        label = EXCLUDED.label,
        active = EXCLUDED.active;
    ELSE
      INSERT INTO coin_packages (product_id, provider, coins, label, active)
      SELECT
        product_id,
        CASE WHEN product_id ILIKE '%a' THEN 'google' ELSE 'apple' END,
        coins,
        COALESCE(NULLIF(label, ''), product_id),
        COALESCE(active, TRUE)
      FROM elix_coin_packages
      ON CONFLICT (provider, product_id) DO UPDATE SET
        coins = EXCLUDED.coins,
        label = EXCLUDED.label,
        active = EXCLUDED.active;
    END IF;
  END IF;
END $$;

-- 6) Canonical wallet balances from legacy balances.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'elix_wallet_balances'
  ) THEN
    INSERT INTO wallet_balances (user_id, paid_coins, promo_coins, starter_coins, test_coins, updated_at)
    SELECT
      b.user_id::uuid,
      COALESCE(b.coin_balance, 0),
      COALESCE((SELECT p.balance FROM promotional_coin_balances p WHERE p.user_id = b.user_id), 0),
      COALESCE((SELECT s.balance FROM starter_coin_balances s WHERE s.user_id = b.user_id), 0),
      0,
      NOW()
    FROM elix_wallet_balances b
    WHERE b.user_id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    ON CONFLICT (user_id) DO UPDATE SET
      paid_coins = EXCLUDED.paid_coins,
      promo_coins = EXCLUDED.promo_coins,
      starter_coins = EXCLUDED.starter_coins,
      updated_at = NOW();
  END IF;
END $$;

-- 7) Ensure canonical migration marker table exists and can be used as sole migration authority.
CREATE TABLE IF NOT EXISTS elix_schema_migrations (
  id SERIAL PRIMARY KEY,
  filename TEXT NOT NULL UNIQUE,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
