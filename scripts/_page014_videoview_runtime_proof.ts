/**
 * PAGE-014 runtime proof — video detail access/hydration against NEW Neon.
 * Run: npx tsx scripts/_page014_videoview_runtime_proof.ts
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
const unique = `p14${Date.now().toString(36)}`;
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

async function register(suffix: string): Promise<{ token: string; id: string; username: string }> {
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
  return { token, id, username };
}

try {
  await requireValkey().ping();
  const viewer = await register("v");
  const creator = await register("c");
  const blockedUser = await register("b");
  const pool = getPool();

  const publicVideo = await pool.query<{ id: string }>(
    `INSERT INTO videos (user_id, bunny_path, caption, privacy, hashtags)
     VALUES ($1, $2, 'hello #car ${unique}', 'public', ARRAY['car']) RETURNING id`,
    [creator.id, `https://cdn.example/${unique}-p14.mp4`],
  );
  const videoId = publicVideo.rows[0].id;
  const privateVideo = await pool.query<{ id: string }>(
    `INSERT INTO videos (user_id, bunny_path, caption, privacy)
     VALUES ($1, $2, 'secret ${unique}', 'private') RETURNING id`,
    [creator.id, `https://cdn.example/${unique}-priv.mp4`],
  );
  const blockedVideo = await pool.query<{ id: string }>(
    `INSERT INTO videos (user_id, bunny_path, caption, privacy)
     VALUES ($1, $2, 'blocked ${unique}', 'public') RETURNING id`,
    [blockedUser.id, `https://cdn.example/${unique}-blk.mp4`],
  );
  const deletedVideo = await pool.query<{ id: string }>(
    `INSERT INTO videos (user_id, bunny_path, caption, privacy, deleted_at)
     VALUES ($1, $2, 'gone ${unique}', 'public', NOW()) RETURNING id`,
    [creator.id, `https://cdn.example/${unique}-del.mp4`],
  );
  await pool.query(`INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [
    viewer.id,
    blockedUser.id,
  ]);

  const anon = await json(`/api/videos/${videoId}`);
  if (anon.status !== 200) throw new Error(`anon public ${anon.status}`);
  if (asRecord(anon.body).id !== videoId) throw new Error("anon identity wrong");
  if (String(asRecord(anon.body).url) !== `https://cdn.example/${unique}-p14.mp4`) {
    throw new Error("bunny path wrong");
  }

  const malformed = await json("/api/videos/not-a-video");
  if (malformed.status !== 404) throw new Error("malformed must 404");
  const unknown = await json("/api/videos/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  if (unknown.status !== 404) throw new Error("unknown must 404");
  const deleted = await json(`/api/videos/${deletedVideo.rows[0].id}`, {}, viewer.token);
  if (deleted.status !== 404) throw new Error("deleted must 404");

  const blocked = await json(`/api/videos/${blockedVideo.rows[0].id}`, {}, viewer.token);
  if (blocked.status !== 404) throw new Error("blocked must 404 for viewer");

  const strangerPrivate = await json(`/api/videos/${privateVideo.rows[0].id}`, {}, viewer.token);
  if (strangerPrivate.status !== 404) throw new Error("private must 404 for stranger");

  const ownerPrivate = await json(`/api/videos/${privateVideo.rows[0].id}`, {}, creator.token);
  if (ownerPrivate.status !== 200) throw new Error(`owner private ${ownerPrivate.status}`);
  if (asRecord(ownerPrivate.body).id !== privateVideo.rows[0].id) throw new Error("owner private identity");

  const like = await json(`/api/videos/${videoId}/like`, { method: "POST" }, viewer.token);
  if (like.status !== 200) throw new Error(`like ${like.status}`);
  const save = await json(`/api/videos/${videoId}/save`, { method: "POST" }, viewer.token);
  if (save.status !== 200) throw new Error(`save ${save.status}`);
  const follow = await json(`/api/profiles/${creator.id}/follow`, { method: "POST" }, viewer.token);
  if (follow.status !== 200) throw new Error(`follow ${follow.status}`);

  const hydrated = await json(`/api/videos/${videoId}`, {}, viewer.token);
  const h = asRecord(hydrated.body);
  if (h.isLiked !== true || h.isSaved !== true || h.isFollowing !== true) {
    throw new Error("hydration flags wrong after like/save/follow");
  }
  if (String(asRecord(h.user).id) !== creator.id) throw new Error("creator hydration wrong");

  const other = await pool.query<{ id: string }>(
    `INSERT INTO videos (user_id, bunny_path, caption, privacy)
     VALUES ($1, $2, 'second ${unique}', 'public') RETURNING id`,
    [creator.id, `https://cdn.example/${unique}-b.mp4`],
  );
  const [slow, fast] = await Promise.all([
    json(`/api/videos/${videoId}`, {}, viewer.token),
    json(`/api/videos/${other.rows[0].id}`, {}, viewer.token),
  ]);
  if (asRecord(slow.body).id !== videoId) throw new Error("race A identity");
  if (asRecord(fast.body).id !== other.rows[0].id) throw new Error("race B identity");

  const outsider = await register("x");
  const outsiderSeesBlocked = await json(`/api/videos/${blockedVideo.rows[0].id}`, {}, outsider.token);
  if (outsiderSeesBlocked.status !== 200) {
    throw new Error("account without block must see previously blocked creator video");
  }

  const pageSrc = await import("node:fs").then((fs) =>
    fs.readFileSync(new URL("../src/pages/VideoView.tsx", import.meta.url), "utf8"),
  );
  if (!pageSrc.includes("loadSeq") || !pageSrc.includes("viewerId")) {
    throw new Error("VideoView missing race/account owners");
  }
  if (pageSrc.includes("elix-page-glass") || pageSrc.includes("useVideoStore")) {
    throw new Error("VideoView chrome/store ownership drifted");
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        page: "PAGE-014",
        videoId,
        privateId: privateVideo.rows[0].id,
        ownerPrivate: true,
        strangerPrivateRejected: true,
        hydrated: true,
      },
      null,
      2,
    ),
  );
} catch (err) {
  console.error(err);
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
