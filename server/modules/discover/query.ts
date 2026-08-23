import { getPool } from "../../infra/postgres.js";
import { isLiveNeonSchema, liveBlockedActorFilter, liveBlockedVideoFilter, liveFeedSelectSql, livePublicVideoFilter } from "../../infra/liveSchema.js";
import { exploreIndecentLikePatterns } from "../../../shared/stemEligibility.js";
import { mapFeedRow } from "../feed/query.js";
import type { FeedVideo } from "../../../shared/contracts/social.js";

function blockSql(userAlias: string, viewerIndex: number): string {
  return `AND ${userAlias} NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = $${viewerIndex})
          AND ${userAlias} NOT IN (SELECT blocker_id FROM blocks WHERE blocked_id = $${viewerIndex})`;
}

export type DiscoverHashtag = { tag: string; useCount: number };
export type DiscoverRanking = {
  rank: number;
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  totalCoins: number;
};
export type DiscoverSearchUser = {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  followerCount: number;
  isFollowing: boolean;
};

export async function queryDiscoverPage(viewerId: string | null): Promise<{
  trending: FeedVideo[];
  hashtags: DiscoverHashtag[];
  rankings: DiscoverRanking[];
}> {
  const [trending, hashtags, rankings] = await Promise.all([
    queryDiscoverTrending(viewerId),
    queryDiscoverHashtags(),
    queryDiscoverRankings(viewerId),
  ]);
  return { trending, hashtags, rankings };
}

export async function queryDiscoverTrending(viewerId: string | null): Promise<FeedVideo[]> {
  if (await isLiveNeonSchema()) {
    const { rows } = await getPool().query(
      `${liveFeedSelectSql(1)}
       ${livePublicVideoFilter()}
       ${viewerId ? liveBlockedVideoFilter(1) : ""}
       ORDER BY COALESCE(v.views, 0) DESC, v.created_at DESC, v.id DESC
       LIMIT 30`,
      [viewerId],
    );
    return rows.map(mapFeedRow);
  }
  const patterns = exploreIndecentLikePatterns();
  const params: unknown[] = [viewerId];
  const viewerSql = viewerId ? blockSql("v.user_id", 1) : "";
  const likeSql = patterns
    .map((word) => {
      params.push(word);
      return `lower(coalesce(v.caption,'') || ' ' || array_to_string(coalesce(v.hashtags, '{}'), ' ')) LIKE $${params.length}`;
    })
    .join(" OR ");
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
     WHERE v.deleted_at IS NULL AND u.deleted_at IS NULL AND v.privacy = 'public'
       AND btrim(COALESCE(v.bunny_path, '')) <> ''
       AND v.bunny_path NOT ILIKE '%/stories/%'
       AND (u.banned_until IS NULL OR u.banned_until < NOW())
       ${viewerSql}
       AND (${likeSql})
     ORDER BY (SELECT COUNT(*) FROM video_views WHERE video_id = v.id) DESC, v.created_at DESC, v.id DESC
     LIMIT 30`,
    params,
  );
  return rows.map(mapFeedRow);
}

export async function queryDiscoverHashtags(): Promise<DiscoverHashtag[]> {
  if (await isLiveNeonSchema()) {
    const { rows } = await getPool().query<{ tag: string; use_count: number }>(
      `SELECT regexp_replace(lower(tag), '^#', '') AS tag, COUNT(*)::int AS use_count
         FROM videos v
         CROSS JOIN LATERAL jsonb_array_elements_text(
           CASE WHEN jsonb_typeof(v.hashtags) = 'array' THEN v.hashtags ELSE '[]'::jsonb END
         ) AS tag
        WHERE (v.privacy IS NULL OR v.privacy <> 'private')
          AND btrim(COALESCE(v.url, '')) <> ''
        GROUP BY 1
        HAVING regexp_replace(lower(tag), '^#', '') <> ''
        ORDER BY use_count DESC, tag ASC
        LIMIT 50`,
    );
    return rows.map((row) => ({ tag: row.tag, useCount: Number(row.use_count) }));
  }
  const { rows } = await getPool().query<{ tag: string; use_count: number }>(
    `SELECT regexp_replace(lower(tag), '^#', '') AS tag, COUNT(*)::int AS use_count
     FROM videos v
     CROSS JOIN LATERAL unnest(v.hashtags) AS tag
     WHERE v.deleted_at IS NULL AND v.privacy = 'public'
       AND btrim(COALESCE(v.bunny_path, '')) <> ''
     GROUP BY 1
     HAVING regexp_replace(lower(tag), '^#', '') <> ''
     ORDER BY use_count DESC, tag ASC
     LIMIT 50`,
  );
  return rows.map((row) => ({ tag: row.tag, useCount: Number(row.use_count) }));
}

export async function queryDiscoverRankings(viewerId: string | null): Promise<DiscoverRanking[]> {
  if (await isLiveNeonSchema()) {
    const params: unknown[] = [];
    let viewerSql = "";
    if (viewerId) {
      params.push(viewerId);
      viewerSql = liveBlockedActorFilter("p.user_id", 1);
    }
    const { rows } = await getPool().query<{
      id: string;
      username: string;
      display_name: string;
      avatar_url: string | null;
      total_coins: string;
    }>(
      `SELECT p.user_id AS id, p.username, p.display_name, p.avatar_url,
              COALESCE(SUM(gt.coins), 0)::text AS total_coins
         FROM elix_gift_transactions gt
         JOIN profiles p ON p.user_id = gt.room_id
        WHERE gt.created_at > NOW() - interval '7 days'
          AND COALESCE(gt.gift_source, 'paid_coins') <> 'test_coins'
          AND (p.banned_until IS NULL OR p.banned_until < NOW())
          ${viewerSql}
        GROUP BY p.user_id, p.username, p.display_name, p.avatar_url
        ORDER BY COALESCE(SUM(gt.coins), 0) DESC, p.username ASC
        LIMIT 50`,
      params,
    );
    return rows.map((row, index) => ({
      rank: index + 1,
      userId: row.id,
      username: row.username,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
      totalCoins: Number(row.total_coins) || 0,
    }));
  }
  const params: unknown[] = [];
  let viewerSql = "";
  if (viewerId) {
    params.push(viewerId);
    viewerSql = blockSql("u.id", 1);
  }
  const { rows } = await getPool().query<{
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
    total_coins: string;
  }>(
    `SELECT u.id, u.username, u.display_name, u.avatar_url, COALESCE(SUM(gt.coin_cost), 0)::text AS total_coins
     FROM gift_transactions gt
     JOIN users u ON u.id = gt.recipient_id
     WHERE gt.created_at > NOW() - interval '7 days'
       AND gt.bucket <> 'test'
       AND u.deleted_at IS NULL
       AND (u.banned_until IS NULL OR u.banned_until < NOW())
       ${viewerSql}
     GROUP BY u.id
     ORDER BY COALESCE(SUM(gt.coin_cost), 0) DESC, u.username ASC
     LIMIT 50`,
    params,
  );
  return rows.map((row, index) => ({
    rank: index + 1,
    userId: row.id,
    username: row.username,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    totalCoins: Number(row.total_coins) || 0,
  }));
}

export async function queryDiscoverSearch(
  viewerId: string | null,
  q: string,
): Promise<{ users: DiscoverSearchUser[]; videos: FeedVideo[] }> {
  const like = `%${q.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
  if (await isLiveNeonSchema()) {
    const users = await getPool().query<{
      id: string;
      username: string;
      display_name: string;
      avatar_url: string | null;
      followers: string;
      is_following: boolean;
    }>(
      `SELECT u.id,
              COALESCE(NULLIF(p.username, ''), u.username) AS username,
              COALESCE(NULLIF(p.display_name, ''), u.display_name, u.username) AS display_name,
              COALESCE(NULLIF(p.avatar_url, ''), u.avatar_url) AS avatar_url,
              (SELECT COUNT(*)::text FROM follows WHERE following_id = u.id) AS followers,
              CASE WHEN $2::text IS NULL THEN FALSE ELSE EXISTS(
                SELECT 1 FROM follows WHERE follower_id = $2 AND following_id = u.id
              ) END AS is_following
         FROM elix_auth_users u
         LEFT JOIN profiles p ON p.user_id = u.id
        WHERE (p.banned_until IS NULL OR p.banned_until < NOW())
          AND (COALESCE(p.username, u.username) ILIKE $1 OR COALESCE(p.display_name, u.display_name) ILIKE $1)
          AND ($2::text IS NULL OR u.id <> $2)
          ${viewerId ? liveBlockedActorFilter("u.id", 2) : ""}
        ORDER BY COALESCE(p.username, u.username) ASC
        LIMIT 20`,
      [like, viewerId],
    );
    const videos = await getPool().query(
      `${liveFeedSelectSql(2)}
       ${livePublicVideoFilter()}
       ${viewerId ? liveBlockedVideoFilter(2) : ""}
       AND lower(COALESCE(v.description, '')) ILIKE $1
       ORDER BY v.created_at DESC
       LIMIT 20`,
      viewerId ? [like, viewerId] : [like],
    );
    return {
      users: users.rows.map((row) => ({
        userId: row.id,
        username: row.username,
        displayName: row.display_name,
        avatarUrl: row.avatar_url,
        followerCount: Number(row.followers),
        isFollowing: Boolean(row.is_following),
      })),
      videos: videos.rows.map(mapFeedRow),
    };
  }
  const users = await getPool().query<{
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
    followers: string;
    is_following: boolean;
  }>(
    `SELECT u.id, u.username, u.display_name, u.avatar_url,
            (SELECT COUNT(*)::text FROM follows WHERE followee_id = u.id) AS followers,
            CASE WHEN $2::uuid IS NULL THEN FALSE ELSE EXISTS(
              SELECT 1 FROM follows WHERE follower_id = $2 AND followee_id = u.id
            ) END AS is_following
     FROM users u
     WHERE u.deleted_at IS NULL
       AND (u.banned_until IS NULL OR u.banned_until < NOW())
       AND (u.username ILIKE $1 OR u.display_name ILIKE $1)
       AND ($2::uuid IS NULL OR u.id <> $2)
       ${viewerId ? blockSql("u.id", 2) : ""}
     ORDER BY u.username ASC
     LIMIT 20`,
    [like, viewerId],
  );

  const videos = await getPool().query(
    `SELECT v.id, 'video'::text AS kind, v.user_id, u.username, u.display_name, u.avatar_url,
            v.caption, v.bunny_path AS media_url, v.thumbnail_url, NULL::uuid AS stream_id,
            (SELECT COUNT(*) FROM video_likes WHERE video_id = v.id) AS like_count,
            (SELECT COUNT(*) FROM comments WHERE video_id = v.id AND deleted_at IS NULL) AS comment_count,
            (SELECT COUNT(*) FROM video_saves WHERE video_id = v.id) AS save_count,
            (SELECT COUNT(*) FROM video_views WHERE video_id = v.id) AS view_count,
            FALSE AS is_live, v.created_at, v.privacy, v.sound_id, v.hashtags,
            FALSE AS liked, FALSE AS saved, FALSE AS is_following
     FROM videos v
     JOIN users u ON u.id = v.user_id
     WHERE v.deleted_at IS NULL AND u.deleted_at IS NULL AND v.privacy = 'public'
       AND btrim(COALESCE(v.bunny_path, '')) <> ''
       AND coalesce(v.caption,'') ILIKE $1
       AND (u.banned_until IS NULL OR u.banned_until < NOW())
       ${viewerId ? blockSql("v.user_id", 2) : ""}
     ORDER BY v.created_at DESC
     LIMIT 20`,
    viewerId ? [like, viewerId] : [like],
  );

  return {
    users: users.rows.map((row) => ({
      userId: row.id,
      username: row.username,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
      followerCount: Number(row.followers) || 0,
      isFollowing: Boolean(row.is_following),
    })),
    videos: videos.rows.map(mapFeedRow),
  };
}
