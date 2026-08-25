import { randomBytes } from "node:crypto";
import { getPool } from "../../infra/postgres.js";
import { AppError } from "../../middleware/errors.js";
import { createLivekitToken, isLivekitConfigured } from "../../infra/livekit.js";
import { isSeatedCohost } from "../cohost/runtime.js";
import { expireAbandonedLives } from "./start.js";
import type { LiveTokenResponse } from "../../../shared/contracts/live.js";

export function spectatorIdentity(userId: string): string {
  return `${userId}__v_${randomBytes(6).toString("hex")}`;
}

type StreamRow = {
  id: string;
  host_id: string;
  status: string;
  room_id: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
  banned_until: Date | null;
  deleted_at: Date | null;
};

async function loadLiveByRoom(roomId: string): Promise<StreamRow | null> {
  const { rows } = await getPool().query<StreamRow>(
    `SELECT s.id, s.host_id, s.status, s.room_id, u.display_name, u.username, u.avatar_url,
            u.banned_until, u.deleted_at
     FROM live_streams s
     JOIN users u ON u.id = s.host_id
     WHERE s.room_id = $1 AND s.status = 'live'
     LIMIT 1`,
    [roomId],
  );
  return rows[0] ?? null;
}

async function blockedEitherWay(viewerId: string, hostId: string): Promise<boolean> {
  const { rows } = await getPool().query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM blocks
     WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)`,
    [viewerId, hostId],
  );
  return (rows[0]?.n ?? 0) > 0;
}

export async function issueLiveToken(
  viewerId: string,
  roomId: string,
  role: "host" | "spectator" | "cohost",
): Promise<LiveTokenResponse> {
  await expireAbandonedLives();
  const stream = await loadLiveByRoom(roomId);
  if (!stream || stream.status !== "live") {
    throw new AppError("not_found", "Live has ended", 404);
  }
  if (stream.deleted_at || (stream.banned_until && stream.banned_until > new Date())) {
    throw new AppError("not_found", "Live has ended", 404);
  }
  if (viewerId !== stream.host_id && (await blockedEitherWay(viewerId, stream.host_id))) {
    throw new AppError("forbidden", "You cannot watch this live", 403);
  }

  let canPublish = false;
  let identity = spectatorIdentity(viewerId);
  if (role === "host") {
    if (stream.host_id !== viewerId) {
      throw new AppError("forbidden", "Only the host can publish as host", 403);
    }
    canPublish = true;
    identity = viewerId;
  } else if (role === "cohost") {
    canPublish = await isSeatedCohost(stream.room_id, stream.host_id, viewerId);
    if (!canPublish) {
      throw new AppError("forbidden", "Join as co-host first", 403);
    }
    identity = viewerId;
  }

  if (!isLivekitConfigured()) {
    throw new AppError("unavailable", "Live streaming is not configured", 503);
  }

  const token = await createLivekitToken({
    identity,
    room: stream.room_id,
    canPublish,
  });
  return {
    token: token.token,
    url: token.url,
    roomId: stream.room_id,
    streamId: stream.id,
    hostId: stream.host_id,
    displayName: stream.display_name,
    username: stream.username,
    avatarUrl: stream.avatar_url,
    canPublish,
  };
}
