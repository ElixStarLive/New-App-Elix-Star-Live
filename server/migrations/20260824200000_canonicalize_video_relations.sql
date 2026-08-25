-- Canonicalize video relation key types and enforce canonical foreign keys.
-- This migration is data-preserving and idempotent.

DO $$
DECLARE
  invalid_count BIGINT;
BEGIN
  -- Drop existing video-related foreign keys so type canonicalization can proceed.
  IF to_regclass('public.video_likes') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'video_likes'::regclass
        AND contype = 'f'
        AND conname = 'video_likes_video_id_fkey'
    ) THEN
      ALTER TABLE video_likes DROP CONSTRAINT video_likes_video_id_fkey;
    END IF;
  END IF;

  IF to_regclass('public.video_saves') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'video_saves'::regclass
        AND contype = 'f'
        AND conname = 'video_saves_video_id_fkey'
    ) THEN
      ALTER TABLE video_saves DROP CONSTRAINT video_saves_video_id_fkey;
    END IF;
  END IF;

  IF to_regclass('public.video_views') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'video_views'::regclass
        AND contype = 'f'
        AND conname = 'video_views_video_id_fkey'
    ) THEN
      ALTER TABLE video_views DROP CONSTRAINT video_views_video_id_fkey;
    END IF;
  END IF;

  IF to_regclass('public.comments') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'comments'::regclass
        AND contype = 'f'
        AND conname = 'comments_video_id_fkey'
    ) THEN
      ALTER TABLE comments DROP CONSTRAINT comments_video_id_fkey;
    END IF;
  END IF;

  -- Canonicalize videos.id and videos.user_id to UUID.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'videos' AND column_name = 'id' AND udt_name <> 'uuid'
  ) THEN
    SELECT COUNT(*) INTO invalid_count
    FROM videos
    WHERE id IS NULL OR id::text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

    IF invalid_count > 0 THEN
      RAISE EXCEPTION 'Cannot canonicalize videos.id to UUID; invalid rows: %', invalid_count;
    END IF;

    ALTER TABLE videos ALTER COLUMN id TYPE UUID USING id::uuid;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'videos' AND column_name = 'user_id' AND udt_name <> 'uuid'
  ) THEN
    SELECT COUNT(*) INTO invalid_count
    FROM videos
    WHERE user_id IS NULL OR user_id::text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

    IF invalid_count > 0 THEN
      RAISE EXCEPTION 'Cannot canonicalize videos.user_id to UUID; invalid rows: %', invalid_count;
    END IF;

    ALTER TABLE videos ALTER COLUMN user_id TYPE UUID USING user_id::uuid;
  END IF;

  -- Canonicalize child relation columns to UUID.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'video_likes' AND column_name = 'video_id' AND udt_name <> 'uuid'
  ) THEN
    SELECT COUNT(*) INTO invalid_count
    FROM video_likes
    WHERE video_id IS NULL OR video_id::text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

    IF invalid_count > 0 THEN
      RAISE EXCEPTION 'Cannot canonicalize video_likes.video_id to UUID; invalid rows: %', invalid_count;
    END IF;

    ALTER TABLE video_likes ALTER COLUMN video_id TYPE UUID USING video_id::uuid;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'video_likes' AND column_name = 'user_id' AND udt_name <> 'uuid'
  ) THEN
    SELECT COUNT(*) INTO invalid_count
    FROM video_likes
    WHERE user_id IS NULL OR user_id::text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

    IF invalid_count > 0 THEN
      RAISE EXCEPTION 'Cannot canonicalize video_likes.user_id to UUID; invalid rows: %', invalid_count;
    END IF;

    ALTER TABLE video_likes ALTER COLUMN user_id TYPE UUID USING user_id::uuid;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'video_saves' AND column_name = 'video_id' AND udt_name <> 'uuid'
  ) THEN
    SELECT COUNT(*) INTO invalid_count
    FROM video_saves
    WHERE video_id IS NULL OR video_id::text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

    IF invalid_count > 0 THEN
      RAISE EXCEPTION 'Cannot canonicalize video_saves.video_id to UUID; invalid rows: %', invalid_count;
    END IF;

    ALTER TABLE video_saves ALTER COLUMN video_id TYPE UUID USING video_id::uuid;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'video_saves' AND column_name = 'user_id' AND udt_name <> 'uuid'
  ) THEN
    SELECT COUNT(*) INTO invalid_count
    FROM video_saves
    WHERE user_id IS NULL OR user_id::text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

    IF invalid_count > 0 THEN
      RAISE EXCEPTION 'Cannot canonicalize video_saves.user_id to UUID; invalid rows: %', invalid_count;
    END IF;

    ALTER TABLE video_saves ALTER COLUMN user_id TYPE UUID USING user_id::uuid;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'video_views' AND column_name = 'video_id' AND udt_name <> 'uuid'
  ) THEN
    SELECT COUNT(*) INTO invalid_count
    FROM video_views
    WHERE video_id IS NULL OR video_id::text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

    IF invalid_count > 0 THEN
      RAISE EXCEPTION 'Cannot canonicalize video_views.video_id to UUID; invalid rows: %', invalid_count;
    END IF;

    ALTER TABLE video_views ALTER COLUMN video_id TYPE UUID USING video_id::uuid;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'video_views' AND column_name = 'viewer_id' AND udt_name <> 'uuid'
  ) THEN
    SELECT COUNT(*) INTO invalid_count
    FROM video_views
    WHERE viewer_id IS NULL OR viewer_id::text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

    IF invalid_count > 0 THEN
      RAISE EXCEPTION 'Cannot canonicalize video_views.viewer_id to UUID; invalid rows: %', invalid_count;
    END IF;

    ALTER TABLE video_views ALTER COLUMN viewer_id TYPE UUID USING viewer_id::uuid;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'comments' AND column_name = 'video_id' AND udt_name <> 'uuid'
  ) THEN
    SELECT COUNT(*) INTO invalid_count
    FROM comments
    WHERE video_id IS NULL OR video_id::text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

    IF invalid_count > 0 THEN
      RAISE EXCEPTION 'Cannot canonicalize comments.video_id to UUID; invalid rows: %', invalid_count;
    END IF;

    ALTER TABLE comments ALTER COLUMN video_id TYPE UUID USING video_id::uuid;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'comments' AND column_name = 'user_id' AND udt_name <> 'uuid'
  ) THEN
    SELECT COUNT(*) INTO invalid_count
    FROM comments
    WHERE user_id IS NULL OR user_id::text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

    IF invalid_count > 0 THEN
      RAISE EXCEPTION 'Cannot canonicalize comments.user_id to UUID; invalid rows: %', invalid_count;
    END IF;

    ALTER TABLE comments ALTER COLUMN user_id TYPE UUID USING user_id::uuid;
  END IF;

  -- Re-add canonical FKs only after canonical UUID key types exist.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'video_likes_video_id_fkey'
      AND conrelid = 'video_likes'::regclass
  ) THEN
    ALTER TABLE video_likes
      ADD CONSTRAINT video_likes_video_id_fkey
      FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'video_saves_video_id_fkey'
      AND conrelid = 'video_saves'::regclass
  ) THEN
    ALTER TABLE video_saves
      ADD CONSTRAINT video_saves_video_id_fkey
      FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'video_views_video_id_fkey'
      AND conrelid = 'video_views'::regclass
  ) THEN
    ALTER TABLE video_views
      ADD CONSTRAINT video_views_video_id_fkey
      FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'comments_video_id_fkey'
      AND conrelid = 'comments'::regclass
  ) THEN
    ALTER TABLE comments
      ADD CONSTRAINT comments_video_id_fkey
      FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE;
  END IF;
END $$;
