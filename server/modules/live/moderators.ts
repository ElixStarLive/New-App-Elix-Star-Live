import { getPool } from "../../infra/postgres.js";
import { AppError } from "../../middleware/errors.js";

async function liveHostForKey(streamKey: string): Promise<string> {
  const { isLiveNeonSchema } = await import("../../infra/liveSchema.js");
  const { rows } = (await isLiveNeonSchema())
    ? await getPool().query<{ host_id: string; room_id: string }>(
        `SELECT user_id AS host_id, stream_key AS room_id FROM live_streams
         WHERE is_live = TRUE AND ended_at IS NULL AND (stream_key = $1 OR user_id = $1)
         LIMIT 1`,
        [streamKey],
      )
    : await getPool().query<{ host_id: string; room_id: string }>(
        `SELECT host_id, room_id FROM live_streams
     WHERE status = 'live' AND (room_id = $1 OR id::text = $1 OR host_id::text = $1)
     LIMIT 1`,
        [streamKey],
      );
  if (!rows[0]) throw new AppError("not_found", "Live stream not found", 404);
  return rows[0].host_id;
}

export async function listLiveModerators(streamKey: string): Promise<{ moderators: string[] }> {
  await liveHostForKey(streamKey);
  const { rows } = await getPool().query<{ user_id: string }>(
    `SELECT user_id FROM live_stream_moderators WHERE stream_key = $1 ORDER BY created_at ASC`,
    [streamKey],
  );
  return { moderators: rows.map((row) => row.user_id) };
}

export async function addLiveModerator(
  streamKey: string,
  actorId: string,
  targetUserId: string,
): Promise<{ ok: true; moderators: string[] }> {
  const hostId = await liveHostForKey(streamKey);
  if (hostId !== actorId) {
    throw new AppError("forbidden", "Only the stream host can assign moderators", 403);
  }
  if (targetUserId === hostId) {
    throw new AppError("validation_error", "Host is already the room owner", 400);
  }
  await getPool().query(
    `INSERT INTO live_stream_moderators (stream_key, user_id, granted_by)
     VALUES ($1, $2, $3)
     ON CONFLICT (stream_key, user_id) DO NOTHING`,
    [streamKey, targetUserId, actorId],
  );
  return { ok: true, ...(await listLiveModerators(streamKey)) };
}

export async function removeLiveModerator(
  streamKey: string,
  actorId: string,
  targetUserId: string,
): Promise<{ ok: true; moderators: string[] }> {
  const hostId = await liveHostForKey(streamKey);
  if (hostId !== actorId) {
    throw new AppError("forbidden", "Only the stream host can remove moderators", 403);
  }
  await getPool().query(`DELETE FROM live_stream_moderators WHERE stream_key = $1 AND user_id = $2`, [
    streamKey,
    targetUserId,
  ]);
  return { ok: true, ...(await listLiveModerators(streamKey)) };
}
