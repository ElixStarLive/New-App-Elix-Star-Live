/**
 * PAGE-044 runtime proof — block/unblock Neon ownership, camel list wire, cross-account isolation.
 * Run: npx tsx scripts/_page044_blocked_runtime_proof.ts
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

delete process.env.TEST_DATABASE_URL;
if (process.env.NODE_ENV === "test") process.env.NODE_ENV = "development";

process.env.VALKEY_URL = process.env.VALKEY_URL || "redis://127.0.0.1:6379";
process.env.REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";

const { resetEnvCache } = await import("../server/infra/env.ts");
resetEnvCache();

const { getPool } = await import("../server/infra/postgres.ts");
const { isBlockedEitherWay } = await import("../server/modules/blocks/service.ts");
const { blockedUsersResponseSchema } = await import("../shared/contracts/social.ts");

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
  const username = `p44${stamp}${Math.random().toString(36).slice(2, 7)}`.slice(0, 12);
  const email = `${username}@example.com`;
  const password = "password12";
  const registered = await json("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      email,
      username,
      password,
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
    body: JSON.stringify({ email, password }),
  });
  assert(login.status === 200, `login ${username} → ${login.status}`);
  const token = accessToken(login.body);
  assert(Boolean(token), "login missing access_token");
  return { id, token, username };
}

try {
  const page = readFileSync(resolve("src/pages/settings/BlockedAccounts.tsx"), "utf8");
  const api = readFileSync(resolve("src/features/blocks/blockedUsersApi.ts"), "utf8");
  const session = readFileSync(resolve("src/features/blocks/blockedUsersSession.ts"), "utf8");
  const router = readFileSync(resolve("server/modules/blocks/router.ts"), "utf8");
  const service = readFileSync(resolve("server/modules/blocks/service.ts"), "utf8");
  const settings = readFileSync(resolve("src/pages/Settings.tsx"), "utf8");
  const safety = readFileSync(resolve("src/pages/settings/SafetyCenter.tsx"), "utf8");
  const signaling = readFileSync(resolve("server/modules/calls/signaling.ts"), "utf8");
  const app = readFileSync(resolve("src/App.tsx"), "utf8");

  assert(app.includes('path="/settings/blocked"'), "one blocked route");
  assert(page.includes("SettingsOptionSheet") && page.includes('title="Blocked Accounts"'), "sheet");
  assert(page.includes("createBlockedUsersSession") && !page.includes("localStorage"), "session owner");
  assert(settings.includes('go("/settings/blocked")') && safety.includes('go("/settings/blocked")'), "handoffs");
  assert(api.includes("/api/blocked-users") && api.includes("/api/unblock-user"), "canonical APIs");
  assert(router.includes("listBlockedUsers(req.userId") && !router.includes("blocked_user_id:"), "camel wire");
  assert(service.includes("FROM blocks") && service.includes("ON CONFLICT DO NOTHING"), "Neon blocks");
  assert(signaling.includes('reason: "blocked"') && signaling.includes("isBlockedEitherWay"), "call block");
  assert(session.includes("pending.has") && session.includes("generation"), "races + double-tap");

  const health = await json("/api/health");
  assert(health.status === 200, `health ${health.status}`);
  assert((await json("/api/blocked-users")).status === 401, "unauth list");
  assert((await json("/api/unblock-user", { method: "POST", body: "{}" })).status === 401, "unauth unblock");
  assert((await json("/api/safety/blocked")).status === 404, "no invented safety list");

  const accountA = await register("a");
  const accountB = await register("b");
  const accountC = await register("c");

  const empty = await json("/api/blocked-users", {
    headers: { Authorization: `Bearer ${accountA.token}` },
  });
  assert(empty.status === 200, `empty list → ${empty.status}`);
  assert(JSON.stringify(empty.body) === JSON.stringify({ data: [] }), "empty data");
  assert(blockedUsersResponseSchema.safeParse(empty.body).success, "empty camel schema");

  const selfBlock = await json(`/api/block/${accountA.id}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accountA.token}` },
    body: "{}",
  });
  assert(selfBlock.status === 400, `self block → ${selfBlock.status}`);

  const blockB = await json(`/api/block/${accountB.id}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accountA.token}` },
    body: JSON.stringify({ blockerId: accountC.id }),
  });
  assert(blockB.status === 200, `block B → ${blockB.status}`);
  const blockC = await json(`/api/block/${accountC.id}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accountA.token}` },
    body: "{}",
  });
  assert(blockC.status === 200, `block C → ${blockC.status}`);

  await getPool()!.query(`UPDATE blocks SET created_at = $3 WHERE blocker_id = $1 AND blocked_id = $2`, [
    accountA.id,
    accountB.id,
    "2026-01-01T00:00:00.000Z",
  ]);
  await getPool()!.query(`UPDATE blocks SET created_at = $3 WHERE blocker_id = $1 AND blocked_id = $2`, [
    accountA.id,
    accountC.id,
    "2026-08-01T00:00:00.000Z",
  ]);

  const listA = await json("/api/blocked-users", {
    headers: { Authorization: `Bearer ${accountA.token}` },
  });
  assert(listA.status === 200, `list A → ${listA.status}`);
  const parsed = blockedUsersResponseSchema.safeParse(listA.body);
  assert(parsed.success, "list parses camel NEW contract");
  assert(
    parsed.success && parsed.data.data.map((row) => row.blockedUserId).join(",") === `${accountC.id},${accountB.id}`,
    "newest-first order C then B",
  );
  assert(!(listA.body as { data?: unknown[] }).data?.some((row) => "blocked_user_id" in (row as object)), "no snake fields");

  const neon = await getPool()!.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM blocks WHERE blocker_id = $1`,
    [accountA.id],
  );
  assert(neon.rows[0]?.n === 2, "two Neon block rows");

  const listB = await json("/api/blocked-users", {
    headers: { Authorization: `Bearer ${accountB.token}` },
  });
  assert(JSON.stringify(listB.body) === JSON.stringify({ data: [] }), "B cannot read A list");

  const profileBlocked = await json(`/api/profiles/${accountB.id}`, {
    headers: { Authorization: `Bearer ${accountA.token}` },
  });
  assert(profileBlocked.status === 403, `profile blocked → ${profileBlocked.status}`);

  const messageBlocked = await json("/api/inbox/threads", {
    method: "POST",
    headers: { Authorization: `Bearer ${accountA.token}` },
    body: JSON.stringify({ userId: accountB.id }),
  });
  assert(messageBlocked.status === 403, `chat blocked → ${messageBlocked.status}`);

  assert(await isBlockedEitherWay(accountA.id, accountB.id), "call block either-way true");

  const foreignUnblock = await json("/api/unblock-user", {
    method: "POST",
    headers: { Authorization: `Bearer ${accountB.token}` },
    body: JSON.stringify({ blockedUserId: accountC.id, blockerId: accountA.id }),
  });
  assert(foreignUnblock.status === 200, `foreign unblock returns success but no-op → ${foreignUnblock.status}`);
  const still = await getPool()!.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM blocks WHERE blocker_id = $1 AND blocked_id = $2`,
    [accountA.id, accountC.id],
  );
  assert(still.rows[0]?.n === 1, "C remains blocked by A");

  const unblockB = await json("/api/unblock-user", {
    method: "POST",
    headers: { Authorization: `Bearer ${accountA.token}` },
    body: JSON.stringify({ blockedUserId: accountB.id }),
  });
  assert(unblockB.status === 200 && JSON.stringify(unblockB.body) === JSON.stringify({ success: true }), "unblock B");
  const again = await json("/api/unblock-user", {
    method: "POST",
    headers: { Authorization: `Bearer ${accountA.token}` },
    body: JSON.stringify({ blockedUserId: accountB.id }),
  });
  assert(again.status === 200, `idempotent unblock → ${again.status}`);

  const after = await json("/api/blocked-users", {
    headers: { Authorization: `Bearer ${accountA.token}` },
  });
  const afterParsed = blockedUsersResponseSchema.safeParse(after.body);
  assert(afterParsed.success && afterParsed.data.data.map((r) => r.blockedUserId).join(",") === accountC.id, "only C left");

  const profileOpen = await json(`/api/profiles/${accountB.id}`, {
    headers: { Authorization: `Bearer ${accountA.token}` },
  });
  assert(profileOpen.status === 200, `profile open after unblock → ${profileOpen.status}`);
  assert(!(await isBlockedEitherWay(accountA.id, accountB.id)), "call block cleared");

  const logoutA = await json("/api/auth/logout", {
    method: "POST",
    headers: { Authorization: `Bearer ${accountA.token}` },
  });
  assert(logoutA.status === 200, `logout → ${logoutA.status}`);
  assert(
    (await json("/api/blocked-users", { headers: { Authorization: `Bearer ${accountA.token}` } })).status === 401,
    "post-logout list 401",
  );

  await getPool()!.query(`DELETE FROM blocks WHERE blocker_id = $1`, [accountA.id]);

  console.log("PAGE-044 BLOCKED ACCOUNTS RUNTIME PROOF: PASS");
  console.log(
    JSON.stringify(
      {
        camelBlockedUsersWire: true,
        neonBlocksAuthoritative: true,
        newestFirstOrdering: true,
        crossAccountListIsolated: true,
        crossAccountUnblockNoOp: true,
        profileAndChatBlocked: true,
        callBlockEitherWay: true,
        unblockIdempotent: true,
      },
      null,
      2,
    ),
  );
  process.exit(0);
} catch (error) {
  console.error("PAGE-044 BLOCKED ACCOUNTS RUNTIME PROOF: FAIL");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
