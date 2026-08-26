/**
 * PAGE-042 runtime proof — real enroll/verify/disable against NEW API + Neon user_two_factor.
 * Run: npx tsx scripts/_page042_security_runtime_proof.ts
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
const { totpNow } = await import("../server/infra/totp.ts");

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
  return { status: res.status, body, cache: res.headers.get("cache-control") };
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
  const username = `p42${stamp}${Math.random().toString(36).slice(2, 7)}`.slice(0, 12);
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
  return { id, token, username, email, password };
}

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

try {
  const page = readFileSync(resolve("src/pages/settings/SecuritySettings.tsx"), "utf8");
  const session = readFileSync(resolve("src/features/security/securitySession.ts"), "utf8");
  const api = readFileSync(resolve("src/features/security/securityApi.ts"), "utf8");
  const app = readFileSync(resolve("src/App.tsx"), "utf8");
  const settings = readFileSync(resolve("src/pages/Settings.tsx"), "utf8");
  const router = readFileSync(resolve("server/modules/auth/router.ts"), "utf8");
  const login = readFileSync(resolve("src/pages/Login.tsx"), "utf8");
  const forgot = readFileSync(resolve("src/pages/ForgotPassword.tsx"), "utf8");

  assert(app.includes('path="/settings/security"') && app.includes("element={<SecuritySettings />}"), "one security route");
  assert(page.includes("SettingsOptionSheet") && page.includes('title="Security"'), "sheet owner");
  assert(page.includes("createSecuritySession") && page.includes("nativePrompt"), "session + prompt");
  assert(page.includes("/forgot-password") && page.includes("/settings/blocked"), "password + blocked handoffs");
  assert(settings.includes('go("/settings/security")'), "PAGE-040 handoff");
  assert(api.includes("/api/auth/2fa/status") && api.includes("/api/auth/2fa/enroll"), "status + enroll");
  assert(api.includes("/api/auth/2fa/verify") && api.includes("/api/auth/2fa/disable"), "verify + disable");
  assert(session.includes('kind: "error"') && session.includes("enabled: null"), "fail-closed status");
  assert(!session.includes("localStorage") && !session.includes("console.log"), "no secret persistence/logging");
  assert(router.includes("user_two_factor") && router.includes("encryptSecret"), "Neon encrypted secret");
  assert(!login.includes("/api/auth/2fa/enroll") && !login.includes("otpauth"), "no login TOTP invent");
  assert(forgot.includes("Forgot Password") && !page.includes("authForgotPassword"), "PAGE-004 owns reset");

  const health = await json("/api/health");
  assert(health.status === 200, `health ${health.status}`);

  const unauth = await json("/api/auth/2fa/status");
  assert(unauth.status === 401, `unauth status → ${unauth.status}`);

  const accountA = await register("a");
  const accountB = await register("b");

  const statusA0 = await json("/api/auth/2fa/status", { headers: authHeaders(accountA.token) });
  assert(statusA0.status === 200, `status A0 → ${statusA0.status}`);
  assert(JSON.stringify(statusA0.body) === JSON.stringify({ enabled: false }), "A starts disabled");
  assert(String(statusA0.cache || "").includes("no-store"), "status no-store");

  const enrollA1 = await json("/api/auth/2fa/enroll", {
    method: "POST",
    headers: authHeaders(accountA.token),
    body: "{}",
  });
  assert(enrollA1.status === 200, `enroll A1 → ${enrollA1.status}`);
  const secretA1 = String((enrollA1.body as { secret?: string })?.secret ?? "");
  assert(/^[A-Z2-7]+=*$/i.test(secretA1) && secretA1.length >= 16, "enroll returns base32 secret");
  assert(Boolean((enrollA1.body as { otpauth_url?: string })?.otpauth_url?.startsWith("otpauth://totp/")), "otpauth_url");

  const pending = await getPool()!.query<{ enabled_at: Date | null; secret_encrypted: string }>(
    `SELECT enabled_at, secret_encrypted FROM user_two_factor WHERE user_id = $1`,
    [accountA.id],
  );
  assert(pending.rows.length === 1, "pending Neon row");
  assert(pending.rows[0]?.enabled_at == null, "pending not enabled");
  assert(pending.rows[0]?.secret_encrypted !== secretA1, "secret stored encrypted, not plaintext");

  const enrollA2 = await json("/api/auth/2fa/enroll", {
    method: "POST",
    headers: authHeaders(accountA.token),
    body: "{}",
  });
  assert(enrollA2.status === 200, `reenroll pending → ${enrollA2.status}`);
  const secretA2 = String((enrollA2.body as { secret?: string })?.secret ?? "");
  assert(secretA2 !== secretA1, "pending reenroll rotates secret");

  const staleVerify = await json("/api/auth/2fa/verify", {
    method: "POST",
    headers: authHeaders(accountA.token),
    body: JSON.stringify({ code: totpNow(secretA1) }),
  });
  assert(staleVerify.status === 401, `stale secret verify → ${staleVerify.status}`);
  assert(JSON.stringify((await json("/api/auth/2fa/status", { headers: authHeaders(accountA.token) })).body) === JSON.stringify({ enabled: false }), "still disabled after stale");

  const wrongVerify = await json("/api/auth/2fa/verify", {
    method: "POST",
    headers: authHeaders(accountA.token),
    body: JSON.stringify({ code: "000000" }),
  });
  assert(wrongVerify.status === 401, `wrong code → ${wrongVerify.status}`);

  const emptyVerify = await json("/api/auth/2fa/verify", {
    method: "POST",
    headers: authHeaders(accountA.token),
    body: JSON.stringify({ code: "" }),
  });
  assert(emptyVerify.status === 400 || emptyVerify.status === 401, `empty code → ${emptyVerify.status}`);

  const validVerify = await json("/api/auth/2fa/verify", {
    method: "POST",
    headers: authHeaders(accountA.token),
    body: JSON.stringify({ code: totpNow(secretA2) }),
  });
  assert(validVerify.status === 200, `valid verify → ${validVerify.status}`);
  assert(JSON.stringify(validVerify.body) === JSON.stringify({ ok: true, enabled: true }), "verify body");

  const enabledRow = await getPool()!.query<{ enabled_at: Date | null }>(
    `SELECT enabled_at FROM user_two_factor WHERE user_id = $1`,
    [accountA.id],
  );
  assert(Boolean(enabledRow.rows[0]?.enabled_at), "Neon enabled_at set");
  assert(
    JSON.stringify((await json("/api/auth/2fa/status", { headers: authHeaders(accountA.token) })).body) ===
      JSON.stringify({ enabled: true }),
    "status enabled after verify",
  );

  const reenroll = await json("/api/auth/2fa/enroll", {
    method: "POST",
    headers: authHeaders(accountA.token),
    body: "{}",
  });
  assert(reenroll.status === 409, `duplicate enroll while enabled → ${reenroll.status}`);

  const disableWrong = await json("/api/auth/2fa/disable", {
    method: "POST",
    headers: authHeaders(accountA.token),
    body: JSON.stringify({ code: "111111" }),
  });
  assert(disableWrong.status === 401, `disable wrong → ${disableWrong.status}`);
  assert(
    JSON.stringify((await json("/api/auth/2fa/status", { headers: authHeaders(accountA.token) })).body) ===
      JSON.stringify({ enabled: true }),
    "still enabled after bad disable",
  );

  const forgedDisable = await json("/api/auth/2fa/disable", {
    method: "POST",
    headers: authHeaders(accountA.token),
    body: JSON.stringify({ code: totpNow(secretA2), userId: accountB.id }),
  });
  assert(forgedDisable.status === 200, `session-derived disable → ${forgedDisable.status}`);
  const aGone = await getPool()!.query(`SELECT 1 FROM user_two_factor WHERE user_id = $1`, [accountA.id]);
  const bStill = await getPool()!.query(`SELECT 1 FROM user_two_factor WHERE user_id = $1`, [accountB.id]);
  assert(aGone.rows.length === 0, "A 2FA row deleted");
  assert(bStill.rows.length === 0, "B never had forged 2FA");
  assert(
    JSON.stringify((await json("/api/auth/2fa/status", { headers: authHeaders(accountA.token) })).body) ===
      JSON.stringify({ enabled: false }),
    "A disabled after disable",
  );

  const statusB = await json("/api/auth/2fa/status", { headers: authHeaders(accountB.token) });
  assert(statusB.status === 200 && JSON.stringify(statusB.body) === JSON.stringify({ enabled: false }), "B isolated");

  const bEnrollAsA = await json("/api/auth/2fa/enroll", {
    method: "POST",
    headers: authHeaders(accountB.token),
    body: JSON.stringify({ userId: accountA.id }),
  });
  assert(bEnrollAsA.status === 200, `B enroll still session-owned → ${bEnrollAsA.status}`);
  const bRow = await getPool()!.query(`SELECT user_id FROM user_two_factor WHERE user_id = $1`, [accountB.id]);
  const aRow = await getPool()!.query(`SELECT user_id FROM user_two_factor WHERE user_id = $1`, [accountA.id]);
  assert(bRow.rows.length === 1, "B got own pending row");
  assert(aRow.rows.length === 0, "A not enrolled by B body userId");

  const logoutA = await json("/api/auth/logout", {
    method: "POST",
    headers: authHeaders(accountA.token),
  });
  assert(logoutA.status === 200, `logout A → ${logoutA.status}`);
  const afterLogout = await json("/api/auth/2fa/status", { headers: authHeaders(accountA.token) });
  assert(afterLogout.status === 401, `post-logout 2fa → ${afterLogout.status}`);

  // cleanup B pending
  await getPool()!.query(`DELETE FROM user_two_factor WHERE user_id = $1`, [accountB.id]);

  console.log("PAGE-042 SECURITY RUNTIME PROOF: PASS");
  console.log(
    JSON.stringify(
      {
        statusDisabledThenEnabledThenDisabled: true,
        neonEncryptedSecret: true,
        staleSecretRejected: true,
        wrongCodeRejected: true,
        duplicateEnrollBlocked: true,
        crossAccountUserIdIgnored: true,
        logoutInvalidates: true,
        noLoginTotpInvented: true,
      },
      null,
      2,
    ),
  );
  process.exit(0);
} catch (error) {
  console.error("PAGE-042 SECURITY RUNTIME PROOF: FAIL");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
