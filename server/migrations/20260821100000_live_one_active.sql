ALTER TABLE live_streams DROP CONSTRAINT IF EXISTS live_streams_room_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS live_streams_one_live_room
  ON live_streams (room_id)
  WHERE status = 'live';

CREATE UNIQUE INDEX IF NOT EXISTS live_streams_one_live_host
  ON live_streams (host_id)
  WHERE status = 'live';
