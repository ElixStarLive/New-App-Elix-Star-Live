/**
 * PAGE-024 runtime proof — own profile ownership against NEW API + Neon.
 * Run: npx tsx scripts/_page024_own_profile_runtime_proof.ts
 * Requires API :8080 + Neon + Valkey. Device PASS not claimed.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

process.env.VALKEY_URL = process.env.VALKEY_URL || "redis://127.0.0.1:6379";
process.env.REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";

const { resetEnvCache } = await import("../server/infra/env.ts");
resetEnvCache();

const { closeValkey, requireValkey } = await import("../server/infra/valkey.ts");
const { getPool } = await import("../server/infra/postgres.ts");

const base = process.env.PROOF_API_BASE?.trim() || "http://127.0.0.1:8080";

async function json(path: string, init: RequestInit = {}) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  const res = await fetch(`${base}${path}`, { ...init, headers });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function accessToken(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const session = (body as { session?: { access_token?: unknown } }).session;
  if (!session || typeof session !== "object") return "";
  return typeof session.access_token === "string" ? session.access_token : "";
}

async function register(stamp: string) {
  const username = `p24r${stamp}${Math.random().toString(36).slice(2, 7)}`.slice(0, 12);
  const email = `${username}@example.com`;
  const registered = await json("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      email,
      username,
      password: "password12",
      ageConfirmed13Plus: true,
      consentVersion: "2026-07-21",
    }),
  });
  assert(registered.status === 201, `register ${username} → ${registered.status}`);
  const id = String((registered.body as { user?: { id?: string } })?.user?.id ?? "");
  assert(Boolean(id), "register missing user id");
  // Production register may require email confirm before session — confirm via Neon then login.
  await getPool()!.query(`UPDATE users SET email_confirmed_at = NOW() WHERE id = $1`, [id]);
  const login = await json("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password: "password12" }),
  });
  assert(login.status === 200, `login ${username} → ${login.status}`);
  const token = accessToken(login.body);
  assert(Boolean(token), "login missing access_token");
  return { id, token, username };
}

try {
  const page = readFileSync(resolve("src/pages/OwnProfile.tsx"), "utf8");
  const session = readFileSync(resolve("src/features/profile/ownProfileSession.ts"), "utf8");
  const api = readFileSync(resolve("src/features/profile/ownProfileApi.ts"), "utf8");
  const app = readFileSync(resolve("src/App.tsx"), "utf8");

  assert(app.includes('path="/profile" element={<OwnProfile />}'), "route /profile missing OwnProfile");
  assert(api.includes("/api/profiles/me"), "must use session /me");
  assert(!api.includes("/api/profiles/${"), "must not choose user id for own profile");
  assert(session.includes("apiFetchOwnProfile"), "session owner missing");
  assert(session.includes("applyCollectionEvent"), "collection sync owner missing");
  assert(page.includes("subscribeVideoCollection"), "saved/liked sync missing");
  assert(page.includes("/profile/${profile.id}/followers"), "followers handoff missing");
  assert(page.includes("/profile/${profile.id}/following"), "following handoff missing");
  assert(page.includes("/settings"), "settings handoff missing");
  assert(page.includes("/upload?type=story"), "story plus missing");
  assert(page.includes("private"), "private tab missing");
  assert(!page.includes("createUploadPublishSession"), "must not own upload");
  assert(!session.includes("isLive"), "client live authority forbidden");

  await requireValkey().ping();
  const health = await json("/api/health");
  assert(health.status === 200, `health ${health.status}`);

  const unauth = await json("/api/profiles/me");
  assert(unauth.status === 401, `unauth me expected 401 got ${unauth.status}`);

  const owner = await register("a");
  const other = await register("b");

  const meA = await json("/api/profiles/me", {
    headers: { Authorization: `Bearer ${owner.token}` },
  });
  assert(meA.status === 200, `owner me ${meA.status}`);
  const meAUser = (meA.body as { user?: { id?: string; username?: string } }).user;
  assert(meAUser?.id === owner.id, "owner /me id mismatch");
  assert(meAUser?.username === owner.username, "owner /me username mismatch");

  const meB = await json("/api/profiles/me", {
    headers: { Authorization: `Bearer ${other.token}` },
  });
  assert(meB.status === 200, `other me ${meB.status}`);
  const meBUser = (meB.body as { user?: { id?: string } }).user;
  assert(meBUser?.id === other.id, "other /me must be B, not A");
  assert(meBUser?.id !== owner.id, "account switch isolation failed on /me");

  const pool = getPool();
  assert(Boolean(pool), "Neon pool missing");
  await pool!.query(
    `INSERT INTO videos (user_id, bunny_path, caption, privacy)
     VALUES ($1, 'https://cdn.example/p24-runtime-pub.mp4', 'pub', 'public'),
            ($1, 'https://cdn.example/p24-runtime-priv.mp4', 'secret', 'private')`,
    [owner.id],
  );
  const priv = await pool!.query<{ id: string }>(
    `SELECT id FROM videos WHERE user_id = $1 AND privacy = 'private' AND bunny_path LIKE '%p24-runtime-priv%' LIMIT 1`,
    [owner.id],
  );
  const privId = priv.rows[0]?.id;
  assert(Boolean(privId), "private video insert failed");

  const ownerPriv = await json(`/api/videos/user/${owner.id}?privacy=private`, {
    headers: { Authorization: `Bearer ${owner.token}` },
  });
  assert(ownerPriv.status === 200, `owner private list ${ownerPriv.status}`);
  const ownerVideos = ((ownerPriv.body as { videos?: { id?: string }[] }).videos ?? []).map((v) => v.id);
  assert(ownerVideos.includes(privId), "owner must see own private video");

  const otherPriv = await json(`/api/videos/user/${owner.id}?privacy=private`, {
    headers: { Authorization: `Bearer ${other.token}` },
  });
  assert(otherPriv.status === 403, `other private expected 403 got ${otherPriv.status}`);

  const otherDetail = await json(`/api/videos/${privId}`, {
    headers: { Authorization: `Bearer ${other.token}` },
  });
  assert(otherDetail.status === 403 || otherDetail.status === 404, `non-owner detail expected 403/404 got ${otherDetail.status}`);

  console.log(
    JSON.stringify(
      {
        ok: true,
        page: "PAGE-024",
        health: health.status,
        unauthMe: unauth.status,
        ownerId: owner.id,
        otherId: other.id,
        privateVideoId: privId,
        ownerPrivateOk: true,
        nonOwnerPrivateRejected: true,
        accountSwitchIsolation: true,
        owner: "createOwnProfileSession + GET /api/profiles/me",
        note: "API+Neon multi-account proof OK; physical device UI not claimed",
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      ok: false,
      page: "PAGE-024",
      error: error instanceof Error ? error.message : String(error),
    }),
  );
  process.exitCode = 1;
} finally {
  await closeValkey().catch(() => undefined);
  await getPool()?.end().catch(() => undefined);
}
