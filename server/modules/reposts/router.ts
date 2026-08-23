import { Router } from "express";
import { getPool } from "../../infra/postgres.js";
import { isLiveNeonSchema } from "../../infra/liveSchema.js";
import { requireAuth, type AuthedRequest } from "../../middleware/auth.js";
import { AppError } from "../../middleware/errors.js";
import { routeParam } from "../../http/param.js";
import { cursorFromQuery, queryVideoPage } from "../feed/query.js";
import { publicProfile } from "../profile/router.js";

const router = Router();

/**
 * Live Neon stores reposts in `elix_reposts` (not rebuild `reposts`).
 * Column shape is not proven in repo docs/migrations — never invent SELECT/INSERT
 * columns, and never return an empty success that hides broken profile repost tabs.
 */
async function liveRepostsUnavailable(): Promise<never> {
  throw new AppError("unavailable", "REPOSTS_LIVE_SCHEMA_UNAVAILABLE", 503);
}

router.get("/list", async (req: AuthedRequest, res) => {
  const userId = typeof req.query.userId === "string" ? req.query.userId : req.userId;
  if (!userId) {
    res.json({ videos: [], nextCursor: null });
    return;
  }
  if (await isLiveNeonSchema()) {
    await liveRepostsUnavailable();
  }
  res.json(
    await queryVideoPage({
      extraWhere: `AND v.id::text IN (
        SELECT target_id FROM reposts WHERE user_id = $1 AND target_type = 'video'
      )`,
      extraParams: [userId],
      cursor: cursorFromQuery(req.query),
      privacy: "public",
    }),
  );
});

router.post("/toggle", requireAuth, async (req: AuthedRequest, res) => {
  if (await isLiveNeonSchema()) {
    await liveRepostsUnavailable();
  }
  const targetType = req.body?.targetType === "live" ? "live" : "video";
  const targetId = typeof req.body?.targetId === "string" ? req.body.targetId : "";
  if (!targetId) throw new AppError("validation_error", "targetId required", 400);
  const existing = await getPool().query(
    `SELECT 1 FROM reposts WHERE user_id = $1 AND target_type = $2 AND target_id = $3`,
    [req.userId, targetType, targetId],
  );
  if (existing.rows[0]) {
    await getPool().query(
      `DELETE FROM reposts WHERE user_id = $1 AND target_type = $2 AND target_id = $3`,
      [req.userId, targetType, targetId],
    );
    res.json({ reposted: false });
    return;
  }
  await getPool().query(`INSERT INTO reposts (user_id, target_type, target_id) VALUES ($1, $2, $3)`, [
    req.userId,
    targetType,
    targetId,
  ]);
  res.json({ reposted: true });
});

router.get("/:userId", async (req: AuthedRequest, res) => {
  const userId = routeParam(req, "userId");
  await publicProfile(userId, req.userId);
  if (await isLiveNeonSchema()) {
    await liveRepostsUnavailable();
  }
  res.json(
    await queryVideoPage({
      extraWhere: `AND v.id::text IN (
        SELECT target_id FROM reposts WHERE user_id = $1 AND target_type = 'video'
      )`,
      extraParams: [userId],
      cursor: cursorFromQuery(req.query),
      privacy: "public",
    }),
  );
});

export default router;
