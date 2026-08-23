import type { QueryResultRow } from "pg";
import { getPool } from "../../infra/postgres.js";
import { isLiveNeonSchema, liveBlockedVideoFilter, liveFeedSelectSql, liveOwnerVideoFilter } from "../../infra/liveSchema.js";
import { mapFeedRow } from "../feed/query.js";
import type { FeedVideo } from "../../../shared/contracts/social.js";

export const VIDEO_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isVideoId(raw: string): boolean {
  return VIDEO_ID_RE.test(raw.trim());
}

export async function queryVideoDetail(viewerId: string | null, videoId: string): Promise<FeedVideo | null> {
  const id = videoId.trim();
  if (!isVideoId(id)) return null;
  if (await isLiveNeonSchema()) {
    const { rows } = await getPool().query(
      `${liveFeedSelectSql(1)}
       ${liveOwnerVideoFilter(1)}
       ${viewerId ? liveBlockedVideoFilter(1) : ""}
       AND v.id = $2`,
      [viewerId, id],
    );
    const row = rows[0] as QueryResultRow | undefined;
    return row ? mapFeedRow(row) : null;
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
            CASE WHEN $1::uuid IS NULL THEN FALSE ELSE EXISTS(SELECT 1 FROM video_likes vl WHERE vl.video_id = v.id AND vl.user_id = $1) END AS liked,
            CASE WHEN $1::uuid IS NULL THEN FALSE ELSE EXISTS(SELECT 1 FROM video_saves vs WHERE vs.video_id = v.id AND vs.user_id = $1) END AS saved,
            CASE WHEN $1::uuid IS NULL THEN FALSE ELSE EXISTS(SELECT 1 FROM follows f WHERE f.follower_id = $1 AND f.followee_id = v.user_id) END AS is_following
     FROM videos v
     JOIN users u ON u.id = v.user_id
     WHERE v.id = $2
       AND v.deleted_at IS NULL
       AND u.deleted_at IS NULL
       AND (u.banned_until IS NULL OR u.banned_until < NOW())
       AND btrim(COALESCE(v.bunny_path, '')) <> ''
       AND (v.privacy = 'public' OR v.user_id = $1)
       AND ($1::uuid IS NULL OR (
         v.user_id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = $1)
         AND v.user_id NOT IN (SELECT blocker_id FROM blocks WHERE blocked_id = $1)
       ))`,
    [viewerId, id],
  );
  const row = rows[0] as QueryResultRow | undefined;
  return row ? mapFeedRow(row) : null;
}

export const SAVED_PAGE_SIZE = 50;

export type SavedVideoHit = {
  id: string;
  thumbnailUrl: string | null;
  viewCount: number;
  mediaUrl: string;
  userId: string;
  username: string;
  displayName: string;
};

export function savedListPaging(query: { limit?: unknown; offset?: unknown }): { limit: number; offset: number } {
  const limitRaw = parseInt(String(query.limit ?? SAVED_PAGE_SIZE), 10);
  const offsetRaw = parseInt(String(query.offset ?? "0"), 10);
  const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : SAVED_PAGE_SIZE, 1), 100);
  const offset = Math.max(Number.isFinite(offsetRaw) ? offsetRaw : 0, 0);
  return { limit, offset };
}

export async function querySavedList(
  viewerId: string,
  offset: number,
  limit: number,
): Promise<{ videos: SavedVideoHit[]; limit: number; offset: number; hasMore: boolean }> {
  const paging = savedListPaging({ limit, offset });
  if (await isLiveNeonSchema()) {
    const { rows } = await getPool().query<{
      id: string;
      thumbnail_url: string | null;
      media_url: string;
      view_count: string | number;
      user_id: string;
      username: string;
      display_name: string;
    }>(
      `SELECT v.id::text AS id, NULLIF(v.thumbnail, '') AS thumbnail_url, v.url AS media_url,
              COALESCE(v.views, 0) AS view_count,
              v.user_id::text AS user_id,
              COALESCE(NULLIF(p.username, ''), v.username, '') AS username,
              COALESCE(NULLIF(p.display_name, ''), v.display_name, '') AS display_name
         FROM saves s
         JOIN videos v ON v.id = s.video_id
         LEFT JOIN profiles p ON p.user_id = v.user_id
        WHERE s.user_id = $1
          AND btrim(COALESCE(v.url, '')) <> ''
          AND (v.privacy IS NULL OR v.privacy <> 'private' OR v.user_id = $1)
          AND v.user_id NOT IN (SELECT blocked_user_id FROM elix_blocked_users WHERE blocker_user_id = $1)
          AND v.user_id NOT IN (SELECT blocker_user_id FROM elix_blocked_users WHERE blocked_user_id = $1)
        ORDER BY s.created_at DESC NULLS LAST, v.id DESC
        LIMIT $2 OFFSET $3`,
      [viewerId, paging.limit, paging.offset],
    );
    return {
      videos: rows.map((row) => ({
        id: row.id,
        thumbnailUrl: row.thumbnail_url,
        viewCount: Number(row.view_count ?? 0),
        mediaUrl: row.media_url,
        userId: row.user_id,
        username: row.username,
        displayName: row.display_name,
      })),
      limit: paging.limit,
      offset: paging.offset,
      hasMore: rows.length === paging.limit,
    };
  }
  const { rows } = await getPool().query<{
    id: string;
    thumbnail_url: string | null;
    media_url: string;
    view_count: string | number;
    user_id: string;
    username: string;
    display_name: string;
  }>(
    `SELECT v.id, v.thumbnail_url, v.bunny_path AS media_url,
            (SELECT COUNT(*) FROM video_views WHERE video_id = v.id) AS view_count,
            v.user_id, u.username, u.display_name
     FROM video_saves s
     JOIN videos v ON v.id = s.video_id
     JOIN users u ON u.id = v.user_id
     WHERE s.user_id = $1
       AND v.deleted_at IS NULL
       AND u.deleted_at IS NULL
       AND (u.banned_until IS NULL OR u.banned_until < NOW())
       AND btrim(COALESCE(v.bunny_path, '')) <> ''
       AND (v.privacy = 'public' OR v.user_id = $1)
       AND v.user_id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = $1)
       AND v.user_id NOT IN (SELECT blocker_id FROM blocks WHERE blocked_id = $1)
     ORDER BY s.created_at DESC, v.id DESC
     LIMIT $2 OFFSET $3`,
    [viewerId, paging.limit, paging.offset],
  );
  return {
    videos: rows.map((row) => ({
      id: row.id,
      thumbnailUrl: row.thumbnail_url,
      viewCount: Number(row.view_count ?? 0),
      mediaUrl: row.media_url,
      userId: row.user_id,
      username: row.username,
      displayName: row.display_name,
    })),
    limit: paging.limit,
    offset: paging.offset,
    hasMore: rows.length === paging.limit,
  };
}
