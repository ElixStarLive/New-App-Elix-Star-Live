/**
 * PAGE-025 runtime proof — public profile against NEW API + Neon.
 * Run: npx tsx scripts/_page025_public_profile_runtime_proof.ts
 * Device PASS not claimed.
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
  const username = `p25r${stamp}${Math.random().toString(36).slice(2, 7)}`.slice(0, 12);
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
  const page = readFileSync(resolve("src/pages/Profile.tsx"), "utf8");
  const session = readFileSync(resolve("src/features/profile/publicProfileSession.ts"), "utf8");
  const api = readFileSync(resolve("src/features/profile/publicProfileApi.ts"), "utf8");
  const app = readFileSync(resolve("src/App.tsx"), "utf8");
  const own = readFileSync(resolve("src/pages/OwnProfile.tsx"), "utf8");

  assert(app.includes('path="/profile/:userId" element={<Profile />}'), "public route missing");
  assert(app.includes('path="/profile" element={<OwnProfile />}'), "own route missing");
  assert(!api.includes("/api/profiles/me"), "public must not use /me");
  assert(api.includes("apiFetchSavedFeed"), "viewer saved feed missing");
  assert(api.includes("apiFetchLikedFeed"), "viewer liked feed missing");
  assert(!api.includes("apiFetchUserSavedFeed"), "must not use owner saved on public");
  assert(page.includes("isOwnPublicRouteKey"), "own-username redirect missing");
  assert(page.includes("stream_started"), "live presence missing");
  assert(page.includes("subscribeVideoCollection"), "saved/liked sync missing");
  assert(!page.includes('"private"'), "private tab must not appear on public");
  assert(own.includes("private"), "own profile must keep private");
  assert(session.includes("apiRegisterPublicProfileView"), "view tracking missing");
  assert(session.includes("applyLivePresence"), "live presence owner missing");

  await requireValkey().ping();
  const health = await json("/api/health");
  assert(health.status === 200, `health ${health.status}`);

  const viewer = await register("v");
  const target = await register("t");

  const pool = getPool();
  assert(Boolean(pool), "Neon pool missing");
  await pool!.query(
    `INSERT INTO videos (user_id, bunny_path, caption, privacy)
     VALUES ($1, 'https://cdn.example/p25-runtime-pub.mp4', 'pub', 'public'),
            ($1, 'https://cdn.example/p25-runtime-priv.mp4', 'secret', 'private')`,
    [target.id],
  );

  const profile = await json(`/api/profiles/${target.id}`, {
    headers: { Authorization: `Bearer ${viewer.token}` },
  });
  assert(profile.status === 200, `profile ${profile.status}`);
  const profileUser = (profile.body as { user?: { id?: string; isFollowing?: boolean; isLive?: boolean } }).user;
  assert(profileUser?.id === target.id, "wrong public identity");
  assert(profileUser?.isFollowing === false, "follow hydration wrong");
  assert(profileUser?.isLive === false, "live hydration wrong");

  const byName = await json(`/api/profiles/by-username/${target.username}`, {
    headers: { Authorization: `Bearer ${viewer.token}` },
  });
  assert(byName.status === 200, `by-username ${byName.status}`);

  const videos = await json(`/api/videos/user/${target.id}`, {
    headers: { Authorization: `Bearer ${viewer.token}` },
  });
  assert(videos.status === 200, `videos ${videos.status}`);
  const vids = ((videos.body as { videos?: { description?: string }[] }).videos ?? []).map((v) => v.description);
  assert(vids.includes("pub"), "public video missing");
  assert(!vids.includes("secret"), "private video leaked");

  const privateAttempt = await json(`/api/videos/user/${target.id}?privacy=private`, {
    headers: { Authorization: `Bearer ${viewer.token}` },
  });
  assert(privateAttempt.status === 403, `private expected 403 got ${privateAttempt.status}`);

  const follow = await json(`/api/profiles/${target.id}/follow`, {
    method: "POST",
    headers: { Authorization: `Bearer ${viewer.token}` },
    body: "{}",
  });
  assert(follow.status === 200, `follow ${follow.status}`);
  const afterFollow = await json(`/api/profiles/${target.id}`, {
    headers: { Authorization: `Bearer ${viewer.token}` },
  });
  assert((afterFollow.body as { user?: { isFollowing?: boolean } }).user?.isFollowing === true, "follow not persisted");

  const view1 = await json(`/api/profiles/${target.id}/view`, {
    method: "POST",
    headers: { Authorization: `Bearer ${viewer.token}` },
    body: "{}",
  });
  assert(view1.status === 200, `view1 ${view1.status}`);
  const view1Body = view1.body as { uniqueViews?: number; recorded?: boolean };
  const view2 = await json(`/api/profiles/${target.id}/view`, {
    method: "POST",
    headers: { Authorization: `Bearer ${viewer.token}` },
    body: "{}",
  });
  assert(view2.status === 200, `view2 ${view2.status}`);
  const view2Body = view2.body as { uniqueViews?: number; recorded?: boolean };
  assert(view2Body.uniqueViews === view1Body.uniqueViews, "unique view must not double-count");

  const thread1 = await json("/api/inbox/threads", {
    method: "POST",
    headers: { Authorization: `Bearer ${viewer.token}` },
    body: JSON.stringify({ userId: target.id }),
  });
  assert(thread1.status === 200 || thread1.status === 201, `thread1 ${thread1.status}`);
  const threadId = String((thread1.body as { id?: string }).id ?? "");
  assert(Boolean(threadId), "thread id missing");
  const thread2 = await json("/api/inbox/threads", {
    method: "POST",
    headers: { Authorization: `Bearer ${viewer.token}` },
    body: JSON.stringify({ userId: target.id }),
  });
  assert(thread2.status === 200 || thread2.status === 201, `thread2 ${thread2.status}`);
  assert(String((thread2.body as { id?: string }).id ?? "") === threadId, "duplicate DM thread created");

  const block = await json(`/api/block/${target.id}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${viewer.token}` },
  });
  assert(block.status === 200 || block.status === 201 || block.status === 204, `block ${block.status}`);
  const blockedProfile = await json(`/api/profiles/${target.id}`, {
    headers: { Authorization: `Bearer ${viewer.token}` },
  });
  assert(blockedProfile.status === 403, `blocked profile expected 403 got ${blockedProfile.status}`);

  console.log(
    JSON.stringify(
      {
        ok: true,
        page: "PAGE-025",
        health: health.status,
        viewerId: viewer.id,
        targetId: target.id,
        followPersisted: true,
        privateRejected: true,
        uniqueViewStable: true,
        threadReuse: true,
        blockEnforced: true,
        owner: "Profile + createPublicProfileSession",
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
      page: "PAGE-025",
      error: error instanceof Error ? error.message : String(error),
    }),
  );
  process.exitCode = 1;
} finally {
  await closeValkey().catch(() => undefined);
  await getPool()?.end().catch(() => undefined);
}
