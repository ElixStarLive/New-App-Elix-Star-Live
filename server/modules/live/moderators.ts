import { getPool } from "../../infra/postgres.js";
import { AppError } from "../../middleware/errors.js";

async function liveHostForRoom(roomId: string): Promise<string> {
  const { rows } = await getPool().query<{ host_id: string }>(
    `SELECT host_id FROM live_streams
     WHERE status = 'live' AND room_id = $1
     LIMIT 1`,
    [roomId],
  );
  if (!rows[0]) throw new AppError("not_found", "Live stream not found", 404);
  return rows[0].host_id;
}

export async function listLiveModerators(roomId: string): Promise<{ moderators: string[] }> {
  await liveHostForRoom(roomId);
  const { rows } = await getPool().query<{ user_id: string }>(
    `SELECT user_id FROM live_stream_moderators WHERE stream_key = $1 ORDER BY created_at ASC`,
    [roomId],
  );
  return { moderators: rows.map((row) => row.user_id) };
}

export async function addLiveModerator(
  roomId: string,
  actorId: string,
  targetUserId: string,
): Promise<{ ok: true; moderators: string[] }> {
  const hostId = await liveHostForRoom(roomId);
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
    [roomId, targetUserId, actorId],
  );
  return { ok: true, ...(await listLiveModerators(roomId)) };
}

export async function removeLiveModerator(
  roomId: string,
  actorId: string,
  targetUserId: string,
): Promise<{ ok: true; moderators: string[] }> {
  const hostId = await liveHostForRoom(roomId);
  if (hostId !== actorId) {
    throw new AppError("forbidden", "Only the stream host can remove moderators", 403);
  }
  await getPool().query(`DELETE FROM live_stream_moderators WHERE stream_key = $1 AND user_id = $2`, [
    roomId,
    targetUserId,
  ]);
  return { ok: true, ...(await listLiveModerators(roomId)) };
}
