import { getPool } from "../../infra/postgres.js";
import { logger } from "../../infra/logger.js";

const LIVE_STARTED_FOLLOWER_LIMIT = 200;

/** Clear leftover live_started rows for this room/host before a new go-live. */
export async function deleteLiveStartedNotificationsForRoom(roomId: string, hostId: string): Promise<void> {
  const key = roomId.trim();
  const host = hostId.trim();
  if (!key && !host) return;
  await getPool().query(
    `DELETE FROM notifications
     WHERE kind = 'live_started'
       AND (
         payload->>'roomId' = $1
         OR payload->>'hostUserId' = $2
       )`,
    [key, host],
  );
}

/**
 * PAGE-032 / PAGE-030 Alerts: notify up to 200 followers that the host went live.
 * Call only on first go-live (not reconnect). Soft-fails so startLive still succeeds.
 */
export async function notifyFollowersLiveStarted(input: {
  hostId: string;
  roomId: string;
  hostLabel: string;
  hostAvatar: string | null;
}): Promise<number> {
  const hostId = input.hostId.trim();
  const roomId = input.roomId.trim();
  if (!hostId || !roomId) return 0;

  try {
    await deleteLiveStartedNotificationsForRoom(roomId, hostId);

    const { rows: followers } = await getPool().query<{ follower_id: string }>(
      `SELECT f.follower_id
       FROM follows f
       INNER JOIN users u ON u.id = f.follower_id
       WHERE f.followee_id = $1
         AND u.deleted_at IS NULL
         AND (u.banned_until IS NULL OR u.banned_until <= NOW())
         AND NOT EXISTS (
           SELECT 1 FROM blocks b
           WHERE (b.blocker_id = f.follower_id AND b.blocked_id = $1)
              OR (b.blocker_id = $1 AND b.blocked_id = f.follower_id)
         )
       ORDER BY f.created_at DESC
       LIMIT ${LIVE_STARTED_FOLLOWER_LIMIT}`,
      [hostId],
    );
    if (followers.length === 0) return 0;

    const hostLabel = (input.hostLabel || "").trim() || "A creator you follow";
    const title = `${hostLabel} is live`;
    const body = "Tap to watch now";
    const actionUrl = `/watch/${encodeURIComponent(roomId)}`;
    const imageUrl = input.hostAvatar?.trim() || "";
    const payload = JSON.stringify({
      title,
      body,
      actionUrl,
      roomId,
      hostUserId: hostId,
      ...(imageUrl ? { imageUrl } : {}),
    });

    const values: unknown[] = [];
    const placeholders: string[] = [];
    let i = 1;
    for (const row of followers) {
      placeholders.push(`($${i++}, 'live_started', $${i++}::jsonb)`);
      values.push(row.follower_id, payload);
    }
    await getPool().query(
      `INSERT INTO notifications (user_id, kind, payload) VALUES ${placeholders.join(", ")}`,
      values,
    );
    return followers.length;
  } catch (err) {
    logger.error({ err, hostId, roomId }, "notifyFollowersLiveStarted failed");
    return 0;
  }
}
