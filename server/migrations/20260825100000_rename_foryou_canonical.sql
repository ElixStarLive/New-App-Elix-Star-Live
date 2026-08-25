-- Evolve NEW schema naming: elix_foryou_* → clean NEW owners.
-- Only runs when the older NEW names still exist (already-migrated NEW Neon).
-- Empty greenfield DBs already create clean names in 20260823120000.

DO $$
BEGIN
  IF to_regclass('public.elix_foryou_config') IS NOT NULL
     AND to_regclass('public.foryou_config') IS NULL THEN
    ALTER TABLE elix_foryou_config RENAME TO foryou_config;
  END IF;

  IF to_regclass('public.elix_video_foryou_state') IS NOT NULL
     AND to_regclass('public.video_foryou_state') IS NULL THEN
    ALTER TABLE elix_video_foryou_state RENAME TO video_foryou_state;
  END IF;

  IF to_regclass('public.elix_video_not_interested') IS NOT NULL
     AND to_regclass('public.video_not_interested') IS NULL THEN
    ALTER TABLE elix_video_not_interested RENAME TO video_not_interested;
  END IF;

  IF to_regclass('public.elix_video_feed_signals') IS NOT NULL
     AND to_regclass('public.video_feed_signals') IS NULL THEN
    ALTER TABLE elix_video_feed_signals RENAME TO video_feed_signals;
  END IF;
END $$;
