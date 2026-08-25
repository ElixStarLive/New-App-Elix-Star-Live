import { Router } from "express";
import { getPool } from "../../infra/postgres.js";
import { requireAuth, type AuthedRequest } from "../../middleware/auth.js";
import { AppError } from "../../middleware/errors.js";
import { routeParam } from "../../http/param.js";
import { cursorFromQuery, queryVideoPage } from "../feed/query.js";
import { querySavedList, queryVideoDetail, savedListPaging } from "./query.js";
import { bumpEngagement } from "../engagement/progress.js";
import { assertDownloadableMediaUrl, fetchVoiceOnlyMp4 } from "./voiceOnly.js";
import { publicProfile } from "../profile/router.js";

const router = Router();

router.get("/saved/list", requireAuth, async (req: AuthedRequest, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  const { limit, offset } = savedListPaging(req.query);
  res.json(await querySavedList(req.userId as string, offset, limit));
});

/** PAGE-024 own-profile saved tab — FeedVideo page (not SavedVideoHit list). */
router.get("/saved/feed", requireAuth, async (req: AuthedRequest, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  res.json(
    await queryVideoPage({
      extraWhere: `AND v.id IN (SELECT video_id FROM video_saves WHERE user_id = $1)`,
      extraParams: [req.userId],
      cursor: cursorFromQuery(req.query),
      privacy: "any",
    }),
  );
});

router.get("/liked/list", requireAuth, async (req: AuthedRequest, res) => {
  res.json(
    await queryVideoPage({
      extraWhere: `AND v.id IN (SELECT video_id FROM video_likes WHERE user_id = $1)`,
      extraParams: [req.userId],
      cursor: cursorFromQuery(req.query),
      privacy: "any",
    }),
  );
});

router.get("/user/:userId/saved", async (req: AuthedRequest, res) => {
  const userId = routeParam(req, "userId");
  await publicProfile(userId, req.userId);
  res.json(
    await queryVideoPage({
      extraWhere: `AND v.id IN (SELECT video_id FROM video_saves WHERE user_id = $1)`,
      extraParams: [userId],
      cursor: cursorFromQuery(req.query),
      privacy: "public",
    }),
  );
});

router.get("/user/:userId/liked", async (req: AuthedRequest, res) => {
  const userId = routeParam(req, "userId");
  await publicProfile(userId, req.userId);
  res.json(
    await queryVideoPage({
      extraWhere: `AND v.id IN (SELECT video_id FROM video_likes WHERE user_id = $1)`,
      extraParams: [userId],
      cursor: cursorFromQuery(req.query),
      privacy: "public",
    }),
  );
});

router.get("/user/:userId", async (req: AuthedRequest, res) => {
  const userId = routeParam(req, "userId");
  await publicProfile(userId, req.userId);
  const isOwner = req.userId === userId;
  const privacy = typeof req.query.privacy === "string" ? req.query.privacy : "public";
  if (privacy === "private") {
    if (!isOwner) {
      throw new AppError("forbidden", "Private videos are only visible to the owner", 403);
    }
    res.json(
      await queryVideoPage({
        extraWhere: `AND v.user_id = $1 AND v.privacy = 'private'`,
        extraParams: [userId],
        cursor: cursorFromQuery(req.query),
        privacy: "any",
      }),
    );
    return;
  }
  res.json(
    await queryVideoPage({
      extraWhere: isOwner ? `AND v.user_id = $1 AND v.privacy <> 'private'` : `AND v.user_id = $1`,
      extraParams: [userId],
      cursor: cursorFromQuery(req.query),
      privacy: isOwner ? "any" : "public",
    }),
  );
});

router.get("/:videoId/comments", async (req, res) => {
  const videoId = routeParam(req, "videoId");
  
  const { rows } = await getPool().query<{
    id: string;
    user_id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
    body: string;
    created_at: Date;
    like_count: string;
  }>(
    `SELECT c.id, c.user_id, u.username, u.display_name, u.avatar_url, c.body, c.created_at,
            (SELECT COUNT(*)::text FROM comment_likes cl WHERE cl.comment_id = c.id) AS like_count
     FROM comments c
     JOIN users u ON u.id = c.user_id
     WHERE c.video_id = $1 AND c.deleted_at IS NULL
     ORDER BY c.created_at DESC
     LIMIT 200`,
    [videoId],
  );
  res.json({
    comments: rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      username: row.username,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
      body: row.body,
      createdAt: row.created_at.toISOString(),
      likeCount: Number(row.like_count),
    })),
  });
});

router.get("/:videoId/download", async (req: AuthedRequest, res) => {
  const { rows } = await getPool().query<{
    bunny_path: string;
    user_id: string;
    privacy: string;
  }>(
    `SELECT bunny_path, user_id, privacy FROM videos WHERE id = $1 AND deleted_at IS NULL`,
    [routeParam(req, "videoId")],
  );
  const video = rows[0];
  if (!video) throw new AppError("not_found", "Video not found", 404);
  if (video.privacy === "private" && req.userId !== video.user_id) {
    throw new AppError("forbidden", "Forbidden", 403);
  }
  try {
    assertDownloadableMediaUrl(video.bunny_path);
  } catch {
    throw new AppError("validation_error", "Video source is not downloadable", 400);
  }
  try {
    const buffer = await fetchVoiceOnlyMp4(video.bunny_path);
    const filename = `elix_${routeParam(req, "videoId")}.mp4`;
    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Content-Length", String(buffer.length));
    res.status(200).send(buffer);
  } catch {
    throw new AppError("upstream_error", "DOWNLOAD_FAILED", 502);
  }
});

router.get("/:videoId", async (req: AuthedRequest, res) => {
  const item = await queryVideoDetail(req.userId ?? null, routeParam(req, "videoId"));
  if (!item) throw new AppError("not_found", "Video not found", 404);
  res.json(item);
});

router.post("/:videoId/comments", requireAuth, async (req: AuthedRequest, res) => {
  const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
  if (!body) throw new AppError("validation_error", "Comment required", 400);
  const parentId = typeof req.body?.parentId === "string" ? req.body.parentId : null;
  const videoId = routeParam(req, "videoId");
  const inserted = await getPool().query<{ id: string }>(
        `INSERT INTO comments (video_id, user_id, body, parent_id) VALUES ($1, $2, $3, $4) RETURNING id`,
        [videoId, req.userId, body, parentId],
      );
  
  res.status(201).json({ ok: true, id: inserted.rows[0].id });
});

router.post("/:videoId/comments/:commentId/like", requireAuth, async (req: AuthedRequest, res) => {
  await getPool().query(
    `INSERT INTO comment_likes (user_id, comment_id)
     SELECT $1, c.id FROM comments c
     WHERE c.id = $2 AND c.video_id = $3 AND c.deleted_at IS NULL
     ON CONFLICT DO NOTHING`,
    [req.userId, routeParam(req, "commentId"), routeParam(req, "videoId")],
  );
  res.json({ ok: true });
});

router.delete("/:videoId/comments/:commentId/like", requireAuth, async (req: AuthedRequest, res) => {
  await getPool().query(
    `DELETE FROM comment_likes WHERE user_id = $1 AND comment_id = $2`,
    [req.userId, routeParam(req, "commentId")],
  );
  res.json({ ok: true });
});

router.delete("/:videoId/comments/:commentId", requireAuth, async (req: AuthedRequest, res) => {
  const result = await getPool().query(
        `UPDATE comments SET deleted_at = NOW()
     WHERE id = $1 AND video_id = $2 AND user_id = $3 AND deleted_at IS NULL`,
        [routeParam(req, "commentId"), routeParam(req, "videoId"), req.userId],
      );
  if ((result.rowCount ?? 0) > 0) {
    await getPool().query(
      `UPDATE videos SET comments = GREATEST(COALESCE(comments, 0) - 1, 0) WHERE id = $1`,
      [routeParam(req, "videoId")],
    );
  }
  if (result.rowCount === 0) throw new AppError("not_found", "Comment not found", 404);
  res.json({ ok: true });
});

router.post("/:videoId/like", requireAuth, async (req: AuthedRequest, res) => {
  const videoId = routeParam(req, "videoId");
  
  const liked = await getPool().query(
        `INSERT INTO video_likes (user_id, video_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING video_id`,
        [req.userId, videoId],
      );
  if ((liked.rowCount ?? 0) > 0) {
    
    await bumpEngagement(req.userId as string, "like", 1);
  }
  res.json({ ok: true });
});

router.post("/:videoId/unlike", requireAuth, async (req: AuthedRequest, res) => {
  const videoId = routeParam(req, "videoId");
  await getPool().query(`DELETE FROM video_likes WHERE user_id = $1 AND video_id = $2`, [
      req.userId,
      videoId,
    ]);
  res.json({ ok: true });
});

router.post("/:videoId/save", requireAuth, async (req: AuthedRequest, res) => {
  const videoId = routeParam(req, "videoId");
  await getPool().query(
      `INSERT INTO video_saves (user_id, video_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [req.userId, videoId],
    );
  res.json({ ok: true });
});

router.post("/:videoId/unsave", requireAuth, async (req: AuthedRequest, res) => {
  const videoId = routeParam(req, "videoId");
  await getPool().query(`DELETE FROM video_saves WHERE user_id = $1 AND video_id = $2`, [
      req.userId,
      videoId,
    ]);
  res.json({ ok: true });
});

export default router;
