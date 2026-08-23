import type { QueryResultRow } from "pg";
import { getPool } from "../../infra/postgres.js";
import {
  isLiveNeonSchema,
  liveBlockedVideoFilter,
  liveFeedSelectSql,
  liveOwnerVideoFilter,
  livePublicVideoFilter,
} from "../../infra/liveSchema.js";
import { decodeKeyset, encodeKeyset, FEED_PAGE_SIZE, keysetWhere, type Keyset } from "../../lib/cursor.js";
import type { FeedVideo, ForYouFeedResponse } from "../../../shared/contracts/social.js";
import {
  STEM_EXTRA_SLOTS,
  STEM_MAX,
  STEM_TOP_TRENDING,
  stemExtraLikePatterns,
} from "../../../shared/stemEligibility.js";
import { formatFeedVideo, forYouFeedEnvelope } from "./formatFeedVideo.js";

export const VIDEO_SELECT = `
  SELECT v.id, 'video'::text AS kind, v.user_id, u.username, u.display_name, u.avatar_url,
         v.caption, v.bunny_path AS media_url, v.thumbnail_url, NULL::uuid AS stream_id,
         (SELECT COUNT(*) FROM video_likes WHERE video_id = v.id) AS like_count,
         (SELECT COUNT(*) FROM comments WHERE video_id = v.id AND deleted_at IS NULL) AS comment_count,
         (SELECT COUNT(*) FROM video_saves WHERE video_id = v.id) AS save_count,
         (SELECT COUNT(*) FROM video_views WHERE video_id = v.id) AS view_count,
         EXISTS(SELECT 1 FROM live_streams s WHERE s.host_id = v.user_id AND s.status = 'live') AS is_live,
         v.created_at, v.privacy, v.sound_id, v.hashtags,
         FALSE AS liked, FALSE AS saved, FALSE AS is_following
  FROM videos v
  JOIN users u ON u.id = v.user_id
  WHERE v.deleted_at IS NULL AND u.deleted_at IS NULL
`;

export function mapFeedRow(row: QueryResultRow): FeedVideo {
  return formatFeedVideo(row, {
    liked: Boolean(row.liked),
    saved: Boolean(row.saved),
    isFollowing: Boolean(row.is_following),
    location: typeof row.location === "string" && row.location ? row.location : "For You",
  });
}

export async function queryVideoPage(params: {
  extraWhere: string;
  extraParams: unknown[];
  cursor: Keyset | null;
  privacy: "public" | "owner" | "any";
  ownerId?: string | null;
}): Promise<{ videos: FeedVideo[]; nextCursor: string | null }> {
  const live = await isLiveNeonSchema();
  const privacyParams: unknown[] = [];
  let publicFilter = live ? livePublicVideoFilter() : `AND v.privacy = 'public'`;
  if (params.privacy === "any") {
    publicFilter = "";
  } else if (params.privacy === "owner" && params.ownerId) {
    publicFilter = live
      ? liveOwnerVideoFilter(params.extraParams.length + 1)
      : `AND (v.privacy = 'public' OR v.user_id = $${params.extraParams.length + 1})`;
    privacyParams.push(params.ownerId);
  }
  const afterPrivacy = params.extraParams.length + privacyParams.length;
  const keyset = keysetWhere("v", params.cursor, afterPrivacy + 1);
  const limitIndex = afterPrivacy + keyset.params.length + 1;
  const sql = `${live ? liveFeedSelectSql(null) : VIDEO_SELECT}
    ${params.extraWhere}
    ${publicFilter}
    ${keyset.sql}
    ORDER BY v.created_at DESC, v.id DESC
    LIMIT $${limitIndex}`;
  const queryParams = [...params.extraParams, ...privacyParams, ...keyset.params, FEED_PAGE_SIZE + 1];
  const { rows } = await getPool().query(sql, queryParams);
  const hasMore = rows.length > FEED_PAGE_SIZE;
  const page = hasMore ? rows.slice(0, FEED_PAGE_SIZE) : rows;
  const last = page[page.length - 1] as { created_at?: Date; id?: string } | undefined;
  return {
    videos: page.map(mapFeedRow),
    nextCursor: hasMore && last?.created_at && last.id ? encodeKeyset(last.created_at, last.id) : null,
  };
}

/** OLD Following: followed creators only, newest first, public + media, not self. */
export async function queryFollowingPage(params: {
  viewerId: string;
  cursor: Keyset | null;
}): Promise<{ videos: FeedVideo[]; nextCursor: string | null }> {
  const keyset = keysetWhere("v", params.cursor, 2);
  const limitIndex = 2 + keyset.params.length;
  if (await isLiveNeonSchema()) {
    const { rows } = await getPool().query(
      `${liveFeedSelectSql(1)}
       ${livePublicVideoFilter()}
       ${liveBlockedVideoFilter(1)}
       AND v.user_id <> $1
       AND v.user_id IN (SELECT following_id FROM follows WHERE follower_id = $1)
       ${keyset.sql}
       ORDER BY v.created_at DESC, v.id DESC
       LIMIT $${limitIndex}`,
      [params.viewerId, ...keyset.params, FEED_PAGE_SIZE + 1],
    );
    const hasMore = rows.length > FEED_PAGE_SIZE;
    const page = hasMore ? rows.slice(0, FEED_PAGE_SIZE) : rows;
    const last = page[page.length - 1] as { created_at?: Date; id?: string } | undefined;
    return {
      videos: page.map(mapFeedRow),
      nextCursor: hasMore && last?.created_at && last.id ? encodeKeyset(last.created_at, last.id) : null,
    };
  }
  const { rows } = await getPool().query(
    `SELECT v.id, 'video'::text AS kind, v.user_id, u.username, u.display_name, u.avatar_url,
            v.caption, v.bunny_path AS media_url, v.thumbnail_url, NULL::uuid AS stream_id,
            (SELECT COUNT(*) FROM video_likes WHERE video_id = v.id) AS like_count,
            (SELECT COUNT(*) FROM comments WHERE video_id = v.id AND deleted_at IS NULL) AS comment_count,
            (SELECT COUNT(*) FROM video_saves WHERE video_id = v.id) AS save_count,
            (SELECT COUNT(*) FROM video_views WHERE video_id = v.id) AS view_count,
            EXISTS(SELECT 1 FROM live_streams s WHERE s.host_id = v.user_id AND s.status = 'live') AS is_live,
            v.created_at, v.privacy, v.sound_id, v.hashtags,
            EXISTS(SELECT 1 FROM video_likes vl WHERE vl.video_id = v.id AND vl.user_id = $1) AS liked,
            EXISTS(SELECT 1 FROM video_saves vs WHERE vs.video_id = v.id AND vs.user_id = $1) AS saved,
            TRUE AS is_following
     FROM videos v
     JOIN users u ON u.id = v.user_id
     WHERE v.deleted_at IS NULL AND u.deleted_at IS NULL AND v.privacy = 'public'
       AND btrim(COALESCE(v.bunny_path, '')) <> ''
       AND v.bunny_path NOT ILIKE '%/stories/%'
       AND v.user_id <> $1
       AND v.user_id IN (SELECT followee_id FROM follows WHERE follower_id = $1)
       AND (u.banned_until IS NULL OR u.banned_until < NOW())
       AND v.user_id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = $1)
       AND v.user_id NOT IN (SELECT blocker_id FROM blocks WHERE blocked_id = $1)
       ${keyset.sql}
     ORDER BY v.created_at DESC, v.id DESC
     LIMIT $${limitIndex}`,
    [params.viewerId, ...keyset.params, FEED_PAGE_SIZE + 1],
  );
  const hasMore = rows.length > FEED_PAGE_SIZE;
  const page = hasMore ? rows.slice(0, FEED_PAGE_SIZE) : rows;
  const last = page[page.length - 1] as { created_at?: Date; id?: string } | undefined;
  return {
    videos: page.map(mapFeedRow),
    nextCursor: hasMore && last?.created_at && last.id ? encodeKeyset(last.created_at, last.id) : null,
  };
}

/** OLD Friends: follow OR follower union (not mutual-only), newest first, not self. */
export async function queryFriendsPage(params: {
  viewerId: string;
  cursor: Keyset | null;
}): Promise<{ videos: FeedVideo[]; nextCursor: string | null }> {
  const keyset = keysetWhere("v", params.cursor, 2);
  const limitIndex = 2 + keyset.params.length;
  if (await isLiveNeonSchema()) {
    const { rows } = await getPool().query(
      `${liveFeedSelectSql(1)}
       ${livePublicVideoFilter()}
       ${liveBlockedVideoFilter(1)}
       AND v.user_id <> $1
       AND (
         v.user_id IN (SELECT following_id FROM follows WHERE follower_id = $1)
         OR v.user_id IN (SELECT follower_id FROM follows WHERE following_id = $1)
       )
       ${keyset.sql}
       ORDER BY v.created_at DESC, v.id DESC
       LIMIT $${limitIndex}`,
      [params.viewerId, ...keyset.params, FEED_PAGE_SIZE + 1],
    );
    const hasMore = rows.length > FEED_PAGE_SIZE;
    const page = hasMore ? rows.slice(0, FEED_PAGE_SIZE) : rows;
    const last = page[page.length - 1] as { created_at?: Date; id?: string } | undefined;
    return {
      videos: page.map(mapFeedRow),
      nextCursor: hasMore && last?.created_at && last.id ? encodeKeyset(last.created_at, last.id) : null,
    };
  }
  const { rows } = await getPool().query(
    `SELECT v.id, 'video'::text AS kind, v.user_id, u.username, u.display_name, u.avatar_url,
            v.caption, v.bunny_path AS media_url, v.thumbnail_url, NULL::uuid AS stream_id,
            (SELECT COUNT(*) FROM video_likes WHERE video_id = v.id) AS like_count,
            (SELECT COUNT(*) FROM comments WHERE video_id = v.id AND deleted_at IS NULL) AS comment_count,
            (SELECT COUNT(*) FROM video_saves WHERE video_id = v.id) AS save_count,
            (SELECT COUNT(*) FROM video_views WHERE video_id = v.id) AS view_count,
            EXISTS(SELECT 1 FROM live_streams s WHERE s.host_id = v.user_id AND s.status = 'live') AS is_live,
            v.created_at, v.privacy, v.sound_id, v.hashtags,
            EXISTS(SELECT 1 FROM video_likes vl WHERE vl.video_id = v.id AND vl.user_id = $1) AS liked,
            EXISTS(SELECT 1 FROM video_saves vs WHERE vs.video_id = v.id AND vs.user_id = $1) AS saved,
            EXISTS(SELECT 1 FROM follows f WHERE f.follower_id = $1 AND f.followee_id = v.user_id) AS is_following
     FROM videos v
     JOIN users u ON u.id = v.user_id
     WHERE v.deleted_at IS NULL AND u.deleted_at IS NULL AND v.privacy = 'public'
       AND btrim(COALESCE(v.bunny_path, '')) <> ''
       AND v.bunny_path NOT ILIKE '%/stories/%'
       AND v.user_id <> $1
       AND (
         v.user_id IN (SELECT followee_id FROM follows WHERE follower_id = $1)
         OR v.user_id IN (SELECT follower_id FROM follows WHERE followee_id = $1)
       )
       AND (u.banned_until IS NULL OR u.banned_until < NOW())
       AND v.user_id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = $1)
       AND v.user_id NOT IN (SELECT blocker_id FROM blocks WHERE blocked_id = $1)
       ${keyset.sql}
     ORDER BY v.created_at DESC, v.id DESC
     LIMIT $${limitIndex}`,
    [params.viewerId, ...keyset.params, FEED_PAGE_SIZE + 1],
  );
  const hasMore = rows.length > FEED_PAGE_SIZE;
  const page = hasMore ? rows.slice(0, FEED_PAGE_SIZE) : rows;
  const last = page[page.length - 1] as { created_at?: Date; id?: string } | undefined;
  return {
    videos: page.map(mapFeedRow),
    nextCursor: hasMore && last?.created_at && last.id ? encodeKeyset(last.created_at, last.id) : null,
  };
}

export function encodeOffsetCursor(offset: number): string {
  return `off:${Math.max(0, Math.floor(offset))}`;
}

export function decodeOffsetCursor(raw: unknown): number {
  if (typeof raw !== "string" || !raw.startsWith("off:")) return 0;
  const n = Number(raw.slice(4));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

export function cursorFromQuery(query: { cursor?: unknown }): Keyset | null {
  return decodeKeyset(typeof query.cursor === "string" ? query.cursor : null);
}

export async function queryForYouPage(params: {
  viewerId: string | null;
  page: number;
  limit: number;
}): Promise<ForYouFeedResponse> {
  const page = Math.max(1, Math.floor(params.page) || 1);
  const limit = Math.min(50, Math.max(1, Math.floor(params.limit) || 20));
  const offset = (page - 1) * limit;
  if (await isLiveNeonSchema()) {
    const { rows } = await getPool().query(
      `${liveFeedSelectSql(1)}
       ${livePublicVideoFilter()}
       AND ($1::text IS NULL OR NOT EXISTS (
         SELECT 1 FROM elix_video_not_interested ni
          WHERE ni.video_id = v.id AND ni.user_id = $1
       ))
       ${params.viewerId ? liveBlockedVideoFilter(1) : ""}
       AND (
         NOT EXISTS (SELECT 1 FROM elix_video_foryou_state s WHERE s.video_id = v.id)
         OR EXISTS (
           SELECT 1 FROM elix_video_foryou_state s
            WHERE s.video_id = v.id
              AND s.stage IN ('initial', 'promoted', 'reentered')
              AND COALESCE(s.guidelines_ok, TRUE) = TRUE
         )
       )
       ORDER BY
         COALESCE((SELECT ranking_score FROM elix_video_foryou_state s WHERE s.video_id = v.id), 0) DESC NULLS LAST,
         v.created_at DESC NULLS LAST
       LIMIT $2 OFFSET $3`,
      [params.viewerId, limit, offset],
    );
    const videos = rows.map((row) => mapFeedRow({ ...row, location: "For You" }));
    return forYouFeedEnvelope(videos, page, limit, offset, "postgres");
  }
  const { rows } = await getPool().query(
    `SELECT v.id, 'video'::text AS kind, v.user_id, u.username, u.display_name, u.avatar_url,
            v.caption, v.bunny_path AS media_url, v.thumbnail_url, NULL::uuid AS stream_id,
            (SELECT COUNT(*) FROM video_likes WHERE video_id = v.id) AS like_count,
            (SELECT COUNT(*) FROM comments WHERE video_id = v.id AND deleted_at IS NULL) AS comment_count,
            (SELECT COUNT(*) FROM video_saves WHERE video_id = v.id) AS save_count,
            (SELECT COUNT(*) FROM video_views WHERE video_id = v.id) AS view_count,
            EXISTS(SELECT 1 FROM live_streams s WHERE s.host_id = v.user_id AND s.status = 'live') AS is_live,
            v.created_at, v.privacy, v.sound_id, v.hashtags,
            EXISTS(SELECT 1 FROM video_likes vl WHERE vl.video_id = v.id AND vl.user_id = $1) AS liked,
            EXISTS(SELECT 1 FROM video_saves vs WHERE vs.video_id = v.id AND vs.user_id = $1) AS saved,
            EXISTS(SELECT 1 FROM follows f WHERE f.follower_id = $1 AND f.followee_id = v.user_id) AS is_following
     FROM videos v
     JOIN users u ON u.id = v.user_id
     WHERE v.deleted_at IS NULL AND u.deleted_at IS NULL AND v.privacy = 'public'
       AND (u.banned_until IS NULL OR u.banned_until < NOW())
       AND ($1::uuid IS NULL OR (
         v.user_id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = $1)
         AND v.user_id NOT IN (SELECT blocker_id FROM blocks WHERE blocked_id = $1)
       ))
     ORDER BY
       (SELECT COUNT(*) FROM video_likes WHERE video_id = v.id) DESC,
       (SELECT COUNT(*) FROM video_views WHERE video_id = v.id) DESC,
       v.created_at DESC,
       v.id DESC
     LIMIT $2 OFFSET $3`,
    [params.viewerId, limit, offset],
  );
  const videos = rows.map((row) => mapFeedRow({ ...row, location: "For You" }));
  return forYouFeedEnvelope(videos, page, limit, offset, "postgres");
}

const STEM_VIEWER_SELECT = `
  SELECT v.id, 'video'::text AS kind, v.user_id, u.username, u.display_name, u.avatar_url,
         v.caption, v.bunny_path AS media_url, v.thumbnail_url, NULL::uuid AS stream_id,
         (SELECT COUNT(*) FROM video_likes WHERE video_id = v.id) AS like_count,
         (SELECT COUNT(*) FROM comments WHERE video_id = v.id AND deleted_at IS NULL) AS comment_count,
         (SELECT COUNT(*) FROM video_saves WHERE video_id = v.id) AS save_count,
         (SELECT COUNT(*) FROM video_views WHERE video_id = v.id) AS view_count,
         EXISTS(SELECT 1 FROM live_streams s WHERE s.host_id = v.user_id AND s.status = 'live') AS is_live,
         v.created_at, v.privacy, v.sound_id, v.hashtags,
         EXISTS(SELECT 1 FROM video_likes vl WHERE vl.video_id = v.id AND vl.user_id = $1) AS liked,
         EXISTS(SELECT 1 FROM video_saves vs WHERE vs.video_id = v.id AND vs.user_id = $1) AS saved,
         EXISTS(SELECT 1 FROM follows f WHERE f.follower_id = $1 AND f.followee_id = v.user_id) AS is_following
  FROM videos v
  JOIN users u ON u.id = v.user_id
  WHERE v.deleted_at IS NULL AND u.deleted_at IS NULL AND v.privacy = 'public'
    AND btrim(COALESCE(v.bunny_path, '')) <> ''
    AND (u.banned_until IS NULL OR u.banned_until < NOW())
    AND ($1::uuid IS NULL OR (
      v.user_id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = $1)
      AND v.user_id NOT IN (SELECT blocker_id FROM blocks WHERE blocked_id = $1)
    ))
`;

export async function queryStemRanked(viewerId: string | null): Promise<FeedVideo[]> {
  if (await isLiveNeonSchema()) {
    const liveSelect = `${liveFeedSelectSql(1)}
      ${livePublicVideoFilter()}
      ${viewerId ? liveBlockedVideoFilter(1) : ""}`;
    const top = await getPool().query(
      `${liveSelect}
       ORDER BY COALESCE(v.views, 0) DESC, v.created_at DESC, v.id DESC
       LIMIT $2`,
      [viewerId, STEM_TOP_TRENDING],
    );
    const topItems = top.rows.map(mapFeedRow);
    const topIds = topItems.map((row) => row.id);
    const extra = await getPool().query(
      `${liveSelect}
       AND NOT (v.id = ANY($2::text[]))
       AND lower(COALESCE(v.description, '') || ' ' || COALESCE(v.hashtags::text, '')) LIKE ANY ($3::text[])
       ORDER BY COALESCE(v.views, 0) DESC, v.created_at DESC, v.id DESC
       LIMIT $4`,
      [viewerId, topIds, stemExtraLikePatterns(), STEM_EXTRA_SLOTS],
    );
    const seen = new Set(topIds);
    const extras = extra.rows.map(mapFeedRow).filter((row) => {
      if (seen.has(row.id)) return false;
      seen.add(row.id);
      return true;
    });
    return [...topItems, ...extras].slice(0, STEM_MAX);
  }
  const top = await getPool().query(
    `${STEM_VIEWER_SELECT}
     ORDER BY
       (SELECT COUNT(*) FROM video_views WHERE video_id = v.id) DESC,
       v.created_at DESC,
       v.id DESC
     LIMIT $2`,
    [viewerId, STEM_TOP_TRENDING],
  );
  const topItems = top.rows.map(mapFeedRow);
  const topIds = topItems.map((row) => row.id);
  const extra = await getPool().query(
    `${STEM_VIEWER_SELECT}
     AND NOT (v.id = ANY($2::uuid[]))
     AND lower(COALESCE(v.caption, '') || ' ' || COALESCE(array_to_string(v.hashtags, ' '), '')) LIKE ANY ($3::text[])
     ORDER BY
       (SELECT COUNT(*) FROM video_views WHERE video_id = v.id) DESC,
       v.created_at DESC,
       v.id DESC
     LIMIT $4`,
    [viewerId, topIds, stemExtraLikePatterns(), STEM_EXTRA_SLOTS],
  );
  const seen = new Set(topIds);
  const extras = extra.rows.map(mapFeedRow).filter((row) => {
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
  return [...topItems, ...extras].slice(0, STEM_MAX);
}

export async function queryStemPage(params: {
  viewerId: string | null;
  offset: number;
}): Promise<{ videos: FeedVideo[]; nextCursor: string | null }> {
  const offset = Math.max(0, Math.floor(params.offset));
  const ranked = await queryStemRanked(params.viewerId);
  const page = ranked.slice(offset, offset + FEED_PAGE_SIZE);
  return {
    videos: page,
    nextCursor: offset + FEED_PAGE_SIZE < ranked.length ? encodeOffsetCursor(offset + FEED_PAGE_SIZE) : null,
  };
}
