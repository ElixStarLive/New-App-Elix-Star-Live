import { Router } from "express";
import { getPool } from "../../infra/postgres.js";
import { requireAuth, type AuthedRequest } from "../../middleware/auth.js";
import { AppError } from "../../middleware/errors.js";
import { routeParam } from "../../http/param.js";
import { cursorFromQuery, queryVideoPage } from "../feed/query.js";
import { bumpEngagement } from "../engagement/progress.js";

const router = Router();

router.get("/saved/list", requireAuth, async (req: AuthedRequest, res) => {
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

router.get("/user/:userId", async (req: AuthedRequest, res) => {
  const userId = routeParam(req, "userId");
  const isOwner = req.userId === userId;
  const privacy = typeof req.query.privacy === "string" ? req.query.privacy : "public";
  if (privacy === "private") {
    if (!isOwner) {
      res.json({ items: [], nextCursor: null });
      return;
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

router.get("/by-sound/:soundId", async (req, res) => {
  res.json(
    await queryVideoPage({
      extraWhere: `AND v.sound_id = $1`,
      extraParams: [routeParam(req, "soundId")],
      cursor: cursorFromQuery(req.query),
      privacy: "public",
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

router.get("/:videoId", async (req: AuthedRequest, res) => {
  const { rows } = await getPool().query<{
    bunny_path: string;
    caption: string;
    user_id: string;
    username: string;
    privacy: string;
    sound_id: string | null;
  }>(
    `SELECT v.bunny_path, v.caption, v.user_id, u.username, v.privacy, v.sound_id
     FROM videos v JOIN users u ON u.id = v.user_id
     WHERE v.id = $1 AND v.deleted_at IS NULL`,
    [routeParam(req, "videoId")],
  );
  if (!rows[0]) throw new AppError("not_found", "Video not found", 404);
  if (rows[0].privacy === "private" && req.userId !== rows[0].user_id) {
    throw new AppError("not_found", "Video not found", 404);
  }
  res.json({
    mediaUrl: rows[0].bunny_path,
    caption: rows[0].caption,
    userId: rows[0].user_id,
    username: rows[0].username,
    privacy: rows[0].privacy,
    soundId: rows[0].sound_id,
  });
});

router.post("/:videoId/comments", requireAuth, async (req: AuthedRequest, res) => {
  const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
  if (!body) throw new AppError("validation_error", "Comment required", 400);
  const parentId = typeof req.body?.parentId === "string" ? req.body.parentId : null;
  const inserted = await getPool().query<{ id: string }>(
    `INSERT INTO comments (video_id, user_id, body, parent_id) VALUES ($1, $2, $3, $4) RETURNING id`,
    [routeParam(req, "videoId"), req.userId, body, parentId],
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
  if (result.rowCount === 0) throw new AppError("not_found", "Comment not found", 404);
  res.json({ ok: true });
});

router.post("/:videoId/like", requireAuth, async (req: AuthedRequest, res) => {
  await getPool().query(
    `INSERT INTO video_likes (user_id, video_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [req.userId, routeParam(req, "videoId")],
  );
  await bumpEngagement(req.userId as string, "like", 1);
  res.json({ ok: true });
});

router.delete("/:videoId/like", requireAuth, async (req: AuthedRequest, res) => {
  await getPool().query(`DELETE FROM video_likes WHERE user_id = $1 AND video_id = $2`, [
    req.userId,
    routeParam(req, "videoId"),
  ]);
  res.json({ ok: true });
});

router.post("/:videoId/save", requireAuth, async (req: AuthedRequest, res) => {
  await getPool().query(
    `INSERT INTO video_saves (user_id, video_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [req.userId, routeParam(req, "videoId")],
  );
  res.json({ ok: true });
});

router.delete("/:videoId/save", requireAuth, async (req: AuthedRequest, res) => {
  await getPool().query(`DELETE FROM video_saves WHERE user_id = $1 AND video_id = $2`, [
    req.userId,
    routeParam(req, "videoId"),
  ]);
  res.json({ ok: true });
});

export default router;
