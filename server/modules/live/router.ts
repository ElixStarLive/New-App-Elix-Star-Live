import { Router } from "express";
import { getPool } from "../../infra/postgres.js";
import { requireAuth, type AuthedRequest } from "../../middleware/auth.js";
import { AppError } from "../../middleware/errors.js";
import { liveStartBodySchema, liveTokenQuerySchema } from "../../../shared/contracts/live.js";
import { viewerCount } from "../../websocket/presence.js";
import { queryLiveStatus } from "./status.js";
import { addLiveModerator, listLiveModerators, removeLiveModerator } from "./moderators.js";
import { endLive, startLive } from "./start.js";
import { issueLiveToken } from "./token.js";

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
  const result = await startLive(req.userId as string, {
    title: body.title,
    displayName: body.displayName,
    room: body.room,
  });
  res.json({
    streamId: result.streamId,
    roomId: result.roomId,
    livekitToken: result.livekitToken,
    livekitUrl: result.livekitUrl,
    reconnect: result.reconnect,
  });
});

router.get("/token", requireAuth, async (req: AuthedRequest, res) => {
  const query = liveTokenQuerySchema.parse(req.query);
  const token = await issueLiveToken(req.userId as string, query.roomId, query.role);
  res.json(token);
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
  const result = await endLive(String(req.userId), streamId);
  res.json({ ok: result.ok, alreadyEnded: result.alreadyEnded });
});

export default router;
