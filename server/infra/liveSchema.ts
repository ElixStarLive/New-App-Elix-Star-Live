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

const relationCache = new Map<string, boolean>();

/** Probe public.table existence (cached per process). */
export async function publicTableExists(tableName: string): Promise<boolean> {
  const key = tableName.trim().toLowerCase();
  if (!/^[a-z_][a-z0-9_]*$/.test(key)) return false;
  const hit = relationCache.get(key);
  if (hit != null) return hit;
  const { getPool } = await import("./postgres.js");
  const { rows } = await getPool().query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = $1
     ) AS exists`,
    [key],
  );
  const exists = Boolean(rows[0]?.exists);
  relationCache.set(key, exists);
  return exists;
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
         v.description AS caption, v.url AS media_url, v.url,
         NULLIF(v.thumbnail, '') AS thumbnail_url, NULLIF(v.thumbnail, '') AS thumbnail,
         NULL::text AS stream_id,
         COALESCE(v.likes, 0) AS like_count, COALESCE(v.likes, 0) AS likes,
         COALESCE(v.comments, 0) AS comment_count, COALESCE(v.comments, 0) AS comments,
         COALESCE(v.saves, 0) AS save_count, COALESCE(v.saves, 0) AS saves,
         COALESCE(v.views, 0) AS view_count, COALESCE(v.views, 0) AS views,
         COALESCE(v.shares, 0) AS shares,
         v.duration, v.duration AS duration_seconds, v.music,
         (COALESCE(v.views,0) + COALESCE(v.likes,0)*2 + COALESCE(v.comments,0) + COALESCE(v.shares,0))::int AS engagement_score,
         COALESCE(p.level, 1) AS level,
         COALESCE(p.is_verified, FALSE) AS is_verified,
         COALESCE(p.followers, 0) AS followers,
         COALESCE(p.following, 0) AS following,
         (json_build_object(
           'user_id', p.user_id,
           'username', COALESCE(NULLIF(p.username, ''), v.username, ''),
           'display_name', COALESCE(NULLIF(p.display_name, ''), v.display_name, ''),
           'avatar_url', NULLIF(COALESCE(NULLIF(p.avatar_url, ''), NULLIF(v.avatar, '')), ''),
           'is_creator', COALESCE(p.is_verified, false),
           'followers', COALESCE(p.followers, 0),
           'following', COALESCE(p.following, 0),
           'level', COALESCE(p.level, 1)
         ))::json AS user,
         EXISTS(
           SELECT 1 FROM live_streams ls
           WHERE ls.user_id = v.user_id AND ls.is_live = TRUE AND ls.ended_at IS NULL
         ) AS is_live,
         v.created_at, COALESCE(v.privacy, 'public') AS privacy,
         NULLIF(v.music, '') AS sound_id, v.hashtags,
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
