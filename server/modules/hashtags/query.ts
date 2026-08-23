import { getPool } from "../../infra/postgres.js";
import {
  isLiveNeonSchema,
  liveBlockedVideoFilter,
  liveFeedSelectSql,
  livePublicVideoFilter,
} from "../../infra/liveSchema.js";
import { normalizeHashtag } from "../../../shared/hashtag.js";
import { mapFeedRow } from "../feed/query.js";

export const HASHTAG_VIDEO_LIMIT = 100;

export type HashtagVideo = {
  id: string;
  thumbnailUrl: string | null;
  viewCount: number;
};

export type HashtagPage = {
  tag: string;
  useCount: number;
  videos: HashtagVideo[];
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

const TAG_MATCH = `
  EXISTS (
    SELECT 1 FROM unnest(coalesce(v.hashtags, '{}')) AS tag
    WHERE lower(regexp_replace(tag, '^#', '')) = $1
  )
`;

const LIVE_TAG_MATCH = `
  jsonb_typeof(v.hashtags) = 'array'
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(v.hashtags) AS h
    WHERE lower(regexp_replace(h, '^#', '')) = $1
  )
`;

function hashtagVideoFromFeed(row: ReturnType<typeof mapFeedRow>): HashtagVideo {
  return {
    id: row.id,
    thumbnailUrl: row.thumbnail || null,
    viewCount: row.stats.views,
  };
}

export async function queryHashtagPage(viewerId: string | null, rawTag: string): Promise<HashtagPage> {
  const tag = normalizeHashtag(rawTag);
  if (!tag) return { tag: "", useCount: 0, videos: [] };

  if (await isLiveNeonSchema()) {
    const params = [tag, viewerId];
    const block = viewerId ? liveBlockedVideoFilter(2) : "";
    const [countRes, videoRes] = await Promise.all([
      getPool().query<{ c: string }>(
        `SELECT COUNT(*)::text AS c
           FROM videos v
           LEFT JOIN profiles p ON p.user_id = v.user_id
          WHERE btrim(COALESCE(v.url, '')) <> ''
            AND v.url NOT ILIKE '%/stories/%'
            AND (v.privacy IS NULL OR v.privacy <> 'private')
            AND (p.banned_until IS NULL OR p.banned_until < NOW())
            ${block}
            AND ${LIVE_TAG_MATCH}`,
        params,
      ),
      getPool().query(
        `${liveFeedSelectSql(2)}
         ${livePublicVideoFilter()}
         ${block}
         AND ${LIVE_TAG_MATCH}
         ORDER BY COALESCE(v.views, 0) DESC, v.created_at DESC, v.id DESC
         LIMIT ${HASHTAG_VIDEO_LIMIT}`,
        params,
      ),
    ]);

    return {
      tag,
      useCount: Number(countRes.rows[0]?.c ?? 0),
      videos: videoRes.rows.map(mapFeedRow).map(hashtagVideoFromFeed),
    };
  }

  const params = [tag, viewerId];
  const block = viewerBlockSql("v.user_id", 2);
  const [countRes, videoRes] = await Promise.all([
    getPool().query<{ c: string }>(
      `SELECT COUNT(*)::text AS c
       FROM videos v
       JOIN users u ON u.id = v.user_id
       WHERE ${VIDEO_VISIBLE}
         ${block}
         AND ${TAG_MATCH}`,
      params,
    ),
    getPool().query<{ id: string; thumbnail_url: string | null; view_count: string }>(
      `SELECT v.id, v.thumbnail_url,
              (SELECT COUNT(*) FROM video_views WHERE video_id = v.id)::text AS view_count
       FROM videos v
       JOIN users u ON u.id = v.user_id
       WHERE ${VIDEO_VISIBLE}
         ${block}
         AND ${TAG_MATCH}
       ORDER BY (SELECT COUNT(*) FROM video_views WHERE video_id = v.id) DESC, v.created_at DESC, v.id DESC
       LIMIT ${HASHTAG_VIDEO_LIMIT}`,
      params,
    ),
  ]);

  return {
    tag,
    useCount: Number(countRes.rows[0]?.c ?? 0),
    videos: videoRes.rows.map((row) => ({
      id: row.id,
      thumbnailUrl: row.thumbnail_url,
      viewCount: Number(row.view_count ?? 0),
    })),
  };
}
