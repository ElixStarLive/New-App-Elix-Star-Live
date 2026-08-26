import { Router } from "express";
import { requireAuth, type AuthedRequest } from "../../middleware/auth.js";
import { AppError } from "../../middleware/errors.js";
import { liveStartBodySchema, liveTokenQuerySchema } from "../../../shared/contracts/live.js";
import { queryLiveStatus } from "./status.js";
import { addLiveModerator, listLiveModerators, removeLiveModerator } from "./moderators.js";
import { endLive, startLive } from "./start.js";
import { issueLiveToken } from "./token.js";
import { runLiveModerationCheck } from "./moderation.js";
import { queryLiveStreams } from "./query.js";

const router = Router();

router.get("/streams", async (req: AuthedRequest, res) => {
  const viewerId = req.userId ?? null;
  const streams = await queryLiveStreams(viewerId);
  res.json({ streams });
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

router.post("/moderation/check", requireAuth, async (req: AuthedRequest, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  res.json(await runLiveModerationCheck(req.userId as string, req.body));
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
