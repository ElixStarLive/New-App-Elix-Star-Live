import { Router } from "express";
import { getPool } from "../../infra/postgres.js";
import { isLiveNeonSchema } from "../../infra/liveSchema.js";
import { requireAuth, type AuthedRequest } from "../../middleware/auth.js";
import { AppError } from "../../middleware/errors.js";
import { routeParam } from "../../http/param.js";
import { cursorFromQuery, queryVideoPage } from "../feed/query.js";
import { publicProfile } from "../profile/router.js";

const router = Router();

type LiveRepostShape = "video_id" | "target_id" | "unavailable";

let liveRepostShapeCache: LiveRepostShape | null = null;

async function detectLiveRepostShape(): Promise<LiveRepostShape> {
  if (liveRepostShapeCache) return liveRepostShapeCache;
  const { rows } = await getPool().query<{ column_name: string }>(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'elix_reposts'
        AND column_name IN ('video_id', 'target_id', 'target_type')`,
  );
  const cols = new Set(rows.map((row) => row.column_name));
  if (cols.has("video_id")) {
    liveRepostShapeCache = "video_id";
  } else if (cols.has("target_id")) {
    liveRepostShapeCache = "target_id";
  } else {
    liveRepostShapeCache = "unavailable";
  }
  return liveRepostShapeCache;
}

async function queryUserRepostVideoPage(userId: string, cursor: ReturnType<typeof cursorFromQuery>) {
  if (await isLiveNeonSchema()) {
    const shape = await detectLiveRepostShape();
    if (shape === "unavailable") {
      throw new AppError("unavailable", "REPOSTS_LIVE_SCHEMA_UNAVAILABLE", 503);
    }
    if (shape === "video_id") {
      return queryVideoPage({
        extraWhere: `AND v.id IN (SELECT video_id FROM elix_reposts WHERE user_id = $1 AND video_id IS NOT NULL)`,
        extraParams: [userId],
        cursor,
        privacy: "public",
      });
    }
    return queryVideoPage({
      extraWhere: `AND v.id::text IN (
        SELECT target_id FROM elix_reposts
         WHERE user_id = $1 AND COALESCE(target_type, 'video') = 'video'
      )`,
      extraParams: [userId],
      cursor,
      privacy: "public",
    });
  }
  return queryVideoPage({
    extraWhere: `AND v.id::text IN (
      SELECT target_id FROM reposts WHERE user_id = $1 AND target_type = 'video'
    )`,
    extraParams: [userId],
    cursor,
    privacy: "public",
  });
}

router.get("/list", async (req: AuthedRequest, res) => {
  const userId = typeof req.query.userId === "string" ? req.query.userId : req.userId;
  if (!userId) {
    res.json({ videos: [], nextCursor: null });
    return;
  }
  res.json(await queryUserRepostVideoPage(userId, cursorFromQuery(req.query)));
});

router.post("/toggle", requireAuth, async (req: AuthedRequest, res) => {
  const targetType = req.body?.targetType === "live" ? "live" : "video";
  const targetId = typeof req.body?.targetId === "string" ? req.body.targetId : "";
  if (!targetId) throw new AppError("validation_error", "targetId required", 400);

  if (await isLiveNeonSchema()) {
    const shape = await detectLiveRepostShape();
    if (shape === "unavailable") {
      throw new AppError("unavailable", "REPOSTS_LIVE_SCHEMA_UNAVAILABLE", 503);
    }
    if (targetType !== "video") {
      throw new AppError("validation_error", "Only video reposts are supported", 400);
    }
    if (shape === "video_id") {
      const existing = await getPool().query(
        `SELECT 1 FROM elix_reposts WHERE user_id = $1 AND video_id = $2`,
        [req.userId, targetId],
      );
      if (existing.rows[0]) {
        await getPool().query(`DELETE FROM elix_reposts WHERE user_id = $1 AND video_id = $2`, [
          req.userId,
          targetId,
        ]);
        res.json({ reposted: false });
        return;
      }
      await getPool().query(`INSERT INTO elix_reposts (user_id, video_id) VALUES ($1, $2)`, [
        req.userId,
        targetId,
      ]);
      res.json({ reposted: true });
      return;
    }
    const existing = await getPool().query(
      `SELECT 1 FROM elix_reposts WHERE user_id = $1 AND target_type = $2 AND target_id = $3`,
      [req.userId, targetType, targetId],
    );
    if (existing.rows[0]) {
      await getPool().query(
        `DELETE FROM elix_reposts WHERE user_id = $1 AND target_type = $2 AND target_id = $3`,
        [req.userId, targetType, targetId],
      );
      res.json({ reposted: false });
      return;
    }
    await getPool().query(
      `INSERT INTO elix_reposts (user_id, target_type, target_id) VALUES ($1, $2, $3)`,
      [req.userId, targetType, targetId],
    );
    res.json({ reposted: true });
    return;
  }

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
  res.json(await queryUserRepostVideoPage(userId, cursorFromQuery(req.query)));
});

export default router;
