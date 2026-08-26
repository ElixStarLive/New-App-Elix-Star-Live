/**
 * PAGE-028 runtime proof — following list against NEW API + Neon.
 * Run: npx tsx scripts/_page028_following_runtime_proof.ts
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
  const username = `p28r${stamp}${Math.random().toString(36).slice(2, 7)}`.slice(0, 12);
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
  const page = readFileSync(resolve("src/pages/FollowingList.tsx"), "utf8");
  const session = readFileSync(resolve("src/features/profile/followingSession.ts"), "utf8");
  const api = readFileSync(resolve("src/features/profile/followingApi.ts"), "utf8");
  const app = readFileSync(resolve("src/App.tsx"), "utf8");
  const router = readFileSync(resolve("server/modules/profile/router.ts"), "utf8");
  const feedApi = readFileSync(resolve("src/features/feed/feedApi.ts"), "utf8");

  assert(app.includes('path="/profile/:userId/following" element={<FollowingList />}'), "route missing");
  assert(api.includes("/following"), "following GET missing");
  assert(!api.includes("/followers"), "must not query followers list");
  assert(session.includes("apiFetchFollowing"), "session owner missing");
  assert(page.includes("subscribeFollowRelationship"), "cross-page sync missing");
  assert(page.includes("Not following anyone yet."), "empty copy missing");
  assert(!page.includes("Follow Back"), "Follow Back not in OLD");
  assert(router.includes("JOIN users u ON u.id = f.followee_id"), "wrong relationship direction");
  assert(router.includes("WHERE f.follower_id = $1"), "wrong relationship direction");
  assert(feedApi.includes("publishFollowRelationship"), "canonical follow publish missing");
  assert(session.includes("isOwnList"), "own-list membership rule missing");

  await requireValkey().ping();
  const health = await json("/api/health");
  assert(health.status === 200, `health ${health.status}`);

  const accountA = await register("a");
  const accountB = await register("b");
  const accountC = await register("c");

  const followAB = await json(`/api/profiles/${accountB.id}/follow`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accountA.token}` },
    body: "{}",
  });
  assert(followAB.status === 200, `A→B follow ${followAB.status}`);

  const aFollowing = await json(`/api/profiles/${accountA.id}/following`, {
    headers: { Authorization: `Bearer ${accountA.token}` },
  });
  assert(aFollowing.status === 200, `A following ${aFollowing.status}`);
  const aUsers = ((aFollowing.body as { users?: { id?: string; isFollowing?: boolean }[] }).users ?? []).map((u) => u.id);
  assert(aUsers.includes(accountB.id), "B missing from A following");
  assert(
    ((aFollowing.body as { users?: { isFollowing?: boolean }[] }).users ?? []).find((u) => u.id === accountB.id)
      ?.isFollowing === true,
    "own list isFollowing must be true",
  );

  const aProfile = await json(`/api/profiles/${accountA.id}`, {
    headers: { Authorization: `Bearer ${accountA.token}` },
  });
  assert((aProfile.body as { user?: { followingCount?: number } }).user?.followingCount === 1, "A following count");

  const unfollowAB = await json(`/api/profiles/${accountB.id}/unfollow`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accountA.token}` },
    body: "{}",
  });
  assert(unfollowAB.status === 200, `A unfollow B ${unfollowAB.status}`);
  const aAfter = await json(`/api/profiles/${accountA.id}/following`, {
    headers: { Authorization: `Bearer ${accountA.token}` },
  });
  assert(!(((aAfter.body as { users?: { id?: string }[] }).users ?? []).map((u) => u.id).includes(accountB.id)), "B must leave A following");
  const aCount = await json(`/api/profiles/${accountA.id}`, {
    headers: { Authorization: `Bearer ${accountA.token}` },
  });
  assert((aCount.body as { user?: { followingCount?: number } }).user?.followingCount === 0, "A count after unfollow");

  const bFollowers = await json(`/api/profiles/${accountB.id}/followers`, {
    headers: { Authorization: `Bearer ${accountA.token}` },
  });
  assert(!(((bFollowers.body as { users?: { id?: string }[] }).users ?? []).map((u) => u.id).includes(accountA.id)), "A must leave B followers");

  const followBC = await json(`/api/profiles/${accountC.id}/follow`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accountB.token}` },
    body: "{}",
  });
  assert(followBC.status === 200, `B→C follow ${followBC.status}`);

  const bFollowingAsA = await json(`/api/profiles/${accountB.id}/following`, {
    headers: { Authorization: `Bearer ${accountA.token}` },
  });
  assert(bFollowingAsA.status === 200, `B following as A ${bFollowingAsA.status}`);
  const bRows = (bFollowingAsA.body as { users?: { id?: string; isFollowing?: boolean }[] }).users ?? [];
  assert(bRows.some((u) => u.id === accountC.id), "C must appear because B follows C");
  assert(bRows.find((u) => u.id === accountC.id)?.isFollowing === false, "A does not follow C yet");

  const aFollowC = await json(`/api/profiles/${accountC.id}/follow`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accountA.token}` },
    body: "{}",
  });
  assert(aFollowC.status === 200, `A→C follow ${aFollowC.status}`);

  const bStill = await json(`/api/profiles/${accountB.id}/following`, {
    headers: { Authorization: `Bearer ${accountA.token}` },
  });
  const bStillRows = (bStill.body as { users?: { id?: string; isFollowing?: boolean }[] }).users ?? [];
  assert(bStillRows.some((u) => u.id === accountC.id), "B→C must remain after A→C");
  assert(bStillRows.find((u) => u.id === accountC.id)?.isFollowing === true, "viewer A→C state on B's list");

  // A cannot remove B→C by unfollowing C — B's following still contains C.
  await json(`/api/profiles/${accountC.id}/unfollow`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accountA.token}` },
    body: "{}",
  });
  const bAfterAUnfollowC = await json(`/api/profiles/${accountB.id}/following`, {
    headers: { Authorization: `Bearer ${accountB.token}` },
  });
  assert(
    ((bAfterAUnfollowC.body as { users?: { id?: string }[] }).users ?? []).some((u) => u.id === accountC.id),
    "A unfollow C must not delete B→C",
  );

  const followingFeed = await json("/api/feed/following", {
    headers: { Authorization: `Bearer ${accountA.token}` },
  });
  assert(followingFeed.status === 200, `following feed ${followingFeed.status}`);

  await getPool()!.query(`INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2)`, [accountA.id, accountB.id]);
  const blocked = await json(`/api/profiles/${accountB.id}/following`, {
    headers: { Authorization: `Bearer ${accountA.token}` },
  });
  assert(blocked.status === 403, `blocked expected 403 got ${blocked.status}`);

  console.log(
    JSON.stringify(
      {
        ok: true,
        page: "PAGE-028",
        health: health.status,
        accountA: accountA.id,
        accountB: accountB.id,
        accountC: accountC.id,
        ownUnfollowRemoves: true,
        publicListSecurity: true,
        inverseFollowersConsistent: true,
        followingFeedOk: true,
        blockEnforced: true,
        owner: "FollowingList + createFollowingSession + GET /following",
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
      page: "PAGE-028",
      error: error instanceof Error ? error.message : String(error),
    }),
  );
  process.exitCode = 1;
} finally {
  await closeValkey().catch(() => undefined);
  await getPool()?.end().catch(() => undefined);
}
