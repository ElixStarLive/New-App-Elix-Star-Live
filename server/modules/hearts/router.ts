import { Router } from "express";
import { requireAuth, type AuthedRequest } from "../../middleware/auth.js";
import { AppError } from "../../middleware/errors.js";
import { z } from "zod";
import { dailyHeartSendBodySchema } from "../../../shared/contracts/hearts.js";

const creatorIdParam = z.string().uuid();
import { readDailyHeartStatus, sendDailyHeart } from "./service.js";

const router = Router();

router.get("/daily/:creatorUserId", async (req: AuthedRequest, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  const parsed = creatorIdParam.safeParse(String(req.params.creatorUserId || "").trim());
  if (!parsed.success) throw new AppError("validation_error", "creatorId required", 400);
  res.json(await readDailyHeartStatus(parsed.data, req.userId ?? null));
});

router.post("/daily", requireAuth, async (req: AuthedRequest, res) => {
  const body = dailyHeartSendBodySchema.parse(req.body ?? {});
  res.json(await sendDailyHeart(body.creatorId, req.userId as string));
});

export default router;
