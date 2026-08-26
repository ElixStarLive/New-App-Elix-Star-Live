/**
 * PAGE-027 runtime proof — followers list against NEW API + Neon.
 * Run: npx tsx scripts/_page027_followers_runtime_proof.ts
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
  const username = `p27r${stamp}${Math.random().toString(36).slice(2, 7)}`.slice(0, 12);
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
  const page = readFileSync(resolve("src/pages/Followers.tsx"), "utf8");
  const session = readFileSync(resolve("src/features/profile/followersSession.ts"), "utf8");
  const api = readFileSync(resolve("src/features/profile/followersApi.ts"), "utf8");
  const app = readFileSync(resolve("src/App.tsx"), "utf8");
  const router = readFileSync(resolve("server/modules/profile/router.ts"), "utf8");
  const feedApi = readFileSync(resolve("src/features/feed/feedApi.ts"), "utf8");

  assert(app.includes('path="/profile/:userId/followers" element={<Followers />}'), "route missing");
  assert(api.includes("/followers"), "followers GET missing");
  assert(!api.includes("/following"), "must not query following list");
  assert(session.includes("apiFetchFollowers"), "session owner missing");
  assert(page.includes("subscribeFollowRelationship"), "cross-page sync missing");
  assert(page.includes("No followers yet."), "empty copy missing");
  assert(!page.includes("Follow Back"), "Follow Back not in OLD");
  assert(router.includes("JOIN users u ON u.id = f.follower_id"), "wrong relationship direction");
  assert(router.includes("WHERE f.followee_id = $1"), "wrong relationship direction");
  assert(feedApi.includes("publishFollowRelationship"), "canonical follow publish missing");

  await requireValkey().ping();
  const health = await json("/api/health");
  assert(health.status === 200, `health ${health.status}`);

  const owner = await register("o");
  const fanA = await register("a");
  const fanB = await register("b");
  const viewer = await register("v");

  const empty = await json(`/api/profiles/${owner.id}/followers`, {
    headers: { Authorization: `Bearer ${viewer.token}` },
  });
  assert(empty.status === 200, `empty ${empty.status}`);
  assert(((empty.body as { users?: unknown[] }).users ?? []).length === 0, "expected empty followers");

  const followA = await json(`/api/profiles/${owner.id}/follow`, {
    method: "POST",
    headers: { Authorization: `Bearer ${fanA.token}` },
    body: "{}",
  });
  assert(followA.status === 200, `fanA follow ${followA.status}`);
  const followB = await json(`/api/profiles/${owner.id}/follow`, {
    method: "POST",
    headers: { Authorization: `Bearer ${fanB.token}` },
    body: "{}",
  });
  assert(followB.status === 200, `fanB follow ${followB.status}`);

  const listed = await json(`/api/profiles/${owner.id}/followers`, {
    headers: { Authorization: `Bearer ${viewer.token}` },
  });
  assert(listed.status === 200, `listed ${listed.status}`);
  const users = ((listed.body as { users?: { id?: string; isFollowing?: boolean }[] }).users ?? []).map((u) => u.id);
  assert(users[0] === fanB.id && users[1] === fanA.id, "newest-first ordering failed");
  assert(
    ((listed.body as { users?: { isFollowing?: boolean }[] }).users ?? []).every((u) => u.isFollowing === false),
    "viewer-relative isFollowing should be false",
  );

  const ownerProfile = await json(`/api/profiles/${owner.id}`, {
    headers: { Authorization: `Bearer ${viewer.token}` },
  });
  assert((ownerProfile.body as { user?: { followerCount?: number } }).user?.followerCount === 2, "follower count mismatch");

  const followBack = await json(`/api/profiles/${fanA.id}/follow`, {
    method: "POST",
    headers: { Authorization: `Bearer ${viewer.token}` },
    body: "{}",
  });
  assert(followBack.status === 200, `follow-back ${followBack.status}`);
  const after = await json(`/api/profiles/${owner.id}/followers`, {
    headers: { Authorization: `Bearer ${viewer.token}` },
  });
  const afterUsers = (after.body as { users?: { id?: string; isFollowing?: boolean }[] }).users ?? [];
  assert(afterUsers.find((u) => u.id === fanA.id)?.isFollowing === true, "viewer→fanA follow state missing");
  assert(afterUsers.find((u) => u.id === fanB.id)?.isFollowing === false, "fanB must stay unfollowed by viewer");

  const unfollow = await json(`/api/profiles/${owner.id}/unfollow`, {
    method: "POST",
    headers: { Authorization: `Bearer ${fanA.token}` },
    body: "{}",
  });
  assert(unfollow.status === 200, `unfollow ${unfollow.status}`);
  const afterUnfollow = await json(`/api/profiles/${owner.id}/followers`, {
    headers: { Authorization: `Bearer ${viewer.token}` },
  });
  const remaining = ((afterUnfollow.body as { users?: { id?: string }[] }).users ?? []).map((u) => u.id);
  assert(!remaining.includes(fanA.id), "fanA must leave followers after unfollow");
  assert(remaining.includes(fanB.id), "fanB must remain");

  const countAfter = await json(`/api/profiles/${owner.id}`, {
    headers: { Authorization: `Bearer ${viewer.token}` },
  });
  assert((countAfter.body as { user?: { followerCount?: number } }).user?.followerCount === 1, "count after unfollow");

  await getPool()!.query(`INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2)`, [viewer.id, owner.id]);
  const blocked = await json(`/api/profiles/${owner.id}/followers`, {
    headers: { Authorization: `Bearer ${viewer.token}` },
  });
  assert(blocked.status === 403, `blocked expected 403 got ${blocked.status}`);

  console.log(
    JSON.stringify(
      {
        ok: true,
        page: "PAGE-027",
        health: health.status,
        ownerId: owner.id,
        newestFirst: true,
        viewerRelativeFollow: true,
        countConsistent: true,
        unfollowRemovesRow: true,
        blockEnforced: true,
        owner: "Followers + createFollowersSession + GET /followers",
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
      page: "PAGE-027",
      error: error instanceof Error ? error.message : String(error),
    }),
  );
  process.exitCode = 1;
} finally {
  await closeValkey().catch(() => undefined);
  await getPool()?.end().catch(() => undefined);
}
