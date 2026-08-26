import { getPool } from "../../infra/postgres.js";
import { AppError } from "../../middleware/errors.js";
import { env } from "../../infra/env.js";
import { createLivekitToken, isLivekitConfigured } from "../../infra/livekit.js";
import { valkeyDel, valkeySet } from "../../infra/valkey.js";
import { logger } from "../../infra/logger.js";
import { broadcastLivePresence } from "./presenceFanout.js";
import { clearHostPresence, getHostPresence, markHostStarting } from "./hostGrace.js";
import {
  deleteLiveStartedNotificationsForRoom,
  notifyFollowersLiveStarted,
} from "../notifications/liveStarted.js";
import type { LiveStartResponse, LiveStreamCard } from "../../../shared/contracts/live.js";

const STREAM_TTL_MS = 8 * 60 * 60 * 1000;

type HostRow = {
  display_name: string;
  username: string;
  avatar_url: string | null;
  banned_until: Date | null;
  deleted_at: Date | null;
};

type LiveRow = {
  id: string;
  room_id: string;
  title: string;
  started_at: Date;
  display_name: string;
  username: string;
  avatar_url: string | null;
};

function streamKey(roomId: string): string {
  return `stream:${roomId}`;
}

async function hostProfile(hostId: string): Promise<HostRow> {
  const { rows } = await getPool().query<HostRow>(
        `SELECT display_name, username, avatar_url, banned_until, deleted_at
     FROM users WHERE id = $1`,
        [hostId],
      );
  const host = rows[0];
  if (!host || host.deleted_at) {
    throw new AppError("not_found", "Account not found", 404);
  }
  if (host.banned_until && host.banned_until > new Date()) {
    throw new AppError("banned", "Account is banned", 403);
  }
  return host;
}

async function persistRealtime(roomId: string, hostId: string, streamId: string): Promise<void> {
  if (!env().valkeyUrl) {
    throw new AppError("unavailable", "Live state is unavailable", 503);
  }
  await valkeySet(
    streamKey(roomId),
    JSON.stringify({ userId: hostId, streamId }),
    STREAM_TTL_MS,
  );
  await markHostStarting(roomId);
}

async function clearRealtime(roomId: string): Promise<void> {
  if (!env().valkeyUrl) return;
  await valkeyDel(streamKey(roomId));
  await clearHostPresence(roomId);
}

function cardFromRow(row: LiveRow, hostId: string, viewerCount = 0): LiveStreamCard {
  return {
    streamId: row.id,
    roomId: row.room_id,
    hostId,
    displayName: row.display_name,
    username: row.username,
    avatarUrl: row.avatar_url,
    title: row.title,
    viewerCount,
    startedAt: row.started_at.toISOString(),
  };
}

async function mintHostToken(hostId: string, roomId: string, name: string): Promise<{ token: string; url: string }> {
  if (!isLivekitConfigured()) {
    throw new AppError("unavailable", "Live streaming is not configured", 503);
  }
  return createLivekitToken({
    identity: hostId,
    room: roomId,
    canPublish: true,
    name,
  });
}

export async function startLive(
  hostId: string,
  input: { title?: string; displayName?: string; room?: string },
): Promise<LiveStartResponse & { reconnect: boolean; card: LiveStreamCard }> {
  if (input.room && input.room.trim() !== hostId) {
    throw new AppError("forbidden", "You can only go live in your own room", 403);
  }

  const host = await hostProfile(hostId);
  const roomId = hostId;
  const title = (input.title ?? input.displayName ?? host.display_name ?? "").slice(0, 80);
  const token = await mintHostToken(hostId, roomId, host.display_name);

  const client = await getPool().connect();
  let row: LiveRow;
  let reconnect = false;
  try {
    await client.query("BEGIN");
    // Serialize concurrent go-live (React Strict Mode double-mount / double tap).
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [hostId]);

    const existing = await client.query<{
          id: string;
          room_id: string;
          title: string;
          started_at: Date;
        }>(
          `SELECT id, room_id, title, started_at
       FROM live_streams
       WHERE (host_id = $1::uuid OR room_id = $1::text) AND status = 'live'
       FOR UPDATE`,
          [hostId],
        );
    if (existing.rows[0]) {
      reconnect = true;
      row = {
        ...existing.rows[0],
        display_name: host.display_name,
        username: host.username,
        avatar_url: host.avatar_url,
      };
    } else {
      try {
        const inserted = await client.query<{
          id: string;
          room_id: string;
          title: string;
          started_at: Date;
        }>(
          `INSERT INTO live_streams (host_id, room_id, title, status)
           VALUES ($1, $2, $3, 'live')
           RETURNING id, room_id, title, started_at`,
          [hostId, roomId, title],
        );
        row = {
          ...inserted.rows[0],
          display_name: host.display_name,
          username: host.username,
          avatar_url: host.avatar_url,
        };
      } catch (insertError) {
        const code =
          insertError && typeof insertError === "object" && "code" in insertError
            ? String((insertError as { code?: unknown }).code)
            : "";
        if (code !== "23505") throw insertError;
        const raced = await client.query<{
          id: string;
          room_id: string;
          title: string;
          started_at: Date;
        }>(
          `SELECT id, room_id, title, started_at
           FROM live_streams
           WHERE (host_id = $1::uuid OR room_id = $1::text) AND status = 'live'
           FOR UPDATE`,
          [hostId],
        );
        if (!raced.rows[0]) throw insertError;
        reconnect = true;
        row = {
          ...raced.rows[0],
          display_name: host.display_name,
          username: host.username,
          avatar_url: host.avatar_url,
        };
      }
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  try {
    await persistRealtime(roomId, hostId, row.id);
  } catch (error) {
    if (!reconnect) {
      await getPool().query(
          `UPDATE live_streams SET status = 'ended', ended_at = NOW()
         WHERE id = $1 AND status = 'live'`,
          [row.id],
        );
    }
    logger.error({ err: error, roomId }, "live realtime persist failed");
    throw new AppError("unavailable", "Live state is unavailable", 503);
  }

  const card = cardFromRow(row, hostId);
  if (!reconnect) {
    try {
      await broadcastLivePresence("stream_started", card);
    } catch (error) {
      logger.error({ err: error, roomId }, "stream_started fanout failed");
    }
    try {
      await notifyFollowersLiveStarted({
        hostId,
        roomId,
        hostLabel: row.display_name || row.username || "A creator you follow",
        hostAvatar: row.avatar_url,
      });
    } catch (error) {
      logger.error({ err: error, roomId }, "live_started alerts fanout failed");
    }
  }

  return {
    streamId: row.id,
    roomId,
    livekitToken: token.token,
    livekitUrl: token.url,
    reconnect,
    card,
  };
}

export async function endLive(
  hostId: string,
  streamId: string,
): Promise<{ ok: true; alreadyEnded: boolean; roomId: string | null }> {
  
  const ended = await getPool().query<{ room_id: string }>(
        `UPDATE live_streams
     SET status = 'ended', ended_at = COALESCE(ended_at, NOW())
     WHERE id = $1 AND host_id = $2 AND status = 'live'
     RETURNING room_id`,
        [streamId, hostId],
      );
  if (ended.rows[0]) {
    const roomId = ended.rows[0].room_id;
    await clearRealtime(roomId);
    await broadcastLivePresence("stream_ended", { streamId, roomId });
    try {
      await deleteLiveStartedNotificationsForRoom(roomId, hostId);
    } catch (error) {
      logger.error({ err: error, roomId }, "live_started prune failed");
    }
    return { ok: true, alreadyEnded: false, roomId };
  }

  const existing = await getPool().query<{ status: string; room_id: string }>(
        `SELECT status, room_id FROM live_streams WHERE id = $1 AND host_id = $2`,
        [streamId, hostId],
      );
  if (existing.rows[0]?.status === "ended") {
    await clearRealtime(existing.rows[0].room_id);
    return { ok: true, alreadyEnded: true, roomId: existing.rows[0].room_id };
  }
  throw new AppError("not_found", "Live not found", 404);
}

export async function expireAbandonedLives(): Promise<number> {
  if (!env().valkeyUrl) return 0;
  const { rows } = await getPool().query<{ id: string; host_id: string; room_id: string }>(
        `SELECT id, host_id, room_id FROM live_streams WHERE status = 'live'`,
      );
  let ended = 0;
  for (const row of rows) {
    const presence = await getHostPresence(row.room_id);
    if (presence) continue;
    try {
      await endLive(row.host_id, row.id);
      ended += 1;
    } catch (error) {
      logger.error({ err: error, roomId: row.room_id }, "abandoned live expire failed");
    }
  }
  return ended;
}
