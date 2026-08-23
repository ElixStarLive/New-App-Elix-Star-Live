import pg from "pg";

let cached: boolean | null = process.env.NODE_ENV === "test" ? false : null;

export function setLiveNeonSchema(value: boolean): void {
  cached = value;
}

async function readLiveMarker(client: Pick<pg.Pool, "query">): Promise<boolean> {
  const { rows } = await client.query<{ has_auth: boolean; has_bunny: boolean }>(
    `SELECT
       EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'elix_auth_users'
       ) AS has_auth,
       EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'videos' AND column_name = 'bunny_path'
       ) AS has_bunny`,
  );
  return Boolean(rows[0]?.has_auth) && !rows[0]?.has_bunny;
}

export async function detectLiveNeonSchema(databaseUrl: string): Promise<boolean> {
  if (cached != null) return cached;
  const needsSsl = databaseUrl.includes("neon.tech") || databaseUrl.includes("sslmode=require");
  const probe = new pg.Pool({
    connectionString: databaseUrl,
    max: 1,
    ssl: needsSsl ? { rejectUnauthorized: process.env.PG_SSL_REJECT_UNAUTHORIZED !== "false" } : undefined,
  });
  try {
    const live = await readLiveMarker(probe);
    cached = live;
    return live;
  } finally {
    await probe.end();
  }
}

export async function isLiveNeonSchema(): Promise<boolean> {
  if (cached != null) return cached;
  const { getPool } = await import("./postgres.js");
  cached = await readLiveMarker(getPool());
  return cached;
}

export const LIVE_AUTH_USER_SELECT = `
  SELECT u.id, u.email, u.username,
         COALESCE(NULLIF(p.display_name, ''), NULLIF(u.display_name, ''), u.username) AS display_name,
         COALESCE(NULLIF(p.avatar_url, ''), NULLIF(u.avatar_url, '')) AS avatar_url,
         COALESCE(p.bio, '') AS bio,
         COALESCE(p.is_verified, FALSE) AS is_verified,
         COALESCE(p.is_admin, FALSE) AS is_admin,
         u.email_confirmed_at,
         u.created_at,
         u.password_hash,
         p.banned_until
    FROM elix_auth_users u
    LEFT JOIN profiles p ON p.user_id = u.id
`;

export function liveViewerFlagsSql(viewerParam: number | null): string {
  if (viewerParam == null) {
    return "FALSE AS liked, FALSE AS saved, FALSE AS is_following";
  }
  return `
    CASE WHEN $${viewerParam}::text IS NULL THEN FALSE ELSE EXISTS(SELECT 1 FROM likes l WHERE l.video_id = v.id AND l.user_id = $${viewerParam}) END AS liked,
    CASE WHEN $${viewerParam}::text IS NULL THEN FALSE ELSE EXISTS(SELECT 1 FROM saves sv WHERE sv.video_id = v.id AND sv.user_id = $${viewerParam}) END AS saved,
    CASE WHEN $${viewerParam}::text IS NULL THEN FALSE ELSE EXISTS(SELECT 1 FROM follows f WHERE f.follower_id = $${viewerParam} AND f.following_id = v.user_id) END AS is_following
  `;
}

export function liveFeedSelectSql(viewerParam: number | null = null): string {
  return `
  SELECT v.id::text AS id, 'video'::text AS kind, v.user_id::text AS user_id,
         COALESCE(NULLIF(p.username, ''), v.username, '') AS username,
         COALESCE(NULLIF(p.display_name, ''), v.display_name, '') AS display_name,
         NULLIF(COALESCE(NULLIF(p.avatar_url, ''), NULLIF(v.avatar, '')), '') AS avatar_url,
         v.description AS caption, v.url AS media_url,
         NULLIF(v.thumbnail, '') AS thumbnail_url, NULL::text AS stream_id,
         COALESCE(v.likes, 0) AS like_count,
         COALESCE(v.comments, 0) AS comment_count,
         COALESCE(v.saves, 0) AS save_count,
         COALESCE(v.views, 0) AS view_count,
         EXISTS(
           SELECT 1 FROM live_streams ls
           WHERE ls.user_id = v.user_id AND ls.is_live = TRUE AND ls.ended_at IS NULL
         ) AS is_live,
         v.created_at, COALESCE(v.privacy, 'public') AS privacy,
         NULL::text AS sound_id, v.hashtags,
         ${liveViewerFlagsSql(viewerParam)}
    FROM videos v
    LEFT JOIN profiles p ON p.user_id = v.user_id
   WHERE btrim(COALESCE(v.url, '')) <> ''
     AND v.url NOT ILIKE '%/stories/%'
     AND (p.banned_until IS NULL OR p.banned_until < NOW())
`;
}

export const LIVE_FEED_VIDEO_SELECT = liveFeedSelectSql(null);

export function livePublicVideoFilter(): string {
  return `AND (v.privacy IS NULL OR v.privacy <> 'private')`;
}

export function liveOwnerVideoFilter(paramIndex: number): string {
  return `AND ((v.privacy IS NULL OR v.privacy <> 'private') OR v.user_id = $${paramIndex})`;
}

export function liveBlockedVideoFilter(viewerParam: number): string {
  return liveBlockedActorFilter("v.user_id", viewerParam);
}

export function liveBlockedActorFilter(actorAlias: string, viewerParam: number): string {
  return `
    AND ${actorAlias} NOT IN (SELECT blocked_user_id FROM elix_blocked_users WHERE blocker_user_id = $${viewerParam})
    AND ${actorAlias} NOT IN (SELECT blocker_user_id FROM elix_blocked_users WHERE blocked_user_id = $${viewerParam})
  `;
}
