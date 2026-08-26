/**
 * PAGE-009 runtime proof — Following feed relationship, newest-first, Neon persistence.
 * Run: npx tsx scripts/_page009_following_runtime_proof.ts
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
const unique = `p9${Date.now().toString(36)}`;
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
  if (!Array.isArray(videos)) throw new Error("following missing videos[]");
  return videos.map((row) => String(asRecord(row).id));
}

try {
  await requireValkey().ping();

  const unauth = await json("/api/feed/following");
  if (unauth.status !== 200) throw new Error(`unauth following ${unauth.status}`);
  if (JSON.stringify(unauth.body) !== JSON.stringify({ videos: [] })) {
    throw new Error(`unauth following expected empty videos got ${JSON.stringify(unauth.body)}`);
  }

  const viewer = await register("v");
  const followed = await register("f");
  const stranger = await register("s");
  const blockedUser = await register("b");
  const pool = getPool();

  const empty = await json("/api/feed/following", {}, viewer.token);
  if (empty.status !== 200) throw new Error(`empty ${empty.status}`);
  if (videoIds(empty.body).length !== 0) throw new Error("expected empty before follow");

  const newer = await pool.query<{ id: string }>(
    `INSERT INTO videos (user_id, bunny_path, caption, privacy, created_at)
     VALUES ($1, 'https://cdn.example/p9-new.mp4', 'hello', 'public', NOW()) RETURNING id`,
    [followed.id],
  );
  const older = await pool.query<{ id: string }>(
    `INSERT INTO videos (user_id, bunny_path, caption, privacy, created_at)
     VALUES ($1, 'https://cdn.example/p9-old.mp4', 'hello', 'public', NOW() - interval '2 hours') RETURNING id`,
    [followed.id],
  );
  const own = await pool.query<{ id: string }>(
    `INSERT INTO videos (user_id, bunny_path, caption, privacy)
     VALUES ($1, 'https://cdn.example/p9-self.mp4', 'mine', 'public') RETURNING id`,
    [viewer.id],
  );
  const strangerVideo = await pool.query<{ id: string }>(
    `INSERT INTO videos (user_id, bunny_path, caption, privacy)
     VALUES ($1, 'https://cdn.example/p9-str.mp4', 'nope', 'public') RETURNING id`,
    [stranger.id],
  );
  const priv = await pool.query<{ id: string }>(
    `INSERT INTO videos (user_id, bunny_path, caption, privacy)
     VALUES ($1, 'https://cdn.example/p9-priv.mp4', 'secret', 'private') RETURNING id`,
    [followed.id],
  );
  const blank = await pool.query<{ id: string }>(
    `INSERT INTO videos (user_id, bunny_path, caption, privacy)
     VALUES ($1, '   ', 'blank', 'public') RETURNING id`,
    [followed.id],
  );
  const storyish = await pool.query<{ id: string }>(
    `INSERT INTO videos (user_id, bunny_path, caption, privacy)
     VALUES ($1, 'https://cdn.example/stories/p9.mp4', 'story', 'public') RETURNING id`,
    [followed.id],
  );
  const deleted = await pool.query<{ id: string }>(
    `INSERT INTO videos (user_id, bunny_path, caption, privacy, deleted_at)
     VALUES ($1, 'https://cdn.example/p9-del.mp4', 'gone', 'public', NOW()) RETURNING id`,
    [followed.id],
  );
  const blockedVideo = await pool.query<{ id: string }>(
    `INSERT INTO videos (user_id, bunny_path, caption, privacy)
     VALUES ($1, 'https://cdn.example/p9-blk.mp4', 'blocked', 'public') RETURNING id`,
    [blockedUser.id],
  );

  const beforeFollow = videoIds((await json("/api/feed/following", {}, viewer.token)).body);
  if (beforeFollow.length !== 0) throw new Error("videos appeared before follow");

  const follow = await json(`/api/profiles/${followed.id}/follow`, { method: "POST" }, viewer.token);
  if (follow.status !== 200) throw new Error(`follow ${follow.status}`);
  await json(`/api/profiles/${blockedUser.id}/follow`, { method: "POST" }, viewer.token);
  await pool.query(`INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [
    viewer.id,
    blockedUser.id,
  ]);

  const page = await json("/api/feed/following", {}, viewer.token);
  if (page.status !== 200) throw new Error(`following page ${page.status}`);
  const body = asRecord(page.body);
  if ("items" in body || "nextCursor" in body) throw new Error("invented following envelope fields");
  const ids = videoIds(page.body);
  if (!ids.includes(newer.rows[0].id) || !ids.includes(older.rows[0].id)) {
    throw new Error("followed creator videos missing");
  }
  if (ids.indexOf(newer.rows[0].id) >= ids.indexOf(older.rows[0].id)) {
    throw new Error("ordering not newest-first");
  }
  for (const bad of [
    own.rows[0].id,
    strangerVideo.rows[0].id,
    priv.rows[0].id,
    blank.rows[0].id,
    storyish.rows[0].id,
    deleted.rows[0].id,
    blockedVideo.rows[0].id,
  ]) {
    if (ids.includes(bad)) throw new Error(`leaked video ${bad}`);
  }
  const followedRow = (body.videos as unknown[]).find((row) => String(asRecord(row).id) === newer.rows[0].id);
  if (!asRecord(followedRow).isFollowing) throw new Error("isFollowing not hydrated");

  const like = await json(`/api/videos/${newer.rows[0].id}/like`, { method: "POST" }, viewer.token);
  if (like.status !== 200) throw new Error(`like ${like.status}`);
  const save = await json(`/api/videos/${newer.rows[0].id}/save`, { method: "POST" }, viewer.token);
  if (save.status !== 200) throw new Error(`save ${save.status}`);
  const hydrated = await json("/api/feed/following", {}, viewer.token);
  const hydratedRow = (asRecord(hydrated.body).videos as unknown[]).find(
    (row) => String(asRecord(row).id) === newer.rows[0].id,
  );
  if (!asRecord(hydratedRow).isLiked || !asRecord(hydratedRow).isSaved) {
    throw new Error("like/save hydration failed");
  }

  const unfollow = await json(`/api/profiles/${followed.id}/unfollow`, { method: "POST" }, viewer.token);
  if (unfollow.status !== 200) throw new Error(`unfollow ${unfollow.status}`);
  const afterUnfollow = videoIds((await json("/api/feed/following", {}, viewer.token)).body);
  if (afterUnfollow.includes(newer.rows[0].id)) throw new Error("unfollow did not remove creator videos");

  const stillFollows = await pool.query(
    `SELECT 1 FROM follows WHERE follower_id = $1 AND followee_id = $2`,
    [viewer.id, followed.id],
  );
  if (stillFollows.rows[0]) throw new Error("follow row still in Neon after unfollow");

  const otherViewer = await register("o");
  const otherEmpty = videoIds((await json("/api/feed/following", {}, otherViewer.token)).body);
  if (otherEmpty.includes(newer.rows[0].id)) throw new Error("account isolation failed");

  const shell = await fetch("http://127.0.0.1:5173/following");
  if (shell.status !== 200) throw new Error(`following shell ${shell.status}`);

  console.log(
    JSON.stringify({
      ok: true,
      page: "PAGE-009",
      newestFirst: true,
      strangerExcluded: true,
      privateExcluded: true,
      blockedExcluded: true,
      storyPathExcluded: true,
      unfollowClearsFeedAndNeon: true,
      accountIsolation: true,
      discoverReturn: "/following",
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
