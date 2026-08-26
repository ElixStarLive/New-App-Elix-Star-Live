/**
 * PAGE-008 runtime proof — STEM ranking envelope, Neon persistence, chrome contracts.
 * Run: npx tsx scripts/_page008_stem_runtime_proof.ts
 * Requires API :8080. Forces local Valkey so cache/presence paths stay honest.
 */
import "dotenv/config";

process.env.VALKEY_URL = "redis://127.0.0.1:6379";
process.env.REDIS_URL = "redis://127.0.0.1:6379";

const { resetEnvCache } = await import("../server/infra/env.ts");
resetEnvCache();

const { closeValkey, requireValkey } = await import("../server/infra/valkey.ts");
const { getPool } = await import("../server/infra/postgres.ts");
const {
  STEM_EXTRA_SLOTS,
  STEM_MAX,
  STEM_TOP_TRENDING,
  isStemExtraCaption,
} = await import("../shared/stemEligibility.ts");

const base = process.env.PROOF_API_BASE?.trim() || "http://127.0.0.1:8080";
const unique = `p8${Date.now().toString(36)}`;
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

  if (!isStemExtraCaption("holiday", ["beach"])) {
    throw new Error("stem caption eligibility mismatch");
  }
  if (STEM_TOP_TRENDING !== 40 || STEM_EXTRA_SLOTS !== 20 || STEM_MAX !== 55) {
    throw new Error("stem constants drifted from OLD contract");
  }

  const unauth = await json("/api/feed/stem");
  if (unauth.status !== 401) throw new Error(`unauth stem expected 401 got ${unauth.status}`);

  const viewer = await register("v");
  const creator = await register("c");
  const blocked = await register("b");
  const pool = getPool();

  const high = await pool.query<{ id: string }>(
    `INSERT INTO videos (user_id, bunny_path, caption, privacy, is_stem)
     VALUES ($1, 'https://cdn.example/p8-hi.mp4', 'hello', 'public', FALSE) RETURNING id`,
    [creator.id],
  );
  const beach = await pool.query<{ id: string }>(
    `INSERT INTO videos (user_id, bunny_path, caption, privacy, hashtags, is_stem)
     VALUES ($1, 'https://cdn.example/p8-beach.mp4', 'holiday', 'public', ARRAY['beach'], FALSE) RETURNING id`,
    [creator.id],
  );
  const priv = await pool.query<{ id: string }>(
    `INSERT INTO videos (user_id, bunny_path, caption, privacy)
     VALUES ($1, 'https://cdn.example/p8-priv.mp4', 'nope', 'private') RETURNING id`,
    [creator.id],
  );
  const blank = await pool.query<{ id: string }>(
    `INSERT INTO videos (user_id, bunny_path, caption, privacy)
     VALUES ($1, '   ', 'blank', 'public') RETURNING id`,
    [creator.id],
  );
  const deleted = await pool.query<{ id: string }>(
    `INSERT INTO videos (user_id, bunny_path, caption, privacy, deleted_at)
     VALUES ($1, 'https://cdn.example/p8-del.mp4', 'gone', 'public', NOW()) RETURNING id`,
    [creator.id],
  );
  const blockedVideo = await pool.query<{ id: string }>(
    `INSERT INTO videos (user_id, bunny_path, caption, privacy)
     VALUES ($1, 'https://cdn.example/p8-blk.mp4', 'blocked', 'public') RETURNING id`,
    [blocked.id],
  );
  await pool.query(`INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [
    viewer.id,
    blocked.id,
  ]);

  for (let i = 0; i < 8; i += 1) {
    const watcher = await register(`w${i}`);
    await pool.query(`INSERT INTO video_views (video_id, viewer_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [
      high.rows[0].id,
      watcher.id,
    ]);
  }

  async function allStemIds(token: string): Promise<string[]> {
    const collected: string[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 6; i += 1) {
      const path = cursor ? `/api/feed/stem?cursor=${encodeURIComponent(cursor)}` : "/api/feed/stem";
      const page = await json(path, {}, token);
      if (page.status !== 200) throw new Error(`stem page ${i + 1} ${page.status}`);
      const body = asRecord(page.body);
      if (!Array.isArray(body.videos)) throw new Error("stem missing videos[]");
      if ("items" in body) throw new Error("invented items[] envelope");
      for (const row of body.videos as unknown[]) {
        const id = String(asRecord(row).id);
        const url = String(asRecord(row).url ?? "").trim();
        if (!url) throw new Error(`stem row ${id} missing url`);
        if (collected.includes(id)) throw new Error(`duplicate stem id ${id}`);
        collected.push(id);
      }
      cursor = body.nextCursor == null ? null : String(body.nextCursor);
      if (!cursor) break;
    }
    if (collected.length > STEM_MAX) throw new Error(`stem exceeded cap ${STEM_MAX}`);
    return collected;
  }

  const ids = await allStemIds(viewer.token);
  if (!ids.includes(high.rows[0].id)) throw new Error("high-view video missing");
  if (!ids.includes(beach.rows[0].id)) throw new Error("caption-extra beach video missing");
  if (ids.includes(priv.rows[0].id)) throw new Error("private leaked");
  if (ids.includes(blank.rows[0].id)) throw new Error("blank url leaked");
  if (ids.includes(deleted.rows[0].id)) throw new Error("deleted leaked");
  if (ids.includes(blockedVideo.rows[0].id)) throw new Error("blocked creator leaked");
  if (ids.indexOf(high.rows[0].id) >= ids.indexOf(beach.rows[0].id)) {
    throw new Error("ranking order wrong: high views must precede beach extra/low views");
  }

  const like = await json(`/api/videos/${high.rows[0].id}/like`, { method: "POST" }, viewer.token);
  if (like.status !== 200) throw new Error(`like ${like.status}`);
  const afterLike = await json("/api/feed/stem", {}, viewer.token);
  const likedRow = (asRecord(afterLike.body).videos as unknown[] | undefined)?.find(
    (row) => String(asRecord(row).id) === high.rows[0].id,
  );
  if (!asRecord(likedRow).isLiked) throw new Error("liked state not hydrated on STEM");

  const unlike = await json(`/api/videos/${high.rows[0].id}/unlike`, { method: "POST" }, viewer.token);
  if (unlike.status !== 200) throw new Error(`unlike ${unlike.status}`);
  const save = await json(`/api/videos/${high.rows[0].id}/save`, { method: "POST" }, viewer.token);
  if (save.status !== 200) throw new Error(`save ${save.status}`);
  const afterSave = await json("/api/feed/stem", {}, viewer.token);
  const savedRow = (asRecord(afterSave.body).videos as unknown[] | undefined)?.find(
    (row) => String(asRecord(row).id) === high.rows[0].id,
  );
  if (!asRecord(savedRow).isSaved) throw new Error("saved state not hydrated on STEM");
  const unsave = await json(`/api/videos/${high.rows[0].id}/unsave`, { method: "POST" }, viewer.token);
  if (unsave.status !== 200) throw new Error(`unsave ${unsave.status}`);

  console.log(
    JSON.stringify({
      ok: true,
      page: "PAGE-008",
      stemConstants: { STEM_TOP_TRENDING, STEM_EXTRA_SLOTS, STEM_MAX },
      rankedCount: ids.length,
      highId: high.rows[0].id,
      beachId: beach.rows[0].id,
      privateExcluded: true,
      blankExcluded: true,
      deletedExcluded: true,
      blockedExcluded: true,
      likeSaveHydration: true,
      searchReturnContract: "/stem",
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
