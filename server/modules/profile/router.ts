import { Router } from "express";
import { getPool } from "../../infra/postgres.js";
import { requireAuth, type AuthedRequest } from "../../middleware/auth.js";
import { AppError } from "../../middleware/errors.js";
import { profilePatchBodySchema } from "../../../shared/contracts/social.js";
import { userPublicSchema as publicUser, canonicalizeUsername } from "../../../shared/contracts/auth.js";

const router = Router();

async function publicProfile(userId: string, viewerId?: string) {
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
            (SELECT COUNT(*)::text FROM video_views vv
              JOIN videos v ON v.id = vv.video_id
              WHERE v.user_id = u.id AND v.deleted_at IS NULL) AS views
     FROM users u
     WHERE u.id = $1 AND u.deleted_at IS NULL`,
    [userId, viewerId ?? null],
  );
  const row = rows[0];
  if (!row) throw new AppError("not_found", "User not found", 404);
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

router.get("/me", requireAuth, async (req: AuthedRequest, res) => {
  res.json({ user: await publicProfile(req.userId as string) });
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
    values.push(canonicalizeUsername(body.username));
    values.push(canonicalizeUsername(body.username).toLowerCase());
    sets.push(`username = $${values.length - 1}`);
    sets.push(`username_normalized = $${values.length}`);
  }
  if (sets.length === 0) {
    res.json({ user: await publicProfile(req.userId as string) });
    return;
  }
  values.push(req.userId);
  await getPool().query(
    `UPDATE users SET ${sets.join(", ")}, updated_at = NOW() WHERE id = $${values.length}`,
    values,
  );
  res.json({ user: await publicProfile(req.userId as string) });
});

router.get("/:userId", async (req: AuthedRequest, res) => {
  const userId = String(req.params.userId);
  res.json({ user: await publicProfile(userId, req.userId) });
});

router.post("/:userId/follow", requireAuth, async (req: AuthedRequest, res) => {
  const userId = String(req.params.userId);
  if (userId === req.userId) throw new AppError("validation_error", "Cannot follow yourself", 400);
  await getPool().query(
    `INSERT INTO follows (follower_id, followee_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [req.userId, userId],
  );
  res.json({ ok: true });
});

router.delete("/:userId/follow", requireAuth, async (req: AuthedRequest, res) => {
  await getPool().query(`DELETE FROM follows WHERE follower_id = $1 AND followee_id = $2`, [
    req.userId,
    String(req.params.userId),
  ]);
  res.json({ ok: true });
});

router.get("/:userId/followers", async (req, res) => {
  const { rows } = await getPool().query<{ id: string }>(
    `SELECT follower_id AS id FROM follows WHERE followee_id = $1`,
    [String(req.params.userId)],
  );
  const users = [];
  for (const row of rows) users.push(await publicProfile(row.id));
  res.json({ users });
});

router.get("/:userId/following", async (req, res) => {
  const { rows } = await getPool().query<{ id: string }>(
    `SELECT followee_id AS id FROM follows WHERE follower_id = $1`,
    [String(req.params.userId)],
  );
  const users = [];
  for (const row of rows) users.push(await publicProfile(row.id));
  res.json({ users });
});

export default router;
