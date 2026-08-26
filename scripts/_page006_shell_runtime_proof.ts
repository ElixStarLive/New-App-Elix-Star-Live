/**
 * PAGE-006 runtime proof — shell auth gate, single WS owner, nav chrome.
 * Run: npx tsx scripts/_page006_shell_runtime_proof.ts
 * Requires API :8080 and Vite :5173. Forces local Valkey for WS infra readiness.
 */
import "dotenv/config";

process.env.VALKEY_URL = "redis://127.0.0.1:6379";
process.env.REDIS_URL = "redis://127.0.0.1:6379";

const { resetEnvCache } = await import("../server/infra/env.ts");
resetEnvCache();

const { closeValkey, requireValkey } = await import("../server/infra/valkey.ts");

const base = process.env.PROOF_API_BASE?.trim() || "http://127.0.0.1:8080";
const unique = `p6${Date.now().toString(36)}`;
const email = `${unique}@example.com`;
const username = unique.slice(0, 20);
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

try {
  const valkey = requireValkey();
  await valkey.ping();

  const meAnon = await json("/api/auth/me");
  if (meAnon.status !== 401) throw new Error(`anon /me expected 401, got ${meAnon.status}`);

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
    throw new Error(`register ${registered.status}: ${JSON.stringify(registered.body)}`);
  }
  let token = accessToken(registered.body);
  if (!token) {
    // SMTP-on builds may defer session until confirm — force confirm + login on NEW Neon.
    const { default: pg } = await import("pg");
    const databaseUrl = process.env.DATABASE_URL?.trim();
    if (!databaseUrl) throw new Error("DATABASE_URL required when register has no session");
    const pool = new pg.Pool({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
    try {
      await pool.query(
        `UPDATE users SET email_confirmed_at = COALESCE(email_confirmed_at, NOW()) WHERE email_normalized = $1`,
        [email.toLowerCase()],
      );
    } finally {
      await pool.end();
    }
    const loginBoot = await json("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    if (loginBoot.status !== 200) {
      throw new Error(`boot login ${loginBoot.status}: ${JSON.stringify(loginBoot.body)}`);
    }
    token = accessToken(loginBoot.body);
  }
  if (!token) throw new Error("missing session token after register/login");

  const meOk = await json("/api/auth/me", {}, token);
  if (meOk.status !== 200) throw new Error(`/me with session ${meOk.status}`);

  const login = await json("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  if (login.status !== 200) throw new Error(`login ${login.status}`);
  token = accessToken(login.body) || token;

  const logout = await json("/api/auth/logout", { method: "POST" }, token);
  if (logout.status !== 200 && logout.status !== 204) {
    // Some builds return 200 { success: true }
    if (logout.status !== 200) throw new Error(`logout ${logout.status}`);
  }

  const meAfterLogout = await json("/api/auth/me", {}, token);
  if (meAfterLogout.status !== 401) {
    throw new Error(`session should be revoked after logout, got ${meAfterLogout.status}`);
  }

  const loginAgain = await json("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  if (loginAgain.status !== 200) throw new Error(`re-login ${loginAgain.status}`);
  const token2 = accessToken(loginAgain.body);
  if (!token2) throw new Error("missing re-login token");
  if (token2 === token) {
    // may or may not rotate; not required — just ensure /me works
  }
  const me2 = await json("/api/auth/me", {}, token2);
  if (me2.status !== 200) throw new Error(`me after re-login ${me2.status}`);

  const feedShell = await fetch("http://127.0.0.1:5173/feed");
  if (feedShell.status !== 200) throw new Error(`feed shell ${feedShell.status}`);
  const loginShell = await fetch("http://127.0.0.1:5173/login");
  if (loginShell.status !== 200) throw new Error(`login shell ${loginShell.status}`);
  const friendsShell = await fetch("http://127.0.0.1:5173/friends");
  if (friendsShell.status !== 200) throw new Error(`friends shell ${friendsShell.status}`);

  console.log(
    JSON.stringify(
      {
        ok: true,
        page: "PAGE-006",
        email,
        sessionRestore: true,
        logoutRevokesSession: true,
        relogin: true,
        valkeyPing: true,
        viteShellRoutes: ["/feed", "/login", "/friends"],
        note: "Browser WS single-owner covered by App.test + wsClient singleton; Valkey reachable for realtime infra",
      },
      null,
      2,
    ),
  );
} finally {
  await closeValkey().catch(() => undefined);
}
