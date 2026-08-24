import { Router } from "express";
import type { Response } from "express";
import { requireAuth, type AuthedRequest } from "../../middleware/auth.js";
import { AppError } from "../../middleware/errors.js";
import { routeParam } from "../../http/param.js";
import { readRequestBuffer } from "../../infra/multipart.js";
import { assertBunnyConfigured } from "../../infra/bunny.js";
import { UPLOAD_MAX_BYTES, isUuid, normalizeUploadKind } from "../../../shared/uploadContract.js";
import {
  abortUploadSession,
  createUploadSession,
  publishUploadSession,
  storeUploadBytes,
} from "./session.js";

const router = Router();

router.post("/sessions", requireAuth, async (req: AuthedRequest, res) => {
  assertBunnyConfigured();
  const body = req.body ?? {};
  const created = await createUploadSession(req.userId as string, {
    idempotencyKey: typeof body.idempotencyKey === "string" ? body.idempotencyKey : "",
    kind: normalizeUploadKind(body.kind),
    contentType: typeof body.contentType === "string" ? body.contentType : "",
    byteSize: Number(body.byteSize),
    filename: typeof body.filename === "string" ? body.filename : "",
    durationMs: body.durationMs == null ? null : Number(body.durationMs),
    width: body.width == null ? null : Number(body.width),
    height: body.height == null ? null : Number(body.height),
  });
  res.status(201).json(created);
});

router.post("/sessions/:sessionId/publish", requireAuth, async (req: AuthedRequest, res) => {
  const sessionId = routeParam(req, "sessionId");
  const body = req.body ?? {};
  const published = await publishUploadSession(req.userId as string, sessionId, {
    caption: body.caption,
    extraHashtags: body.extraHashtags,
    privacy: body.privacy,
    soundId: body.soundId,
  });
  res.status(201).json(published);
});

router.post("/sessions/:sessionId/abort", requireAuth, async (req: AuthedRequest, res) => {
  await abortUploadSession(req.userId as string, routeParam(req, "sessionId"));
  res.json({ ok: true });
});

export async function handleUploadBytes(req: AuthedRequest, res: Response): Promise<void> {
  assertBunnyConfigured();
  const sessionId = routeParam(req, "sessionId");
  if (!isUuid(sessionId)) throw new AppError("validation_error", "Invalid upload session", 400);
  const declared = Number(req.headers["content-length"] ?? 0);
  if (Number.isFinite(declared) && declared > UPLOAD_MAX_BYTES) {
    throw new AppError("validation_error", "File too large", 413);
  }
  const buffer = await readRequestBuffer(req, UPLOAD_MAX_BYTES);
  const contentType = String(req.headers["content-type"] ?? "application/octet-stream");
  const stored = await storeUploadBytes(req.userId as string, sessionId, buffer, contentType);
  res.status(200).json(stored);
}

export default router;
