import { Router } from "express";
import { getPool } from "../../infra/postgres.js";
import { createLivekitToken } from "../../infra/livekit.js";
import { requireAuth, type AuthedRequest } from "../../middleware/auth.js";
import { AppError } from "../../middleware/errors.js";
import { liveStartBodySchema, liveTokenQuerySchema } from "../../../shared/contracts/live.js";
import { env } from "../../infra/env.js";
import { valkeyTrySetNx } from "../../infra/valkey.js";
import { viewerCount } from "../../websocket/presence.js";
import { isSeatedCohost } from "../cohost/runtime.js";
import { publishRoom } from "../battle/runtime.js";

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

router.post("/start", requireAuth, async (req: AuthedRequest, res) => {
  const body = liveStartBodySchema.parse(req.body ?? {});
  const roomId = req.userId as string;
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
    await valkeyTrySetNx(`stream:${roomId}`, JSON.stringify({ userId: req.userId, streamId }), 8 * 60 * 60 * 1000);
  }
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
     WHERE (s.room_id = $1 OR s.id::text = $1)
     ORDER BY s.started_at DESC LIMIT 1`,
    [query.roomId],
  );
  const stream = rows[0];
  if (!stream || stream.status !== "live") {
    throw new AppError("not_found", "Live has ended", 404);
  }
  let canPublish = false;
  if (query.role === "host") {
    if (stream.host_id !== req.userId) {
      throw new AppError("forbidden", "Only the host can publish as host", 403);
    }
    canPublish = true;
  } else if (query.role === "cohost") {
    canPublish = await isSeatedCohost(stream.room_id, stream.host_id, req.userId as string);
    if (!canPublish) {
      throw new AppError("forbidden", "Join as co-host first", 403);
    }
  }
  const token = await createLivekitToken({
    identity: canPublish ? (req.userId as string) : `${req.userId}__v`,
    room: stream.room_id,
    canPublish,
  });
  res.json({
    token: token.token,
    url: token.url,
    roomId: stream.room_id,
    streamId: stream.id,
    hostId: stream.host_id,
    displayName: stream.display_name,
    username: stream.username,
    avatarUrl: stream.avatar_url,
    canPublish,
  });
});

router.post("/:streamId/end", requireAuth, async (req: AuthedRequest, res) => {
  const result = await getPool().query<{ room_id: string }>(
    `UPDATE live_streams SET status = 'ended', ended_at = NOW()
     WHERE id = $1 AND host_id = $2 AND status = 'live'
     RETURNING room_id`,
    [String(req.params.streamId), req.userId],
  );
  if (result.rowCount === 0) throw new AppError("not_found", "Live not found", 404);
  await publishRoom(result.rows[0].room_id, "stream_ended", { streamId: String(req.params.streamId) });
  res.json({ ok: true });
});

export default router;
