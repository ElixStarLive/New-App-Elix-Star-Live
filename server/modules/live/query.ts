import { getPool } from "../../infra/postgres.js";
import { env } from "../../infra/env.js";
import { valkeyGet } from "../../infra/valkey.js";
import { viewerCount } from "../../websocket/presence.js";
import { expireAbandonedLives } from "./start.js";
import { getHostPresence } from "./hostGrace.js";

export type LiveStreamListRow = {
  streamId: string;
  roomId: string;
  hostId: string;
  displayName: string;
  username: string;
  avatarUrl: string | null;
  title: string;
  viewerCount: number;
  startedAt: string;
};

type DbLiveRow = {
  id: string;
  room_id: string;
  host_id: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
  title: string;
  started_at: Date;
};

function streamStateKey(roomId: string): string {
  return `stream:${roomId}`;
}

/** Neon live row + Valkey host presence + stream:{roomId} — fail-closed when Valkey is on. */
async function isRuntimeLive(roomId: string): Promise<boolean> {
  if (!env().valkeyUrl) return true;
  const presence = await getHostPresence(roomId);
  if (!presence) return false;
  try {
    const raw = await valkeyGet(streamStateKey(roomId));
    return Boolean(raw);
  } catch {
    return false;
  }
}

export async function queryLiveStreams(viewerId: string | null): Promise<LiveStreamListRow[]> {
  await expireAbandonedLives();
  const { rows } = await getPool().query<DbLiveRow>(
    `SELECT s.id, s.room_id, s.host_id, u.display_name, u.username, u.avatar_url, s.title, s.started_at
     FROM live_streams s
     JOIN users u ON u.id = s.host_id
     WHERE s.status = 'live' AND u.deleted_at IS NULL
       AND (u.banned_until IS NULL OR u.banned_until < NOW())
       AND ($1::uuid IS NULL OR (
         s.host_id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = $1)
         AND s.host_id NOT IN (SELECT blocker_id FROM blocks WHERE blocked_id = $1)
       ))
     ORDER BY s.started_at DESC`,
    [viewerId],
  );

  const eligible: DbLiveRow[] = [];
  for (const row of rows) {
    if (!(await isRuntimeLive(row.room_id))) continue;
    eligible.push(row);
  }

  return Promise.all(
    eligible.map(async (row) => ({
      streamId: row.id,
      roomId: row.room_id,
      hostId: row.host_id,
      displayName: row.display_name,
      username: row.username,
      avatarUrl: row.avatar_url,
      title: row.title,
      viewerCount: await viewerCount(row.room_id),
      startedAt: row.started_at.toISOString(),
    })),
  );
}
