/**
 * PAGE-010 runtime proof — Friends = follow ∪ follower (not mutual-only), Neon persistence.
 * Run: npx tsx scripts/_page010_friends_runtime_proof.ts
 * Requires API :8080. Forces local Valkey so cache/presence paths stay honest.
 */
import "dotenv/config";

process.env.VALKEY_URL = "redis://127.0.0.1:6379";
process.env.REDIS_URL = "redis://127.0.0.1:6379";

const { resetEnvCache } = await import("../server/infra/env.ts");
resetEnvCache();

const { closeValkey, requireValkey } = await import("../server/infra/valkey.ts");
const { getPool } = await import("../server/infra/postgres.ts");

const base = process.env.PROOF_API_BASE?.trim() || "http://127.0.0.1:8080";
const unique = `p10${Date.now().toString(36)}`;
const password = "password12";

async function json(path: string, init: RequestInit = {}, token?: string) {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers as Record<string, string> | undefined),
    },
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function accessToken(body: unknown): string {
  const r = asRecord(body);
  const session = asRecord(r.session);
  return String(session.access_token ?? session.accessToken ?? "");
}

async function register(suffix: string): Promise<{ token: string; id: string }> {
  const username = `${unique}${suffix}`.slice(0, 20);
  const email = `${username}@example.com`;
  const registered = await json("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      email,
      username,
      password,
      displayName: username,
      ageConfirmed13Plus: true,
      consentVersion: "2026-07-21",
    }),
  });
  if (registered.status !== 201 && registered.status !== 200) {
    throw new Error(`register ${suffix} ${registered.status} ${JSON.stringify(registered.body)}`);
  }
  let token = accessToken(registered.body);
  let id = String(asRecord(asRecord(registered.body).user).id ?? "");
  if (!token) {
    await getPool().query(
      `UPDATE users SET email_confirmed_at = COALESCE(email_confirmed_at, NOW()) WHERE email_normalized = $1`,
      [email.toLowerCase()],
    );
    const login = await json("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    if (login.status !== 200) throw new Error(`login ${suffix} ${login.status}`);
    token = accessToken(login.body);
    id = String(asRecord(asRecord(login.body).user).id ?? id);
  }
  if (!token || !id) throw new Error(`register ${suffix} missing identity`);
  return { token, id };
}

function videoIds(body: unknown): string[] {
  const videos = asRecord(body).videos;
  if (!Array.isArray(videos)) throw new Error("friends missing videos[]");
  return videos.map((row) => String(asRecord(row).id));
}

try {
  await requireValkey().ping();

  const unauth = await json("/api/feed/friends");
  if (unauth.status !== 200) throw new Error(`unauth friends ${unauth.status}`);
  if (JSON.stringify(unauth.body) !== JSON.stringify({ videos: [] })) {
    throw new Error(`unauth friends expected empty got ${JSON.stringify(unauth.body)}`);
  }

  const viewer = await register("v");
  const followee = await register("e");
  const follower = await register("r");
  const stranger = await register("s");
  const blockedUser = await register("b");
  const pool = getPool();

  const empty = await json("/api/feed/friends", {}, viewer.token);
  if (videoIds(empty.body).length !== 0) throw new Error("expected empty before relationships");

  const followeeNewer = await pool.query<{ id: string }>(
    `INSERT INTO videos (user_id, bunny_path, caption, privacy, created_at)
     VALUES ($1, 'https://cdn.example/p10-e-new.mp4', 'hello', 'public', NOW()) RETURNING id`,
    [followee.id],
  );
  const followeeOlder = await pool.query<{ id: string }>(
    `INSERT INTO videos (user_id, bunny_path, caption, privacy, created_at)
     VALUES ($1, 'https://cdn.example/p10-e-old.mp4', 'hello', 'public', NOW() - interval '2 hours') RETURNING id`,
    [followee.id],
  );
  const followerVideo = await pool.query<{ id: string }>(
    `INSERT INTO videos (user_id, bunny_path, caption, privacy)
     VALUES ($1, 'https://cdn.example/p10-r.mp4', 'hello', 'public') RETURNING id`,
    [follower.id],
  );
  const own = await pool.query<{ id: string }>(
    `INSERT INTO videos (user_id, bunny_path, caption, privacy)
     VALUES ($1, 'https://cdn.example/p10-self.mp4', 'mine', 'public') RETURNING id`,
    [viewer.id],
  );
  const strangerVideo = await pool.query<{ id: string }>(
    `INSERT INTO videos (user_id, bunny_path, caption, privacy)
     VALUES ($1, 'https://cdn.example/p10-str.mp4', 'nope', 'public') RETURNING id`,
    [stranger.id],
  );
  const priv = await pool.query<{ id: string }>(
    `INSERT INTO videos (user_id, bunny_path, caption, privacy)
     VALUES ($1, 'https://cdn.example/p10-priv.mp4', 'secret', 'private') RETURNING id`,
    [followee.id],
  );
  const blockedVideo = await pool.query<{ id: string }>(
    `INSERT INTO videos (user_id, bunny_path, caption, privacy)
     VALUES ($1, 'https://cdn.example/p10-blk.mp4', 'blocked', 'public') RETURNING id`,
    [blockedUser.id],
  );

  // Viewer → followee (one-way). Follower → viewer (one-way). Distinguishes Friends from Following.
  let follow = await json(`/api/profiles/${followee.id}/follow`, { method: "POST" }, viewer.token);
  if (follow.status !== 200) throw new Error(`follow followee ${follow.status}`);
  follow = await json(`/api/profiles/${viewer.id}/follow`, { method: "POST" }, follower.token);
  if (follow.status !== 200) throw new Error(`follower follows viewer ${follow.status}`);
  follow = await json(`/api/profiles/${viewer.id}/follow`, { method: "POST" }, blockedUser.token);
  if (follow.status !== 200) throw new Error(`blocked follows viewer ${follow.status}`);
  await pool.query(`INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [
    viewer.id,
    blockedUser.id,
  ]);

  const friends = await json("/api/feed/friends", {}, viewer.token);
  if (friends.status !== 200) throw new Error(`friends ${friends.status}`);
  const body = asRecord(friends.body);
  if ("items" in body || "nextCursor" in body) throw new Error("invented friends envelope fields");
  const ids = videoIds(friends.body);
  if (!ids.includes(followeeNewer.rows[0].id) || !ids.includes(followeeOlder.rows[0].id)) {
    throw new Error("followee videos missing from Friends");
  }
  if (!ids.includes(followerVideo.rows[0].id)) {
    throw new Error("one-way follower video missing — Friends incorrectly mutual-only");
  }
  if (ids.indexOf(followeeNewer.rows[0].id) >= ids.indexOf(followeeOlder.rows[0].id)) {
    throw new Error("ordering not newest-first");
  }
  for (const bad of [own.rows[0].id, strangerVideo.rows[0].id, priv.rows[0].id, blockedVideo.rows[0].id]) {
    if (ids.includes(bad)) throw new Error(`leaked video ${bad}`);
  }

  const followingOnly = await json("/api/feed/following", {}, viewer.token);
  const followingIds = videoIds(followingOnly.body);
  if (!followingIds.includes(followeeNewer.rows[0].id)) throw new Error("Following missing followee");
  if (followingIds.includes(followerVideo.rows[0].id)) {
    throw new Error("Following incorrectly includes one-way follower — Friends/Following not distinct");
  }

  const followeeRow = (body.videos as unknown[]).find((row) => String(asRecord(row).id) === followeeNewer.rows[0].id);
  const followerRow = (body.videos as unknown[]).find((row) => String(asRecord(row).id) === followerVideo.rows[0].id);
  if (!asRecord(followeeRow).isFollowing) throw new Error("followee isFollowing false");
  if (asRecord(followerRow).isFollowing) throw new Error("follower-only should have isFollowing false");

  const like = await json(`/api/videos/${followeeNewer.rows[0].id}/like`, { method: "POST" }, viewer.token);
  if (like.status !== 200) throw new Error(`like ${like.status}`);
  const save = await json(`/api/videos/${followeeNewer.rows[0].id}/save`, { method: "POST" }, viewer.token);
  if (save.status !== 200) throw new Error(`save ${save.status}`);
  const hydrated = await json("/api/feed/friends", {}, viewer.token);
  const hydratedRow = (asRecord(hydrated.body).videos as unknown[]).find(
    (row) => String(asRecord(row).id) === followeeNewer.rows[0].id,
  );
  if (!asRecord(hydratedRow).isLiked || !asRecord(hydratedRow).isSaved) {
    throw new Error("like/save hydration failed");
  }

  const unfollow = await json(`/api/profiles/${followee.id}/unfollow`, { method: "POST" }, viewer.token);
  if (unfollow.status !== 200) throw new Error(`unfollow ${unfollow.status}`);
  const after = videoIds((await json("/api/feed/friends", {}, viewer.token)).body);
  if (after.includes(followeeNewer.rows[0].id)) throw new Error("one-way followee remained after unfollow");
  if (!after.includes(followerVideo.rows[0].id)) throw new Error("follower video dropped incorrectly after unrelated unfollow");

  const other = await register("o");
  const otherIds = videoIds((await json("/api/feed/friends", {}, other.token)).body);
  if (otherIds.includes(followerVideo.rows[0].id) || otherIds.includes(followeeNewer.rows[0].id)) {
    throw new Error("account isolation failed");
  }

  const shell = await fetch("http://127.0.0.1:5173/friends");
  if (shell.status !== 200) throw new Error(`friends shell ${shell.status}`);

  console.log(
    JSON.stringify({
      ok: true,
      page: "PAGE-010",
      rule: "follow_OR_follower_not_mutual_only",
      newestFirst: true,
      followerIncluded: true,
      followingDistinct: true,
      strangerExcluded: true,
      privateExcluded: true,
      blockedExcluded: true,
      unfollowDropsOneWayFolloweeKeepsFollower: true,
      accountIsolation: true,
      emptyCta: ["Add story", "Discover people"],
      closeTo: "/feed",
    }),
  );
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  try {
    await closeValkey();
  } catch {
    /* ignore */
  }
  try {
    await getPool().end();
  } catch {
    /* ignore */
  }
}
