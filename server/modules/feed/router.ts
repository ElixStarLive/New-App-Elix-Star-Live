import { Router } from "express";
import { getPool } from "../../infra/postgres.js";
import { requireAuth, type AuthedRequest } from "../../middleware/auth.js";
import { AppError } from "../../middleware/errors.js";
import { trackInteractionBodySchema, trackViewBodySchema } from "../../../shared/contracts/social.js";
import { cursorFromQuery, decodeOffsetCursor, mapFeedRow, queryForYouPage, queryVideoPage } from "./query.js";

const router = Router();

router.get("/", async (req: AuthedRequest, res) => {
  const cursor = cursorFromQuery(req.query);
  const videos = await queryVideoPage({
    extraWhere: "",
    extraParams: [],
    cursor,
    privacy: "public",
  });
  if (cursor) {
    res.json(videos);
    return;
  }
  const live = await getPool().query(
    `SELECT s.id, 'live'::text AS kind, s.host_id AS user_id, u.username, u.display_name, u.avatar_url,
            s.title AS caption, NULL::text AS media_url, u.avatar_url AS thumbnail_url, s.id AS stream_id,
            0 AS like_count, 0 AS comment_count, 0 AS save_count, 0 AS view_count, TRUE AS is_live, s.started_at AS created_at,
            NULL::text AS sound_id, '{}'::text[] AS hashtags, FALSE AS liked, FALSE AS saved, FALSE AS is_following
     FROM live_streams s
     JOIN users u ON u.id = s.host_id
     WHERE s.status = 'live' AND u.deleted_at IS NULL
     ORDER BY s.started_at DESC LIMIT 20`,
  );
  res.json({
    items: [...live.rows.map(mapFeedRow), ...videos.items],
    nextCursor: videos.nextCursor,
  });
});

router.get("/foryou", requireAuth, async (req: AuthedRequest, res) => {
  res.json(
    await queryForYouPage({
      viewerId: req.userId ?? null,
      offset: decodeOffsetCursor(req.query.cursor),
    }),
  );
});

router.get("/following", async (req: AuthedRequest, res) => {
  if (!req.userId) {
    res.json({ items: [], nextCursor: null });
    return;
  }
  res.json(
    await queryVideoPage({
      extraWhere: `AND v.user_id IN (SELECT followee_id FROM follows WHERE follower_id = $1)`,
      extraParams: [req.userId],
      cursor: cursorFromQuery(req.query),
      privacy: "public",
    }),
  );
});

router.get("/friends", async (req: AuthedRequest, res) => {
  if (!req.userId) {
    res.json({ items: [], nextCursor: null });
    return;
  }
  res.json(
    await queryVideoPage({
      extraWhere: `AND v.user_id IN (
         SELECT f1.followee_id FROM follows f1
         JOIN follows f2 ON f2.follower_id = f1.followee_id AND f2.followee_id = f1.follower_id
         WHERE f1.follower_id = $1
       )`,
      extraParams: [req.userId],
      cursor: cursorFromQuery(req.query),
      privacy: "public",
    }),
  );
});

router.get("/stem", async (req: AuthedRequest, res) => {
  res.json(
    await queryVideoPage({
      extraWhere: `AND v.is_stem = TRUE`,
      extraParams: [],
      cursor: cursorFromQuery(req.query),
      privacy: "public",
    }),
  );
});

router.post("/track-view", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = trackViewBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) throw new AppError("validation_error", "Invalid view payload", 400);
  const viewerId = req.userId as string;
  const videoId = parsed.data.videoId;
  const owned = await getPool().query<{ user_id: string; deleted_at: Date | null; privacy: string }>(
    `SELECT user_id, deleted_at, privacy FROM videos WHERE id = $1`,
    [videoId],
  );
  const video = owned.rows[0];
  if (!video || video.deleted_at || (video.privacy === "private" && video.user_id !== viewerId)) {
    throw new AppError("not_found", "Video not found", 404);
  }
  if (video.user_id === viewerId) {
    res.json({ accepted: true, counted: false });
    return;
  }
  const watchSeconds = Math.floor(parsed.data.watchTime ?? 0);
  if (watchSeconds < 3) {
    res.json({ accepted: true, counted: false });
    return;
  }
  const inserted = await getPool().query(
    `INSERT INTO video_views (video_id, viewer_id) VALUES ($1, $2)
     ON CONFLICT (video_id, viewer_id) DO NOTHING
     RETURNING video_id`,
    [videoId, viewerId],
  );
  res.json({ accepted: true, counted: (inserted.rowCount ?? 0) > 0 });
});

router.post("/track-interaction", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = trackInteractionBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) throw new AppError("validation_error", "Invalid interaction payload", 400);
  const found = await getPool().query(`SELECT 1 FROM videos WHERE id = $1 AND deleted_at IS NULL`, [
    parsed.data.videoId,
  ]);
  if (!found.rows[0]) throw new AppError("not_found", "Video not found", 404);
  res.json({ ok: true });
});

export default router;
