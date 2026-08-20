import type { QueryResultRow } from "pg";
import { getPool } from "../../infra/postgres.js";
import { decodeKeyset, encodeKeyset, FEED_PAGE_SIZE, keysetWhere, type Keyset } from "../../lib/cursor.js";
import type { FeedItem } from "../../../shared/contracts/social.js";

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

export function mapFeedRow(row: QueryResultRow): FeedItem {
  return {
    id: String(row.id),
    kind: row.kind as "video" | "live",
    userId: String(row.user_id),
    username: String(row.username),
    displayName: String(row.display_name),
    avatarUrl: (row.avatar_url as string | null) ?? null,
    caption: typeof row.caption === "string" ? row.caption : undefined,
    mediaUrl: typeof row.media_url === "string" ? row.media_url : undefined,
    thumbnailUrl: (row.thumbnail_url as string | null) ?? null,
    streamId: row.stream_id ? String(row.stream_id) : undefined,
    likeCount: Number(row.like_count ?? 0),
    commentCount: Number(row.comment_count ?? 0),
    saveCount: Number(row.save_count ?? 0),
    viewCount: Number(row.view_count ?? 0),
    soundId: row.sound_id ? String(row.sound_id) : null,
    isLive: Boolean(row.is_live),
    liked: Boolean(row.liked),
    saved: Boolean(row.saved),
    isFollowing: Boolean(row.is_following),
    hashtags: Array.isArray(row.hashtags)
      ? row.hashtags.filter((tag: unknown): tag is string => typeof tag === "string" && tag.length > 0)
      : [],
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : undefined,
  };
}

export async function queryVideoPage(params: {
  extraWhere: string;
  extraParams: unknown[];
  cursor: Keyset | null;
  privacy: "public" | "owner" | "any";
  ownerId?: string | null;
}): Promise<{ items: FeedItem[]; nextCursor: string | null }> {
  const privacyParams: unknown[] = [];
  let publicFilter = `AND v.privacy = 'public'`;
  if (params.privacy === "any") {
    publicFilter = "";
  } else if (params.privacy === "owner" && params.ownerId) {
    publicFilter = `AND (v.privacy = 'public' OR v.user_id = $${params.extraParams.length + 1})`;
    privacyParams.push(params.ownerId);
  }
  const afterPrivacy = params.extraParams.length + privacyParams.length;
  const keyset = keysetWhere("v", params.cursor, afterPrivacy + 1);
  const limitIndex = afterPrivacy + keyset.params.length + 1;
  const sql = `${VIDEO_SELECT}
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
    items: page.map(mapFeedRow),
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
  offset: number;
}): Promise<{ items: FeedItem[]; nextCursor: string | null }> {
  const offset = Math.max(0, Math.floor(params.offset));
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
    [params.viewerId, FEED_PAGE_SIZE + 1, offset],
  );
  const hasMore = rows.length > FEED_PAGE_SIZE;
  const page = hasMore ? rows.slice(0, FEED_PAGE_SIZE) : rows;
  return {
    items: page.map(mapFeedRow),
    nextCursor: hasMore ? encodeOffsetCursor(offset + FEED_PAGE_SIZE) : null,
  };
}
