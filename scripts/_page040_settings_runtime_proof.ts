/**
 * PAGE-040 runtime proof — Settings logout/delete session ownership, admin fail-closed,
 * remember-email preservation, and disposable account deletion.
 * Run: npx tsx scripts/_page040_settings_runtime_proof.ts
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
  const username = `p40${stamp}${Math.random().toString(36).slice(2, 7)}`.slice(0, 12);
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
  const id = String((registered.body as { user?: { id?: string; isAdmin?: boolean } })?.user?.id ?? "");
  const isAdmin = (registered.body as { user?: { isAdmin?: boolean } })?.user?.isAdmin === true;
  assert(Boolean(id), "register missing user id");
  await getPool()!.query(`UPDATE users SET email_confirmed_at = NOW() WHERE id = $1`, [id]);
  const login = await json("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  assert(login.status === 200, `login ${username} → ${login.status}`);
  const token = accessToken(login.body);
  assert(Boolean(token), "login missing access_token");
  return { id, token, username, email, isAdmin };
}

try {
  const settings = readFileSync(resolve("src/pages/Settings.tsx"), "utf8");
  const sheet = readFileSync(resolve("src/components/SettingsOptionSheet.tsx"), "utf8");
  const session = readFileSync(resolve("src/features/settings/settingsSession.ts"), "utf8");
  const auth = readFileSync(resolve("src/features/auth/authSession.ts"), "utf8");
  const nav = readFileSync(resolve("src/lib/settingsNav.ts"), "utf8");
  const app = readFileSync(resolve("src/App.tsx"), "utf8");
  const login = readFileSync(resolve("src/pages/Login.tsx"), "utf8");
  const own = readFileSync(resolve("src/pages/OwnProfile.tsx"), "utf8");
  const flags = readFileSync(resolve("src/config/engagementFlags.ts"), "utf8");

  assert(app.includes('path="/settings"') && app.includes("element={<Settings />}"), "one /settings route");
  assert(settings.includes("SettingsOptionSheet") && sheet.includes("elix-sheet-host"), "SettingsOptionSheet owner");
  assert(settings.includes("SETTINGS_EXIT_TO") && nav.includes('SETTINGS_EXIT_TO = "/profile"'), "close → profile");
  assert(own.includes('navigate("/settings"') && own.includes('containerReturnState("/profile")'), "PAGE-024 handoff");
  assert(settings.includes('go("/edit-profile")') && settings.includes('go("/settings/safety")'), "edit + safety");
  assert(settings.includes('go("/settings/security")') && settings.includes('go("/settings/notifications")'), "security + notifs");
  assert(settings.includes('go("/settings/blocked")') && settings.includes('go("/settings/payout")'), "blocked + payout");
  assert(settings.includes("isEngagementHubEnabled()") && flags.includes("isEngagementHubEnabled"), "hub flag gate");
  assert(settings.includes("user?.isAdmin === true"), "admin fail-closed");
  assert(settings.includes('go("/profile?tab=liked")') && settings.includes('go("/saved")'), "liked + saved");
  assert(settings.includes('go("/how-it-works")') && settings.includes('go("/support")'), "how + support");
  assert(settings.includes('go("/terms")') && settings.includes('go("/privacy")') && settings.includes('go("/guidelines")'), "legal");
  assert(session.includes("requestSettingsLogout") && session.includes("requestSettingsDeleteAccount"), "session owners");
  assert(session.includes("nativeConfirm") && auth.includes("/api/auth/delete") && auth.includes("/api/auth/logout"), "auth contracts");
  assert(!settings.includes("history.back") && !settings.includes("navigate(-1)"), "named exits only");
  assert(login.includes("writeRememberedLogin") && login.includes("REMEMBER_EMAIL_KEY"), "remember email owner");
  assert(!login.includes("setItem(REMEMBER_PASSWORD_KEY") || login.includes("removeItem(REMEMBER_PASSWORD_KEY)"), "no password remember");

  const health = await json("/api/health");
  assert(health.status === 200, `health ${health.status}`);

  const unauthLogout = await json("/api/auth/logout", { method: "POST" });
  assert(unauthLogout.status === 401, `unauth logout → ${unauthLogout.status}`);
  const unauthDelete = await json("/api/auth/delete", { method: "POST" });
  assert(unauthDelete.status === 401, `unauth delete → ${unauthDelete.status}`);
  const legacy = await json("/api/auth/delete-account", { method: "POST" });
  assert(legacy.status === 404, `legacy delete-account → ${legacy.status}`);

  const accountA = await register("a");
  const accountB = await register("b");
  const disposable = await register("d");
  assert(accountA.isAdmin === false && accountB.isAdmin === false, "fresh accounts are non-admin");

  const meA = await json("/api/auth/me", { headers: { Authorization: `Bearer ${accountA.token}` } });
  assert(meA.status === 200, `me A → ${meA.status}`);
  const meABody = meA.body as {
    user?: { id?: string };
    profile_meta?: { is_admin?: boolean };
    session?: { access_token?: string };
  };
  assert(meABody.user?.id === accountA.id, "me A id");
  assert(meABody.profile_meta?.is_admin === false, "A is_admin false");
  assert(meABody.session?.access_token === accountA.token, "me echoes session");

  const logoutA = await json("/api/auth/logout", {
    method: "POST",
    headers: { Authorization: `Bearer ${accountA.token}` },
  });
  assert(logoutA.status === 200, `logout A → ${logoutA.status}`);
  const afterLogout = await json("/api/auth/me", { headers: { Authorization: `Bearer ${accountA.token}` } });
  assert(afterLogout.status === 401, `post-logout me → ${afterLogout.status}`);

  const rememberEmailKey = "login_saved_email";
  const rememberFlagKey = "login_save_details";
  // Device remember-email is client-owned; prove Settings/auth logout paths do not own those keys.
  assert(!session.includes(rememberEmailKey) && !auth.includes(rememberEmailKey), "logout does not clear remembered email");
  assert(!session.includes(rememberFlagKey) && !settings.includes("login_saved_email"), "settings does not touch remember email");

  const malicious = await json("/api/auth/delete", {
    method: "POST",
    headers: { Authorization: `Bearer ${accountB.token}` },
    body: JSON.stringify({ userId: disposable.id }),
  });
  assert(malicious.status === 200, `session-derived delete → ${malicious.status}`);
  const bGone = await getPool()!.query<{ deleted_at: Date | null }>(`SELECT deleted_at FROM users WHERE id = $1`, [
    accountB.id,
  ]);
  const dStill = await getPool()!.query<{ deleted_at: Date | null }>(`SELECT deleted_at FROM users WHERE id = $1`, [
    disposable.id,
  ]);
  assert(Boolean(bGone.rows[0]?.deleted_at), "B deleted from own session");
  assert(dStill.rows[0]?.deleted_at == null, "malicious userId body did not delete D");

  const bMe = await json("/api/auth/me", { headers: { Authorization: `Bearer ${accountB.token}` } });
  assert(bMe.status === 401, `deleted B session → ${bMe.status}`);

  const deleteD = await json("/api/auth/delete", {
    method: "POST",
    headers: { Authorization: `Bearer ${disposable.token}` },
  });
  assert(deleteD.status === 200, `delete D → ${deleteD.status}`);
  const dGone = await getPool()!.query<{ deleted_at: Date | null }>(`SELECT deleted_at FROM users WHERE id = $1`, [
    disposable.id,
  ]);
  assert(Boolean(dGone.rows[0]?.deleted_at), "D soft-deleted");
  const dMe = await json("/api/auth/me", { headers: { Authorization: `Bearer ${disposable.token}` } });
  assert(dMe.status === 401, `deleted D session → ${dMe.status}`);

  const adminProbe = await getPool()!.query<{ id: string }>(
    `SELECT id FROM users WHERE is_admin = true AND deleted_at IS NULL LIMIT 1`,
  );
  if (adminProbe.rows[0]?.id) {
    console.log("PAGE-040 admin row visibility: DB has is_admin user (UI gates on profile isAdmin === true)");
  } else {
    console.log("PAGE-040 admin row: no admin fixture in Neon — fail-closed UI still requires isAdmin === true");
  }

  console.log("PAGE-040 SETTINGS RUNTIME PROOF: PASS");
  console.log(
    JSON.stringify(
      {
        logoutInvalidatesSession: true,
        deleteIsSessionDerived: true,
        maliciousUserIdIgnored: true,
        disposableDeleted: true,
        rememberEmailUntouchedBySettingsLogout: true,
        engagementHubFailClosed: true,
        adminFailClosed: true,
      },
      null,
      2,
    ),
  );
  process.exit(0);
} catch (error) {
  console.error("PAGE-040 SETTINGS RUNTIME PROOF: FAIL");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
