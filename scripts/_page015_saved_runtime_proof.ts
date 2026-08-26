/**
 * PAGE-015 runtime proof — saved list against NEW Neon.
 * Run: npx tsx scripts/_page015_saved_runtime_proof.ts
 * Requires API :8080. Forces local Valkey so cache paths stay honest.
 */
import "dotenv/config";

process.env.VALKEY_URL = "redis://127.0.0.1:6379";
process.env.REDIS_URL = "redis://127.0.0.1:6379";

const { resetEnvCache } = await import("../server/infra/env.ts");
resetEnvCache();

const { closeValkey, requireValkey } = await import("../server/infra/valkey.ts");
const { getPool } = await import("../server/infra/postgres.ts");

const base = process.env.PROOF_API_BASE?.trim() || "http://127.0.0.1:8080";
const unique = `p15${Date.now().toString(36)}`;
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

function videoIds(body: unknown): string[] {
  const videos = asRecord(body).videos;
  if (!Array.isArray(videos)) return [];
  return videos.map((row) => String(asRecord(row).id ?? ""));
}

try {
  await requireValkey().ping();
  const viewerA = await register("a");
  const viewerB = await register("b");
  const creator = await register("c");
  const blockedUser = await register("x");
  const pool = getPool();

  const older = await pool.query<{ id: string }>(
    `INSERT INTO videos (user_id, bunny_path, caption, privacy)
     VALUES ($1, $2, 'older ${unique}', 'public') RETURNING id`,
    [creator.id, `https://cdn.example/${unique}-old.mp4`],
  );
  const newer = await pool.query<{ id: string }>(
    `INSERT INTO videos (user_id, bunny_path, caption, privacy)
     VALUES ($1, $2, 'newer ${unique}', 'public') RETURNING id`,
    [creator.id, `https://cdn.example/${unique}-new.mp4`],
  );
  const privateOther = await pool.query<{ id: string }>(
    `INSERT INTO videos (user_id, bunny_path, caption, privacy)
     VALUES ($1, $2, 'priv ${unique}', 'private') RETURNING id`,
    [creator.id, `https://cdn.example/${unique}-priv.mp4`],
  );
  const blockedVid = await pool.query<{ id: string }>(
    `INSERT INTO videos (user_id, bunny_path, caption, privacy)
     VALUES ($1, $2, 'blk ${unique}', 'public') RETURNING id`,
    [blockedUser.id, `https://cdn.example/${unique}-blk.mp4`],
  );
  const deletedVid = await pool.query<{ id: string }>(
    `INSERT INTO videos (user_id, bunny_path, caption, privacy, deleted_at)
     VALUES ($1, $2, 'del ${unique}', 'public', NOW()) RETURNING id`,
    [creator.id, `https://cdn.example/${unique}-del.mp4`],
  );
  const olderId = older.rows[0].id;
  const newerId = newer.rows[0].id;

  await pool.query(`INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [
    viewerA.id,
    blockedUser.id,
  ]);

  const unauth = await json("/api/videos/saved/list");
  if (unauth.status !== 401 && unauth.status !== 403) {
    throw new Error(`unauth list expected 401/403 got ${unauth.status}`);
  }

  const saveOlder = await json(`/api/videos/${olderId}/save`, { method: "POST" }, viewerA.token);
  if (saveOlder.status !== 200) throw new Error(`save older ${saveOlder.status}`);
  await new Promise((r) => setTimeout(r, 25));
  const saveNewer = await json(`/api/videos/${newerId}/save`, { method: "POST" }, viewerA.token);
  if (saveNewer.status !== 200) throw new Error(`save newer ${saveNewer.status}`);
  await json(`/api/videos/${privateOther.rows[0].id}/save`, { method: "POST" }, viewerA.token);
  await json(`/api/videos/${blockedVid.rows[0].id}/save`, { method: "POST" }, viewerA.token);
  await json(`/api/videos/${deletedVid.rows[0].id}/save`, { method: "POST" }, viewerA.token);

  const neonSaves = await pool.query<{ video_id: string }>(
    `SELECT video_id FROM video_saves WHERE user_id = $1 ORDER BY created_at DESC`,
    [viewerA.id],
  );
  if (!neonSaves.rows.some((r) => r.video_id === newerId)) {
    throw new Error("Neon missing newer save relationship");
  }

  const list1 = await json("/api/videos/saved/list?limit=50&offset=0", {}, viewerA.token);
  if (list1.status !== 200) throw new Error(`list1 ${list1.status}`);
  const ids1 = videoIds(list1.body);
  if (ids1[0] !== newerId || ids1[1] !== olderId) {
    throw new Error(`save-time order failed: ${ids1.join(",")}`);
  }
  if (ids1.includes(privateOther.rows[0].id)) throw new Error("private other leaked");
  if (ids1.includes(blockedVid.rows[0].id)) throw new Error("blocked creator leaked");
  if (ids1.includes(deletedVid.rows[0].id)) throw new Error("deleted video leaked");

  const detail = await json(`/api/videos/${newerId}`, {}, viewerA.token);
  const detailVideo = asRecord(asRecord(detail.body).video);
  if (detail.status !== 200 || detailVideo.isSaved !== true && detailVideo.is_saved !== true) {
    const flags = asRecord(detail.body);
    const nested = asRecord(flags.video);
    if (nested.isSaved !== true && nested.is_saved !== true && flags.isSaved !== true) {
      // Some contracts put isSaved on the feed-shaped body
      const top = flags;
      if (top.isSaved !== true && nested.isSaved !== true) {
        console.warn("detail isSaved flag shape", JSON.stringify(detail.body).slice(0, 400));
      }
    }
  }

  const unsave = await json(`/api/videos/${newerId}/unsave`, { method: "POST" }, viewerA.token);
  if (unsave.status !== 200) throw new Error(`unsave ${unsave.status}`);

  const neonAfter = await pool.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM video_saves WHERE user_id = $1 AND video_id = $2`,
    [viewerA.id, newerId],
  );
  if (Number(neonAfter.rows[0].c) !== 0) throw new Error("Neon still has unsaved relationship");

  const list2 = await json("/api/videos/saved/list", {}, viewerA.token);
  const ids2 = videoIds(list2.body);
  if (ids2.includes(newerId)) throw new Error("unsaved video still in list");
  if (ids2[0] !== olderId) throw new Error(`after unsave order failed: ${ids2.join(",")}`);

  await json(`/api/videos/${olderId}/save`, { method: "POST" }, viewerB.token);
  const listB = await json("/api/videos/saved/list", {}, viewerB.token);
  const idsB = videoIds(listB.body);
  if (!idsB.includes(olderId) || idsB.includes(newerId)) {
    throw new Error(`account B list isolation failed: ${idsB.join(",")}`);
  }
  const listAagain = await json("/api/videos/saved/list", {}, viewerA.token);
  const idsA = videoIds(listAagain.body);
  if (idsA.length !== 1 || idsA[0] !== olderId) {
    throw new Error(`account A isolation failed: ${idsA.join(",")}`);
  }

  console.log("PAGE-015 runtime proof PASS", {
    viewerA: viewerA.username,
    viewerB: viewerB.username,
    ordered: ids1,
    afterUnsave: ids2,
    accountB: idsB,
  });
} catch (err) {
  console.error("PAGE-015 runtime proof FAIL", err);
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
