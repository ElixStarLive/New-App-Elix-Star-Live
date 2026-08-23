import { getPool } from "../../infra/postgres.js";
import { isLiveNeonSchema, liveBlockedVideoFilter, liveFeedSelectSql, livePublicVideoFilter } from "../../infra/liveSchema.js";
import { mapFeedRow } from "../feed/query.js";
import type { FeedVideo } from "../../../shared/contracts/social.js";
import {
  escapeIlike,
  normalizeSearchCategory,
  type SearchBrowseCategory,
} from "../../../shared/searchCategories.js";

export type SearchUser = {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
};

function viewerBlockSql(userAlias: string, viewerIndex: number): string {
  return `AND ($${viewerIndex}::uuid IS NULL OR (
            ${userAlias} NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = $${viewerIndex})
            AND ${userAlias} NOT IN (SELECT blocker_id FROM blocks WHERE blocked_id = $${viewerIndex})
          ))`;
}

const VIDEO_VISIBLE = `
  v.deleted_at IS NULL AND u.deleted_at IS NULL AND v.privacy = 'public'
  AND btrim(COALESCE(v.bunny_path, '')) <> ''
  AND v.bunny_path NOT ILIKE '%/stories/%'
  AND (u.banned_until IS NULL OR u.banned_until < NOW())
`;

function videoSelect(viewerParam: string): string {
  return `SELECT v.id, 'video'::text AS kind, v.user_id, u.username, u.display_name, u.avatar_url,
            v.caption, v.bunny_path AS media_url, v.thumbnail_url, NULL::uuid AS stream_id,
            (SELECT COUNT(*) FROM video_likes WHERE video_id = v.id) AS like_count,
            (SELECT COUNT(*) FROM comments WHERE video_id = v.id AND deleted_at IS NULL) AS comment_count,
            (SELECT COUNT(*) FROM video_saves WHERE video_id = v.id) AS save_count,
            (SELECT COUNT(*) FROM video_views WHERE video_id = v.id) AS view_count,
            FALSE AS is_live, v.created_at, v.privacy, v.sound_id, v.hashtags,
            FALSE AS liked, FALSE AS saved, FALSE AS is_following
     FROM videos v
     JOIN users u ON u.id = v.user_id
     WHERE ${VIDEO_VISIBLE}
       ${viewerParam}`;
}

export async function querySearchPage(
  viewerId: string | null,
  rawQuery: string,
  rawCategory: string,
): Promise<{ users: SearchUser[]; videos: FeedVideo[] }> {
  const q = rawQuery.trim();
  if (!q) {
    return { users: [], videos: await querySearchBrowse(viewerId, normalizeSearchCategory(rawCategory)) };
  }
  const [users, videos] = await Promise.all([querySearchUsers(viewerId, q), querySearchVideos(viewerId, q)]);
  return { users, videos };
}

export async function querySearchUsers(viewerId: string | null, q: string): Promise<SearchUser[]> {
  const like = `%${escapeIlike(q)}%`;
  if (await isLiveNeonSchema()) {
    const { rows } = await getPool().query<{
      id: string;
      username: string;
      display_name: string;
      avatar_url: string | null;
    }>(
      `SELECT u.id,
              COALESCE(NULLIF(p.username, ''), u.username) AS username,
              COALESCE(NULLIF(p.display_name, ''), u.display_name, u.username) AS display_name,
              COALESCE(NULLIF(p.avatar_url, ''), u.avatar_url) AS avatar_url
         FROM elix_auth_users u
         LEFT JOIN profiles p ON p.user_id = u.id
        WHERE (p.banned_until IS NULL OR p.banned_until < NOW())
          AND (COALESCE(p.username, u.username) ILIKE $1 OR COALESCE(p.display_name, u.display_name) ILIKE $1)
          AND ($2::text IS NULL OR (
            u.id NOT IN (SELECT blocked_user_id FROM elix_blocked_users WHERE blocker_user_id = $2)
            AND u.id NOT IN (SELECT blocker_user_id FROM elix_blocked_users WHERE blocked_user_id = $2)
          ))
        ORDER BY COALESCE(p.username, u.username) ASC
        LIMIT 20`,
      [like, viewerId],
    );
    return rows.map((row) => ({
      userId: row.id,
      username: row.username,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
    }));
  }
  const { rows } = await getPool().query<{
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
  }>(
    `SELECT u.id, u.username, u.display_name, u.avatar_url
     FROM users u
     WHERE u.deleted_at IS NULL
       AND (u.banned_until IS NULL OR u.banned_until < NOW())
       AND (u.username ILIKE $1 OR u.display_name ILIKE $1)
       ${viewerBlockSql("u.id", 2)}
     ORDER BY u.username ASC
     LIMIT 20`,
    [like, viewerId],
  );
  return rows.map((row) => ({
    userId: row.id,
    username: row.username,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
  }));
}

export async function querySearchVideos(viewerId: string | null, q: string): Promise<FeedVideo[]> {
  const like = `%${escapeIlike(q.toLowerCase())}%`;
  if (await isLiveNeonSchema()) {
    const { rows } = await getPool().query(
      `${liveFeedSelectSql(2)}
       ${livePublicVideoFilter()}
       ${viewerId ? liveBlockedVideoFilter(2) : ""}
       AND (
         lower(COALESCE(v.description, '')) LIKE $1
         OR lower(COALESCE(v.hashtags::text, '')) LIKE $1
       )
       ORDER BY v.created_at DESC, v.id DESC
       LIMIT 30`,
      [like, viewerId],
    );
    return rows.map(mapFeedRow);
  }
  const { rows } = await getPool().query(
    `${videoSelect(viewerBlockSql("v.user_id", 2))}
       AND (
         lower(coalesce(v.caption, '')) LIKE $1
         OR EXISTS (
           SELECT 1 FROM unnest(coalesce(v.hashtags, '{}')) AS tag
           WHERE lower(tag) LIKE $1
         )
       )
     ORDER BY v.created_at DESC, v.id DESC
     LIMIT 30`,
    [like, viewerId],
  );
  return rows.map(mapFeedRow);
}

export async function querySearchBrowse(
  viewerId: string | null,
  category: SearchBrowseCategory,
): Promise<FeedVideo[]> {
  const params: unknown[] = [viewerId];
  const viewerSql = viewerBlockSql("v.user_id", 1);
  let extra = "";
  let limit = 60;
  let order = `v.created_at DESC, v.id DESC`;

  if (category === "Trending") {
    limit = 30;
    order = `(SELECT COUNT(*) FROM video_views WHERE video_id = v.id) DESC, v.created_at DESC, v.id DESC`;
  } else if (category === "For You") {
    limit = 30;
    order = `(SELECT COUNT(*) FROM video_likes WHERE video_id = v.id) DESC, (SELECT COUNT(*) FROM video_views WHERE video_id = v.id) DESC, v.created_at DESC, v.id DESC`;
  } else if (category !== "All") {
    limit = 30;
    params.push(`%${escapeIlike(category.toLowerCase())}%`);
    extra = `AND (
      lower(coalesce(v.caption, '')) LIKE $2
      OR EXISTS (
        SELECT 1 FROM unnest(coalesce(v.hashtags, '{}')) AS tag
        WHERE lower(tag) LIKE $2
      )
    )`;
  }

  if (await isLiveNeonSchema()) {
    const liveExtra =
      category !== "All" && category !== "Trending" && category !== "For You"
        ? `AND (
      lower(COALESCE(v.description, '')) LIKE $2
      OR lower(COALESCE(v.hashtags::text, '')) LIKE $2
    )`
        : "";
    const liveOrder =
      category === "Trending"
        ? `COALESCE(v.views, 0) DESC, v.created_at DESC, v.id DESC`
        : category === "For You"
          ? `COALESCE(v.likes, 0) DESC, COALESCE(v.views, 0) DESC, v.created_at DESC, v.id DESC`
          : `v.created_at DESC, v.id DESC`;
    const { rows } = await getPool().query(
      `${liveFeedSelectSql(1)}
       ${livePublicVideoFilter()}
       ${viewerId ? liveBlockedVideoFilter(1) : ""}
       ${liveExtra}
       ORDER BY ${liveOrder}
       LIMIT ${limit}`,
      params,
    );
    const videos = rows.map(mapFeedRow);
    if (videos.length === 0 && category !== "All") {
      return querySearchBrowse(viewerId, "All");
    }
    return videos;
  }
  const { rows } = await getPool().query(
    `${videoSelect(viewerSql)}
       ${extra}
     ORDER BY ${order}
     LIMIT ${limit}`,
    params,
  );
  const videos = rows.map(mapFeedRow);
  if (videos.length === 0 && category !== "All") {
    return querySearchBrowse(viewerId, "All");
  }
  return videos;
}
