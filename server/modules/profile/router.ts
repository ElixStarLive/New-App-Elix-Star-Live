import { Router } from "express";
import { getPool } from "../../infra/postgres.js";
import { isLiveNeonSchema } from "../../infra/liveSchema.js";
import { requireAuth, type AuthedRequest } from "../../middleware/auth.js";
import { AppError } from "../../middleware/errors.js";
import { profileEditUserSchema, profilePatchBodySchema } from "../../../shared/contracts/social.js";
import { userPublicSchema as publicUser, canonicalizeUsername } from "../../../shared/contracts/auth.js";
import { registerUniqueProfileView } from "./views.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const router = Router();

export async function publicProfile(userId: string, viewerId?: string) {
  const live = await isLiveNeonSchema();
  const { rows } = await getPool().query<{
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
    bio: string;
    is_verified: boolean;
    followers: string;
    following: string;
    is_live: boolean;
    is_following: boolean;
    likes: string;
    views: string;
    banned_until: Date | null;
  }>(
    live
      ? `SELECT u.id, COALESCE(NULLIF(p.username, ''), u.username) AS username,
                COALESCE(NULLIF(p.display_name, ''), u.display_name, u.username) AS display_name,
                COALESCE(NULLIF(p.avatar_url, ''), u.avatar_url) AS avatar_url,
                COALESCE(p.bio, '') AS bio,
                COALESCE(p.is_verified, FALSE) AS is_verified,
                p.banned_until,
                (SELECT COUNT(*)::text FROM follows WHERE following_id = u.id) AS followers,
                (SELECT COUNT(*)::text FROM follows WHERE follower_id = u.id) AS following,
                EXISTS(SELECT 1 FROM live_streams s WHERE s.user_id = u.id AND s.is_live = TRUE AND s.ended_at IS NULL) AS is_live,
                CASE WHEN $2::text IS NULL THEN FALSE ELSE EXISTS(
                  SELECT 1 FROM follows WHERE follower_id = $2 AND following_id = u.id
                ) END AS is_following,
                COALESCE((SELECT SUM(COALESCE(v.likes, 0)) FROM videos v WHERE v.user_id = u.id), 0)::text AS likes,
                COALESCE(p.unique_profile_views, 0)::text AS views
           FROM elix_auth_users u
           LEFT JOIN profiles p ON p.user_id = u.id
          WHERE u.id = $1`
      : `SELECT u.id, u.username, u.display_name, u.avatar_url, u.bio, u.is_verified,
            u.banned_until,
            (SELECT COUNT(*)::text FROM follows WHERE followee_id = u.id) AS followers,
            (SELECT COUNT(*)::text FROM follows WHERE follower_id = u.id) AS following,
            EXISTS(SELECT 1 FROM live_streams s WHERE s.host_id = u.id AND s.status = 'live') AS is_live,
            CASE WHEN $2::uuid IS NULL THEN FALSE ELSE EXISTS(
              SELECT 1 FROM follows WHERE follower_id = $2 AND followee_id = u.id
            ) END AS is_following,
            (SELECT COUNT(*)::text FROM video_likes vl
              JOIN videos v ON v.id = vl.video_id
              WHERE v.user_id = u.id AND v.deleted_at IS NULL) AS likes,
            (SELECT COUNT(*)::text FROM profile_unique_views pv
              WHERE pv.profile_owner_user_id = u.id) AS views
     FROM users u
     WHERE u.id = $1 AND u.deleted_at IS NULL`,
    [userId, viewerId ?? null],
  );
  const row = rows[0];
  if (!row) throw new AppError("not_found", "User not found", 404);
  if (row.banned_until && row.banned_until > new Date()) {
    throw new AppError("not_found", "User not found", 404);
  }
  if (viewerId && viewerId !== row.id) {
    const blocked = live
      ? await getPool().query<{ n: number }>(
          `SELECT COUNT(*)::int AS n FROM elix_blocked_users
           WHERE (blocker_user_id = $1 AND blocked_user_id = $2)
              OR (blocker_user_id = $2 AND blocked_user_id = $1)`,
          [viewerId, row.id],
        )
      : await getPool().query<{ n: number }>(
          `SELECT COUNT(*)::int AS n FROM blocks
       WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)`,
          [viewerId, row.id],
        );
    if ((blocked.rows[0]?.n ?? 0) > 0) {
      throw new AppError("forbidden", "You cannot view this profile", 403);
    }
  }
  return publicUser.parse({
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    bio: row.bio,
    isVerified: row.is_verified,
    followerCount: Number(row.followers),
    followingCount: Number(row.following),
    likeCount: Number(row.likes),
    viewCount: Number(row.views),
    isLive: row.is_live,
    isFollowing: row.is_following,
  });
}

async function resolveUsernameId(username: string): Promise<string | null> {
  const { rows } = (await isLiveNeonSchema())
    ? await getPool().query<{ id: string }>(
        `SELECT u.id FROM elix_auth_users u
          LEFT JOIN profiles p ON p.user_id = u.id
         WHERE LOWER(COALESCE(p.username, u.username)) = $1
         LIMIT 1`,
        [username.toLowerCase()],
      )
    : await getPool().query<{ id: string }>(
        `SELECT id FROM users WHERE username_normalized = $1 AND deleted_at IS NULL LIMIT 1`,
        [username.toLowerCase()],
      );
  return rows[0]?.id ?? null;
}

async function resolveListedUserId(raw: string): Promise<string> {
  const value = String(raw || "");
  if (UUID_RE.test(value)) return value;
  const username = canonicalizeUsername(value).replace(/^@+/, "");
  if (!username) throw new AppError("not_found", "User not found", 404);
  const id = await resolveUsernameId(username);
  if (!id) throw new AppError("not_found", "User not found", 404);
  return id;
}

const LIVE_LIST_USER_SELECT = `
  SELECT u.id,
         COALESCE(NULLIF(p.username, ''), u.username) AS username,
         COALESCE(NULLIF(p.display_name, ''), u.display_name, u.username) AS display_name,
         COALESCE(NULLIF(p.avatar_url, ''), u.avatar_url) AS avatar_url,
         COALESCE(p.bio, '') AS bio,
         COALESCE(p.is_verified, FALSE) AS is_verified,
         (SELECT COUNT(*)::text FROM follows WHERE following_id = u.id) AS followers,
         (SELECT COUNT(*)::text FROM follows WHERE follower_id = u.id) AS following,
         EXISTS(SELECT 1 FROM live_streams s WHERE s.user_id = u.id AND s.is_live = TRUE AND s.ended_at IS NULL) AS is_live,
         CASE WHEN $2::text IS NULL THEN FALSE ELSE EXISTS(
           SELECT 1 FROM follows WHERE follower_id = $2 AND following_id = u.id
         ) END AS is_following,
         COALESCE((SELECT SUM(COALESCE(v.likes, 0)) FROM videos v WHERE v.user_id = u.id), 0)::text AS likes,
         COALESCE(p.unique_profile_views, 0)::text AS views
`;

async function listFollowerUsers(followeeId: string, viewerId?: string) {
  if (await isLiveNeonSchema()) {
    const { rows } = await getPool().query(
      `${LIVE_LIST_USER_SELECT}
         FROM follows f
         JOIN elix_auth_users u ON u.id = f.follower_id
         LEFT JOIN profiles p ON p.user_id = u.id
        WHERE f.following_id = $1
          AND (p.banned_until IS NULL OR p.banned_until <= NOW())
        ORDER BY f.created_at DESC NULLS LAST, u.id ASC`,
      [followeeId, viewerId ?? null],
    );
    return rows.map((row) =>
      publicUser.parse({
        id: String(row.id),
        username: String(row.username),
        displayName: String(row.display_name),
        avatarUrl: (row.avatar_url as string | null) ?? null,
        bio: String(row.bio ?? ""),
        isVerified: Boolean(row.is_verified),
        followerCount: Number(row.followers),
        followingCount: Number(row.following),
        likeCount: Number(row.likes),
        viewCount: Number(row.views),
        isLive: Boolean(row.is_live),
        isFollowing: Boolean(row.is_following),
      }),
    );
  }
  const { rows } = await getPool().query<{
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
    bio: string;
    is_verified: boolean;
    followers: string;
    following: string;
    is_live: boolean;
    is_following: boolean;
    likes: string;
    views: string;
  }>(
    `SELECT u.id, u.username, u.display_name, u.avatar_url, u.bio, u.is_verified,
            (SELECT COUNT(*)::text FROM follows WHERE followee_id = u.id) AS followers,
            (SELECT COUNT(*)::text FROM follows WHERE follower_id = u.id) AS following,
            EXISTS(SELECT 1 FROM live_streams s WHERE s.host_id = u.id AND s.status = 'live') AS is_live,
            CASE WHEN $2::uuid IS NULL THEN FALSE ELSE EXISTS(
              SELECT 1 FROM follows WHERE follower_id = $2 AND followee_id = u.id
            ) END AS is_following,
            (SELECT COUNT(*)::text FROM video_likes vl
              JOIN videos v ON v.id = vl.video_id
              WHERE v.user_id = u.id AND v.deleted_at IS NULL) AS likes,
            (SELECT COUNT(*)::text FROM profile_unique_views pv
              WHERE pv.profile_owner_user_id = u.id) AS views
     FROM follows f
     JOIN users u ON u.id = f.follower_id
     WHERE f.followee_id = $1
       AND u.deleted_at IS NULL
       AND (u.banned_until IS NULL OR u.banned_until <= NOW())
     ORDER BY f.created_at DESC, u.id ASC`,
    [followeeId, viewerId ?? null],
  );
  return rows.map((row) =>
    publicUser.parse({
      id: row.id,
      username: row.username,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
      bio: row.bio,
      isVerified: row.is_verified,
      followerCount: Number(row.followers),
      followingCount: Number(row.following),
      likeCount: Number(row.likes),
      viewCount: Number(row.views),
      isLive: row.is_live,
      isFollowing: row.is_following,
    }),
  );
}

async function listFollowingUsers(followerId: string, viewerId?: string) {
  if (await isLiveNeonSchema()) {
    const { rows } = await getPool().query(
      `${LIVE_LIST_USER_SELECT}
         FROM follows f
         JOIN elix_auth_users u ON u.id = f.following_id
         LEFT JOIN profiles p ON p.user_id = u.id
        WHERE f.follower_id = $1
          AND (p.banned_until IS NULL OR p.banned_until <= NOW())
        ORDER BY f.created_at DESC NULLS LAST, u.id ASC`,
      [followerId, viewerId ?? null],
    );
    return rows.map((row) =>
      publicUser.parse({
        id: String(row.id),
        username: String(row.username),
        displayName: String(row.display_name),
        avatarUrl: (row.avatar_url as string | null) ?? null,
        bio: String(row.bio ?? ""),
        isVerified: Boolean(row.is_verified),
        followerCount: Number(row.followers),
        followingCount: Number(row.following),
        likeCount: Number(row.likes),
        viewCount: Number(row.views),
        isLive: Boolean(row.is_live),
        isFollowing: Boolean(row.is_following),
      }),
    );
  }
  const { rows } = await getPool().query<{
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
    bio: string;
    is_verified: boolean;
    followers: string;
    following: string;
    is_live: boolean;
    is_following: boolean;
    likes: string;
    views: string;
  }>(
    `SELECT u.id, u.username, u.display_name, u.avatar_url, u.bio, u.is_verified,
            (SELECT COUNT(*)::text FROM follows WHERE followee_id = u.id) AS followers,
            (SELECT COUNT(*)::text FROM follows WHERE follower_id = u.id) AS following,
            EXISTS(SELECT 1 FROM live_streams s WHERE s.host_id = u.id AND s.status = 'live') AS is_live,
            CASE WHEN $2::uuid IS NULL THEN FALSE ELSE EXISTS(
              SELECT 1 FROM follows WHERE follower_id = $2 AND followee_id = u.id
            ) END AS is_following,
            (SELECT COUNT(*)::text FROM video_likes vl
              JOIN videos v ON v.id = vl.video_id
              WHERE v.user_id = u.id AND v.deleted_at IS NULL) AS likes,
            (SELECT COUNT(*)::text FROM profile_unique_views pv
              WHERE pv.profile_owner_user_id = u.id) AS views
     FROM follows f
     JOIN users u ON u.id = f.followee_id
     WHERE f.follower_id = $1
       AND u.deleted_at IS NULL
       AND (u.banned_until IS NULL OR u.banned_until <= NOW())
     ORDER BY f.created_at DESC, u.id ASC`,
    [followerId, viewerId ?? null],
  );
  return rows.map((row) =>
    publicUser.parse({
      id: row.id,
      username: row.username,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
      bio: row.bio,
      isVerified: row.is_verified,
      followerCount: Number(row.followers),
      followingCount: Number(row.following),
      likeCount: Number(row.likes),
      viewCount: Number(row.views),
      isLive: row.is_live,
      isFollowing: row.is_following,
    }),
  );
}

async function selfEditLinks(userId: string) {
  const { rows } = await getPool().query<{
    website: string;
    instagram: string;
    youtube: string;
    tiktok: string;
  }>(
    (await isLiveNeonSchema())
      ? `SELECT COALESCE(website, '') AS website, '' AS instagram, '' AS youtube, '' AS tiktok
           FROM profiles WHERE user_id = $1`
      : `SELECT website, instagram, youtube, tiktok FROM users WHERE id = $1`,
    [userId],
  );
  const row = rows[0];
  return {
    website: row?.website ?? "",
    instagram: row?.instagram ?? "",
    youtube: row?.youtube ?? "",
    tiktok: row?.tiktok ?? "",
  };
}

function usernameConflict(error: unknown): AppError | null {
  if (!error || typeof error !== "object" || !("code" in error)) return null;
  if (String((error as { code: unknown }).code) !== "23505") return null;
  return new AppError("conflict", "That username is already taken", 409);
}

router.get("/me", requireAuth, async (req: AuthedRequest, res) => {
  const user = await publicProfile(req.userId as string, req.userId);
  const links = await selfEditLinks(req.userId as string);
  res.json({ user: profileEditUserSchema.parse({ ...user, ...links }) });
});

router.patch("/me", requireAuth, async (req: AuthedRequest, res) => {
  const body = profilePatchBodySchema.parse(req.body);
  const sets: string[] = [];
  const values: unknown[] = [];
  if (body.displayName !== undefined) {
    values.push(body.displayName);
    sets.push(`display_name = $${values.length}`);
  }
  if (body.bio !== undefined) {
    values.push(body.bio);
    sets.push(`bio = $${values.length}`);
  }
  if (body.username !== undefined) {
    values.push(body.username);
    values.push(body.username.toLowerCase());
    sets.push(`username = $${values.length - 1}`);
    sets.push(`username_normalized = $${values.length}`);
  }
  if (body.website !== undefined) {
    values.push(body.website);
    sets.push(`website = $${values.length}`);
  }
  if (body.instagram !== undefined) {
    values.push(body.instagram);
    sets.push(`instagram = $${values.length}`);
  }
  if (body.youtube !== undefined) {
    values.push(body.youtube);
    sets.push(`youtube = $${values.length}`);
  }
  if (body.tiktok !== undefined) {
    values.push(body.tiktok);
    sets.push(`tiktok = $${values.length}`);
  }
  if (sets.length === 0) {
    const user = await publicProfile(req.userId as string, req.userId);
    const links = await selfEditLinks(req.userId as string);
    res.json({ user: profileEditUserSchema.parse({ ...user, ...links }) });
    return;
  }
  values.push(req.userId);
  try {
    if (await isLiveNeonSchema()) {
      // Live profiles do not own IG/YT/TikTok columns — fail closed (never silent drop).
      if (body.instagram !== undefined || body.youtube !== undefined || body.tiktok !== undefined) {
        throw new AppError(
          "validation_error",
          "Instagram, YouTube, and TikTok links are not editable on this server",
          400,
        );
      }
      const liveSets = sets.filter((part) => !part.includes("username_normalized"));
      if (liveSets.length > 0) {
        await getPool().query(
          `UPDATE profiles SET ${liveSets.join(", ")}, updated_at = NOW() WHERE user_id = $${values.length}`,
          values,
        );
      }
      if (body.username !== undefined || body.displayName !== undefined) {
        await getPool().query(
          `UPDATE elix_auth_users SET
             username = COALESCE($2, username),
             display_name = COALESCE($3, display_name)
           WHERE id = $1`,
          [req.userId, body.username ?? null, body.displayName ?? null],
        );
      }
    } else {
      await getPool().query(
        `UPDATE users SET ${sets.join(", ")}, updated_at = NOW() WHERE id = $${values.length}`,
        values,
      );
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    const conflict = usernameConflict(error);
    if (conflict) throw conflict;
    throw error;
  }
  const user = await publicProfile(req.userId as string, req.userId);
  const links = await selfEditLinks(req.userId as string);
  res.json({ user: profileEditUserSchema.parse({ ...user, ...links }) });
});

router.get("/by-username/:username", async (req: AuthedRequest, res) => {
  const username = canonicalizeUsername(String(req.params.username || "")).replace(/^@+/, "");
  if (!username) throw new AppError("not_found", "User not found", 404);
  const id = await resolveUsernameId(username);
  if (!id) throw new AppError("not_found", "User not found", 404);
  res.json({ user: await publicProfile(id, req.userId) });
});

router.post("/:userId/view", requireAuth, async (req: AuthedRequest, res) => {
  const userId = String(req.params.userId);
  if (!UUID_RE.test(userId)) throw new AppError("validation_error", "Invalid user", 400);
  await publicProfile(userId, req.userId);
  const result = await registerUniqueProfileView(userId, req.userId as string);
  res.json({ uniqueViews: result.uniqueViews, recorded: result.recorded });
});

router.get("/:userId", async (req: AuthedRequest, res) => {
  const userId = String(req.params.userId);
  if (!UUID_RE.test(userId)) throw new AppError("not_found", "User not found", 404);
  res.json({ user: await publicProfile(userId, req.userId) });
});

router.post("/:userId/follow", requireAuth, async (req: AuthedRequest, res) => {
  const userId = String(req.params.userId);
  if (userId === req.userId) throw new AppError("validation_error", "Cannot follow yourself", 400);
  await publicProfile(userId, req.userId);
  if (await isLiveNeonSchema()) {
    const inserted = await getPool().query(
      `INSERT INTO follows (follower_id, following_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING following_id`,
      [req.userId, userId],
    );
    if ((inserted.rowCount ?? 0) > 0) {
      await getPool().query(
        `UPDATE profiles SET followers = COALESCE(followers, 0) + 1, updated_at = NOW() WHERE user_id = $1`,
        [userId],
      );
      await getPool().query(
        `UPDATE profiles SET following = COALESCE(following, 0) + 1, updated_at = NOW() WHERE user_id = $1`,
        [req.userId],
      );
    }
  } else {
    await getPool().query(
      `INSERT INTO follows (follower_id, followee_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [req.userId, userId],
    );
  }
  res.json({ ok: true });
});

router.delete("/:userId/follow", requireAuth, async (req: AuthedRequest, res) => {
  if (await isLiveNeonSchema()) {
    const removed = await getPool().query(
      `DELETE FROM follows WHERE follower_id = $1 AND following_id = $2`,
      [req.userId, String(req.params.userId)],
    );
    if ((removed.rowCount ?? 0) > 0) {
      await getPool().query(
        `UPDATE profiles SET followers = GREATEST(COALESCE(followers, 0) - 1, 0), updated_at = NOW() WHERE user_id = $1`,
        [String(req.params.userId)],
      );
      await getPool().query(
        `UPDATE profiles SET following = GREATEST(COALESCE(following, 0) - 1, 0), updated_at = NOW() WHERE user_id = $1`,
        [req.userId],
      );
    }
  } else {
    await getPool().query(`DELETE FROM follows WHERE follower_id = $1 AND followee_id = $2`, [
      req.userId,
      String(req.params.userId),
    ]);
  }
  res.json({ ok: true });
});

router.post("/:userId/unfollow", requireAuth, async (req: AuthedRequest, res) => {
  if (await isLiveNeonSchema()) {
    const removed = await getPool().query(
      `DELETE FROM follows WHERE follower_id = $1 AND following_id = $2`,
      [req.userId, String(req.params.userId)],
    );
    if ((removed.rowCount ?? 0) > 0) {
      await getPool().query(
        `UPDATE profiles SET followers = GREATEST(COALESCE(followers, 0) - 1, 0), updated_at = NOW() WHERE user_id = $1`,
        [String(req.params.userId)],
      );
      await getPool().query(
        `UPDATE profiles SET following = GREATEST(COALESCE(following, 0) - 1, 0), updated_at = NOW() WHERE user_id = $1`,
        [req.userId],
      );
    }
  } else {
    await getPool().query(`DELETE FROM follows WHERE follower_id = $1 AND followee_id = $2`, [
      req.userId,
      String(req.params.userId),
    ]);
  }
  res.json({ ok: true });
});

router.get("/:userId/followers", async (req: AuthedRequest, res) => {
  const userId = await resolveListedUserId(String(req.params.userId));
  await publicProfile(userId, req.userId);
  res.json({ users: await listFollowerUsers(userId, req.userId) });
});

router.get("/:userId/following", async (req: AuthedRequest, res) => {
  const userId = await resolveListedUserId(String(req.params.userId));
  await publicProfile(userId, req.userId);
  res.json({ users: await listFollowingUsers(userId, req.userId) });
});

export default router;
