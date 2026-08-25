-- Legacy live_streams may lack canonical columns (CREATE IF NOT EXISTS no-op).
ALTER TABLE live_streams ADD COLUMN IF NOT EXISTS host_id UUID;
ALTER TABLE live_streams ADD COLUMN IF NOT EXISTS room_id TEXT;
ALTER TABLE live_streams ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT '';
ALTER TABLE live_streams ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ended';
ALTER TABLE live_streams ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE live_streams ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'live_streams' AND column_name = 'stream_id'
  ) THEN
    EXECUTE $u$UPDATE live_streams SET room_id = COALESCE(NULLIF(room_id, ''), stream_id::text) WHERE COALESCE(room_id, '') = ''$u$;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'live_streams' AND column_name = 'user_id'
  ) THEN
    EXECUTE $u$UPDATE live_streams SET host_id = COALESCE(host_id, user_id::uuid) WHERE host_id IS NULL AND user_id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'$u$;
  END IF;
  UPDATE live_streams SET room_id = COALESCE(NULLIF(room_id, ''), host_id::text, id::text) WHERE COALESCE(room_id, '') = '';
END $$;
ALTER TABLE live_streams DROP CONSTRAINT IF EXISTS live_streams_room_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS live_streams_one_live_room
  ON live_streams (room_id)
  WHERE status = 'live';

CREATE UNIQUE INDEX IF NOT EXISTS live_streams_one_live_host
  ON live_streams (host_id)
  WHERE status = 'live';
