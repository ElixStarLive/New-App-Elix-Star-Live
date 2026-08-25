import { getPool } from "../../infra/postgres.js";
import { AppError } from "../../middleware/errors.js";
import { expireAbandonedLives } from "./start.js";

export type LiveStatusResult = {
  room: string;
  active: boolean;
  hostUserId?: string;
};

async function blockedEitherWay(viewerId: string, hostId: string): Promise<boolean> {
  const { rows } = await getPool().query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM blocks
     WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)`,
    [viewerId, hostId],
  );
  return (rows[0]?.n ?? 0) > 0;
}

/** Authoritative live status for For You / spectator cards (room id or host user id). */
export async function queryLiveStatus(viewerId: string, roomRaw: string): Promise<LiveStatusResult> {
  const room = roomRaw.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 128);
  if (!room) {
    throw new AppError("validation_error", 'Query parameter "room" is required and must be alphanumeric.', 400);
  }

  await expireAbandonedLives();

  const { rows } = await getPool().query<{ room_id: string; host_id: string }>(
    `SELECT s.room_id, s.host_id
       FROM live_streams s
       JOIN users u ON u.id = s.host_id
      WHERE s.room_id = $1 AND s.status = 'live'
        AND u.deleted_at IS NULL
        AND (u.banned_until IS NULL OR u.banned_until < NOW())
      LIMIT 1`,
    [room],
  );

  const row = rows[0];
  if (!row) {
    return { room, active: false };
  }

  if (row.host_id !== viewerId && (await blockedEitherWay(viewerId, row.host_id))) {
    throw new AppError("forbidden", "You cannot view this stream.", 403);
  }

  return { room: row.room_id, active: true, hostUserId: row.host_id };
}
