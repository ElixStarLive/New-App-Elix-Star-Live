import { Router } from "express";
import { getPool } from "../../infra/postgres.js";
import { createLivekitToken } from "../../infra/livekit.js";
import { logger } from "../../infra/logger.js";
import { requireAuth, type AuthedRequest } from "../../middleware/auth.js";
import { AppError } from "../../middleware/errors.js";
import { liveStartBodySchema, liveTokenQuerySchema } from "../../../shared/contracts/live.js";
import { env } from "../../infra/env.js";
import { valkeyTrySetNx } from "../../infra/valkey.js";
import { viewerCount } from "../../websocket/presence.js";
import { isSeatedCohost } from "../cohost/runtime.js";
import { publishRoom } from "../battle/runtime.js";
import { queryLiveStatus } from "./status.js";
import { addLiveModerator, listLiveModerators, removeLiveModerator } from "./moderators.js";

const router = Router();

router.get("/streams", async (req: AuthedRequest, res) => {
  const viewerId = req.userId ?? null;
  const { rows } = await getPool().query<{
    id: string;
    room_id: string;
    host_id: string;
    display_name: string;
    username: string;
    avatar_url: string | null;
    title: string;
    started_at: Date;
  }>(
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

  res.json({
    streams: await Promise.all(
      rows.map(async (row) => ({
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
    ),
  });
});

/** Authoritative live status for For You inline preview (must be before /:streamId). */
router.get("/status", requireAuth, async (req: AuthedRequest, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  const room = typeof req.query.room === "string" ? req.query.room : "";
  const status = await queryLiveStatus(req.userId as string, room);
  res.json({
    room: status.room,
    active: status.active,
    hostUserId: status.hostUserId,
  });
});

router.post("/start", requireAuth, async (req: AuthedRequest, res) => {
  const body = liveStartBodySchema.parse(req.body ?? {});
  const roomId = req.userId as string;

  const { rows } = await getPool().query<{ display_name: string }>(
    `SELECT display_name FROM users WHERE id = $1`,
    [req.userId],
  );

  const token = await createLivekitToken({
    identity: req.userId as string,
    room: roomId,
    canPublish: true,
    name: rows[0]?.display_name,
  });

  await getPool().query(
    `UPDATE live_streams SET status = 'ended', ended_at = NOW()
     WHERE host_id = $1 AND status = 'live'`,
    [req.userId],
  );

  const inserted = await getPool().query<{ id: string }>(
    `INSERT INTO live_streams (host_id, room_id, title, status)
     VALUES ($1, $2, $3, 'live') RETURNING id`,
    [req.userId, roomId, body.title ?? ""],
  );

  const streamId = inserted.rows[0].id;
  if (env().valkeyUrl) {
    await valkeyTrySetNx(
      `stream:${roomId}`,
      JSON.stringify({ userId: req.userId, streamId }),
      8 * 60 * 60 * 1000,
    );
  }

  res.json({
    streamId,
    roomId,
    livekitToken: token.token,
    livekitUrl: token.url,
  });
});

router.get("/token", requireAuth, async (req: AuthedRequest, res) => {
  const query = liveTokenQuerySchema.parse(req.query);
  const { rows } = await getPool().query<{
    id: string;
    host_id: string;
    status: string;
    room_id: string;
    display_name: string;
    username: string;
    avatar_url: string | null;
  }>(
    `SELECT s.id, s.host_id, s.status, s.room_id, u.display_name, u.username, u.avatar_url
     FROM live_streams s
     JOIN users u ON u.id = s.host_id
     WHERE s.room_id = $1
     ORDER BY s.started_at DESC LIMIT 1`,
    [query.roomId],
  );

  const liveRow = rows[0];
  if (!liveRow || liveRow.status !== "live") {
    throw new AppError("not_found", "Live has ended", 404);
  }

  const blocked = await getPool().query<{ blocked: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM blocks
       WHERE (blocker_id = $1 AND blocked_id = $2)
          OR (blocker_id = $2 AND blocked_id = $1)
     ) AS blocked`,
    [liveRow.host_id, req.userId],
  );

  if (blocked.rows[0]?.blocked) {
    throw new AppError("forbidden", "You cannot join this live", 403);
  }

  let canPublish = false;
  if (query.role === "host") {
    if (liveRow.host_id !== req.userId) {
      throw new AppError("forbidden", "Only the host can publish as host", 403);
    }
    canPublish = true;
  } else if (query.role === "cohost") {
    canPublish = await isSeatedCohost(liveRow.room_id, liveRow.host_id, req.userId as string);
    if (!canPublish) {
      throw new AppError("forbidden", "Join as co-host first", 403);
    }
  }

  const token = await createLivekitToken({
    identity: canPublish ? (req.userId as string) : `${req.userId}__v`,
    room: liveRow.room_id,
    canPublish,
  });

  res.json({
    token: token.token,
    url: token.url,
    roomId: liveRow.room_id,
    streamId: liveRow.id,
    hostId: liveRow.host_id,
    displayName: liveRow.display_name,
    username: liveRow.username,
    avatarUrl: liveRow.avatar_url,
    canPublish,
  });
});

router.get("/:streamId/moderators", requireAuth, async (req: AuthedRequest, res) => {
  const streamId = String(req.params.streamId || "").trim();
  if (!streamId) throw new AppError("validation_error", "streamId is required", 400);
  res.json(await listLiveModerators(streamId));
});

router.post("/:streamId/moderators", requireAuth, async (req: AuthedRequest, res) => {
  const streamId = String(req.params.streamId || "").trim();
  const userId = typeof req.body?.userId === "string" ? req.body.userId.trim() : "";
  if (!streamId) throw new AppError("validation_error", "streamId is required", 400);
  if (!userId) throw new AppError("validation_error", "userId is required", 400);
  res.json(await addLiveModerator(streamId, String(req.userId), userId));
});

router.delete("/:streamId/moderators/:userId", requireAuth, async (req: AuthedRequest, res) => {
  const streamId = String(req.params.streamId || "").trim();
  const userId = String(req.params.userId || "").trim();
  if (!streamId) throw new AppError("validation_error", "streamId is required", 400);
  if (!userId) throw new AppError("validation_error", "userId is required", 400);
  res.json(await removeLiveModerator(streamId, String(req.userId), userId));
});

router.post("/:streamId/end", requireAuth, async (req: AuthedRequest, res) => {
  const streamId = String(req.params.streamId);
  const owned = await getPool().query<{ room_id: string; status: string }>(
    `SELECT room_id, status FROM live_streams WHERE id = $1 AND host_id = $2 LIMIT 1`,
    [streamId, req.userId],
  );

  if (!owned.rows[0]) throw new AppError("not_found", "Live not found", 404);

  if (owned.rows[0].status !== "live") {
    res.json({ ok: true, alreadyEnded: true });
    return;
  }

  const result = await getPool().query<{ room_id: string }>(
    `UPDATE live_streams SET status = 'ended', ended_at = NOW()
     WHERE id = $1 AND host_id = $2 AND status = 'live'
     RETURNING room_id`,
    [streamId, req.userId],
  );

  if (result.rowCount === 0) {
    res.json({ ok: true, alreadyEnded: true });
    return;
  }

  try {
    await publishRoom(result.rows[0].room_id, "stream_ended", { streamId });
  } catch (error) {
    if (!(error instanceof AppError) || error.code !== "unavailable") throw error;
    logger.warn({ err: error, streamId }, "stream_ended fanout skipped");
  }

  res.json({ ok: true });
});

export default router;
