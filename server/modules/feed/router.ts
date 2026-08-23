import { Router } from "express";
import { getPool } from "../../infra/postgres.js";
import { isLiveNeonSchema } from "../../infra/liveSchema.js";
import { requireAuth, type AuthedRequest } from "../../middleware/auth.js";
import { AppError } from "../../middleware/errors.js";
import { trackInteractionBodySchema, trackViewBodySchema } from "../../../shared/contracts/social.js";
import { bumpEngagement } from "../engagement/progress.js";
import {
  acquireFeedForyouBuildLock,
  FEED_FORYOU_CACHE_TTL_MS,
  isFeedForyouValkeyEnabled,
  readFeedForyouCache,
  writeFeedForyouCache,
} from "./foryouCache.js";
import { forYouFeedEnvelope } from "./formatFeedVideo.js";
import { cursorFromQuery, decodeOffsetCursor, mapFeedRow, queryFollowingPage, queryForYouPage, queryFriendsPage, queryStemPage, queryVideoPage } from "./query.js";

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
  const liveNeon = await isLiveNeonSchema();
  const live = liveNeon
    ? await getPool().query(
        `SELECT s.stream_key AS id, 'live'::text AS kind, s.user_id,
                COALESCE(p.username, '') AS username,
                COALESCE(NULLIF(s.display_name, ''), p.display_name, '') AS display_name,
                p.avatar_url, NULL::text AS caption, NULL::text AS media_url,
                p.avatar_url AS thumbnail_url, s.stream_key AS stream_id,
                0 AS like_count, 0 AS comment_count, 0 AS save_count,
                COALESCE(s.viewer_count, 0) AS view_count, TRUE AS is_live, s.started_at AS created_at,
                NULL::text AS sound_id, '{}'::text[] AS hashtags, FALSE AS liked, FALSE AS saved, FALSE AS is_following
           FROM live_streams s
           LEFT JOIN profiles p ON p.user_id = s.user_id
          WHERE s.is_live = TRUE AND s.ended_at IS NULL
          ORDER BY s.started_at DESC LIMIT 20`,
      )
    : await getPool().query(
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
    videos: [...live.rows.map(mapFeedRow), ...videos.videos],
    nextCursor: videos.nextCursor,
  });
});

/** Frozen OLD GET /api/feed/foryou — page/limit envelope; optional auth; Valkey only for anon. */
router.get("/foryou", async (req: AuthedRequest, res) => {
  const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit || "20"), 10) || 20));
  const offset = (page - 1) * limit;
  const viewerId = req.userId ?? null;
  const personalized = Boolean(viewerId);

  if (personalized) {
    res.setHeader("Cache-Control", "private, no-store");
    res.json(await queryForYouPage({ viewerId, page, limit }));
    return;
  }

  const cacheSec = Math.max(5, Math.floor(FEED_FORYOU_CACHE_TTL_MS / 1000));
  res.setHeader("Cache-Control", `public, s-maxage=${cacheSec}, max-age=${Math.max(5, Math.floor(cacheSec / 2))}`);

  if (isFeedForyouValkeyEnabled()) {
    const cached = await readFeedForyouCache(page, limit);
    if (cached) {
      res.json(forYouFeedEnvelope(cached, page, limit, offset, "valkey"));
      return;
    }
    const locked = await acquireFeedForyouBuildLock(page, limit);
    if (!locked) {
      await new Promise((r) => setTimeout(r, 150));
      const retry = await readFeedForyouCache(page, limit);
      if (retry) {
        res.json(forYouFeedEnvelope(retry, page, limit, offset, "valkey"));
        return;
      }
    }
  }

  const built = await queryForYouPage({ viewerId: null, page, limit });
  if (isFeedForyouValkeyEnabled()) {
    await writeFeedForyouCache(page, limit, built.videos);
  }
  res.json(built);
});

router.get("/following", async (req: AuthedRequest, res) => {
  if (!req.userId) {
    res.json({ videos: [] });
    return;
  }
  const page = await queryFollowingPage({
    viewerId: req.userId,
    cursor: null,
  });
  res.json({ videos: page.videos });
});

router.get("/friends", async (req: AuthedRequest, res) => {
  if (!req.userId) {
    res.json({ videos: [] });
    return;
  }
  const page = await queryFriendsPage({
    viewerId: req.userId,
    cursor: null,
  });
  res.json({ videos: page.videos });
});

router.get("/stem", requireAuth, async (req: AuthedRequest, res) => {
  res.json(
    await queryStemPage({
      viewerId: req.userId ?? null,
      offset: decodeOffsetCursor(req.query.cursor),
    }),
  );
});

router.post("/track-view", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = trackViewBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) throw new AppError("validation_error", "Invalid view payload", 400);
  const viewerId = req.userId as string;
  const videoId = parsed.data.videoId;
  const liveNeon = await isLiveNeonSchema();
  const owned = liveNeon
    ? await getPool().query<{ user_id: string; deleted_at: Date | null; privacy: string }>(
        `SELECT user_id, NULL::timestamptz AS deleted_at, COALESCE(privacy, 'public') AS privacy FROM videos WHERE id = $1`,
        [videoId],
      )
    : await getPool().query<{ user_id: string; deleted_at: Date | null; privacy: string }>(
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
  const inserted = liveNeon
    ? await getPool().query(
        `UPDATE videos SET views = COALESCE(views, 0) + 1 WHERE id = $1 RETURNING id AS video_id`,
        [videoId],
      )
    : await getPool().query(
        `INSERT INTO video_views (video_id, viewer_id) VALUES ($1, $2)
     ON CONFLICT (video_id, viewer_id) DO NOTHING
     RETURNING video_id`,
        [videoId, viewerId],
      );
  const counted = (inserted.rowCount ?? 0) > 0;
  if (counted) await bumpEngagement(viewerId, "watch", 1);
  res.json({ accepted: true, counted });
});

router.post("/track-interaction", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = trackInteractionBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) throw new AppError("validation_error", "Invalid interaction payload", 400);
  const found = (await isLiveNeonSchema())
    ? await getPool().query(`SELECT 1 FROM videos WHERE id = $1`, [parsed.data.videoId])
    : await getPool().query(`SELECT 1 FROM videos WHERE id = $1 AND deleted_at IS NULL`, [
        parsed.data.videoId,
      ]);
  if (!found.rows[0]) throw new AppError("not_found", "Video not found", 404);
  res.json({ ok: true });
});

export default router;
