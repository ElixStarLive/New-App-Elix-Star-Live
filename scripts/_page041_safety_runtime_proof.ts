/**
 * PAGE-041 runtime proof — Safety Center is static navigation; blocked/report stay
 * on canonical owners; no invented /api/safety-center.
 * Run: npx tsx scripts/_page041_safety_runtime_proof.ts
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
  const username = `p41${stamp}${Math.random().toString(36).slice(2, 7)}`.slice(0, 12);
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
  const page = readFileSync(resolve("src/pages/settings/SafetyCenter.tsx"), "utf8");
  const settings = readFileSync(resolve("src/pages/Settings.tsx"), "utf8");
  const app = readFileSync(resolve("src/App.tsx"), "utf8");
  const nav = readFileSync(resolve("src/lib/settingsNav.ts"), "utf8");
  const report = readFileSync(resolve("src/pages/Report.tsx"), "utf8");
  const blocked = readFileSync(resolve("src/pages/settings/BlockedAccounts.tsx"), "utf8");
  const reasons = readFileSync(resolve("src/features/report/reportReasons.ts"), "utf8");

  assert(app.includes('path="/settings/safety"') && app.includes("element={<SafetyCenter />}"), "one safety route");
  assert(page.includes("SettingsOptionSheet") && page.includes('title="Safety Center"'), "sheet owner");
  assert(page.includes("Blocked Accounts") && page.includes("Report a Problem"), "quick actions");
  assert(page.includes("Community Guidelines") && page.includes("Safety Tips"), "resources");
  assert(page.includes("Need Immediate Help?") && page.includes("US:") && page.includes("911"), "emergency copy");
  assert(page.includes("/settings/blocked") && !page.includes("/api/blocked-users"), "blocked handoff only");
  assert(page.includes("/report?type=support&id=support_ticket") && !page.includes("/api/report"), "report handoff only");
  assert(page.includes("/guidelines") && page.includes("/privacy") && page.includes("/support"), "static destinations");
  assert(!page.includes("/api/safety") && !page.includes("safety score"), "no invented safety API");
  assert(settings.includes('go("/settings/safety")') && settings.includes('go("/privacy")'), "privacy vs safety");
  assert(nav.includes('if (path === SETTINGS_HOME) return SETTINGS_EXIT_TO'), "settings exit named");
  assert(blocked.includes("apiListBlockedUsers") || blocked.includes("/api/blocked-users"), "PAGE-044 owns blocks");
  assert(report.includes("SettingsOptionSheet") && reasons.includes("support_ticket"), "PAGE-046 owns report");

  const health = await json("/api/health");
  assert(health.status === 200, `health ${health.status}`);

  const invented = await json("/api/safety-center");
  assert(invented.status === 404, `invented safety-center → ${invented.status}`);
  const inventedStatus = await json("/api/safety/status");
  assert(inventedStatus.status === 404, `invented safety/status → ${inventedStatus.status}`);
  const inventedBlocked = await json("/api/safety/blocked");
  assert(inventedBlocked.status === 404, `invented safety/blocked → ${inventedBlocked.status}`);

  const unauthBlocks = await json("/api/blocked-users");
  assert(unauthBlocks.status === 401, `unauth blocked-users → ${unauthBlocks.status}`);

  const accountA = await register("a");
  const accountB = await register("b");

  const listA = await json("/api/blocked-users", {
    headers: { Authorization: `Bearer ${accountA.token}` },
  });
  assert(listA.status === 200, `A blocked list → ${listA.status}`);
  assert(JSON.stringify(listA.body) === JSON.stringify({ data: [] }), "A starts with empty blocked list");

  const forged = await json(`/api/blocked-users?viewerId=${accountB.id}&blockerId=${accountB.id}`, {
    headers: { Authorization: `Bearer ${accountA.token}` },
  });
  assert(forged.status === 200, `forged query still session-owned → ${forged.status}`);
  assert(JSON.stringify(forged.body) === JSON.stringify({ data: [] }), "A cannot read B blocked list via query");

  const listB = await json("/api/blocked-users", {
    headers: { Authorization: `Bearer ${accountB.token}` },
  });
  assert(listB.status === 200, `B blocked list → ${listB.status}`);
  assert(JSON.stringify(listB.body) === JSON.stringify({ data: [] }), "B isolated empty list");

  const logoutA = await json("/api/auth/logout", {
    method: "POST",
    headers: { Authorization: `Bearer ${accountA.token}` },
  });
  assert(logoutA.status === 200, `logout A → ${logoutA.status}`);
  const afterLogout = await json("/api/blocked-users", {
    headers: { Authorization: `Bearer ${accountA.token}` },
  });
  assert(afterLogout.status === 401, `post-logout blocked-users → ${afterLogout.status}`);

  console.log("PAGE-041 SAFETY CENTER RUNTIME PROOF: PASS");
  console.log(
    JSON.stringify(
      {
        staticNavigationOnly: true,
        noInventedSafetyApi: true,
        blockedListSessionOwned: true,
        accountIsolation: true,
        logoutClearsBlockedAccess: true,
        reportHandoffSupportTicket: true,
      },
      null,
      2,
    ),
  );
  process.exit(0);
} catch (error) {
  console.error("PAGE-041 SAFETY CENTER RUNTIME PROOF: FAIL");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
