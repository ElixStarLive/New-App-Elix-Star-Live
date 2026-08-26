/**
 * PAGE-005 runtime proof — reset-password token validate/consume, Neon hash update,
 * session revoke, old password reject, new password accept, PAGE-004 handoff URL.
 * Run: npx tsx scripts/_page005_reset_runtime_proof.ts
 *
 * Requires running API on :8080 (or PROOF_API_BASE) and NEW Neon DATABASE_URL.
 * Forces local Valkey so Coolify DNS in .env cannot hang socket revoke helpers.
 */
import "dotenv/config";

process.env.VALKEY_URL = "redis://127.0.0.1:6379";
process.env.REDIS_URL = "redis://127.0.0.1:6379";

const { resetEnvCache } = await import("../server/infra/env.ts");
resetEnvCache();

const { default: pg } = await import("pg");
const { SignJWT } = await import("jose");
const {
  issuePasswordResetToken,
  passwordResetBinding,
  passwordResetCallbackUrl,
} = await import("../server/modules/auth/passwordReset.ts");
const { closeValkey } = await import("../server/infra/valkey.ts");

const base = process.env.PROOF_API_BASE?.trim() || "http://127.0.0.1:8080";
const unique = `p5${Date.now().toString(36)}`;
const email = `${unique}@example.com`;
const username = unique.slice(0, 20);
const oldPassword = "password12";
const newPassword = "ResetPass12";

async function json(path: string, init: RequestInit = {}) {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
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
  return String(session.access_token ?? session.accessToken ?? r.access_token ?? r.accessToken ?? "");
}

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error("DATABASE_URL required");
const jwtSecret = process.env.JWT_SECRET?.trim();
if (!jwtSecret) throw new Error("JWT_SECRET required");
if (databaseUrl.includes("ep-autumn-meadow")) {
  throw new Error("Refusing OLD Neon — use NEW DATABASE_URL only");
}

const pool = new pg.Pool({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });

try {
  const registered = await json("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      email,
      username,
      password: oldPassword,
      displayName: username,
      ageConfirmed13Plus: true,
      consentVersion: "2026-07-21",
    }),
  });
  if (registered.status !== 201) {
    throw new Error(`register ${registered.status}: ${JSON.stringify(registered.body)}`);
  }
  const userId = String(asRecord(asRecord(registered.body).user).id ?? "");
  if (!userId) throw new Error("missing user id");

  await pool.query(`UPDATE users SET email_confirmed_at = COALESCE(email_confirmed_at, NOW()) WHERE id = $1`, [
    userId,
  ]);

  const loginBefore = await json("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password: oldPassword }),
  });
  if (loginBefore.status !== 200) throw new Error(`pre-reset login ${loginBefore.status}`);
  const sessionToken = accessToken(loginBefore.body);
  if (!sessionToken) throw new Error("missing session token");

  const meBefore = await fetch(`${base}/api/auth/me`, {
    headers: { Authorization: `Bearer ${sessionToken}` },
  });
  if (meBefore.status !== 200) throw new Error(`me before reset ${meBefore.status}`);

  const hashBefore = await pool.query<{ password_hash: string; email: string }>(
    `SELECT password_hash, email FROM users WHERE id = $1`,
    [userId],
  );
  const passwordHash = hashBefore.rows[0]?.password_hash;
  if (!passwordHash) throw new Error("missing password_hash");
  if (passwordHash === oldPassword || passwordHash === newPassword) {
    throw new Error("plaintext password stored — abort");
  }

  // PAGE-004 → PAGE-005 handoff: forgot is enumeration-safe; issue canonical JWT like mail path.
  const forgot = await json("/api/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
  if (forgot.status !== 200 || JSON.stringify(forgot.body) !== JSON.stringify({ success: true })) {
    throw new Error(`forgot handoff ${forgot.status} ${JSON.stringify(forgot.body)}`);
  }

  const resetToken = await issuePasswordResetToken({
    id: userId,
    email: hashBefore.rows[0].email,
    password_hash: passwordHash,
  });
  const link = passwordResetCallbackUrl(process.env.CLIENT_URL?.trim() || "https://app.example", resetToken);
  if (!link.includes("/reset-password?token=")) throw new Error(`bad PAGE-005 link ${link}`);
  if (link.includes("elixstarlive") && link.includes("auth/callback")) {
    throw new Error("stale verify-email callback used for reset");
  }

  const missing = await json("/api/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ password: newPassword }),
  });
  if (missing.status !== 400) throw new Error(`missing token expected 400, got ${missing.status}`);

  const malformed = await json("/api/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ password: newPassword, token: "not-a-jwt" }),
  });
  if (malformed.status !== 400 && malformed.status !== 401) {
    throw new Error(`malformed expected 400/401, got ${malformed.status}`);
  }

  const weak = await json("/api/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ password: "short", token: resetToken }),
  });
  if (weak.status !== 400) throw new Error(`weak password expected 400, got ${weak.status}`);

  const expired = await new SignJWT({
    email,
    purpose: "password_reset",
    pv: passwordResetBinding(passwordHash),
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(userId)
    .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
    .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
    .sign(new TextEncoder().encode(jwtSecret));
  const expiredRes = await json("/api/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ password: newPassword, token: expired }),
  });
  if (expiredRes.status !== 401) throw new Error(`expired expected 401, got ${expiredRes.status}`);

  const applied = await json("/api/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ password: newPassword, token: resetToken }),
  });
  if (applied.status !== 200 || JSON.stringify(applied.body) !== JSON.stringify({ success: true })) {
    throw new Error(`apply ${applied.status} ${JSON.stringify(applied.body)}`);
  }
  if ("token" in asRecord(applied.body) || "password_hash" in asRecord(applied.body)) {
    throw new Error("reset response leaked secrets");
  }

  const hashAfter = await pool.query<{ password_hash: string }>(
    `SELECT password_hash FROM users WHERE id = $1`,
    [userId],
  );
  const nextHash = hashAfter.rows[0]?.password_hash;
  if (!nextHash) throw new Error("missing hash after reset");
  if (nextHash === passwordHash) throw new Error("password_hash unchanged");
  if (nextHash === newPassword) throw new Error("plaintext new password stored");

  const sessions = await pool.query<{ open: string }>(
    `SELECT COUNT(*)::text AS open FROM auth_sessions WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId],
  );
  if (sessions.rows[0]?.open !== "0") {
    throw new Error(`sessions not revoked: ${sessions.rows[0]?.open}`);
  }

  const meAfter = await fetch(`${base}/api/auth/me`, {
    headers: { Authorization: `Bearer ${sessionToken}` },
  });
  if (meAfter.status !== 401) throw new Error(`old session should be 401, got ${meAfter.status}`);

  const reused = await json("/api/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ password: "AnotherPass9", token: resetToken }),
  });
  if (reused.status !== 401) throw new Error(`reuse expected 401, got ${reused.status}`);
  const reusedErr = String(asRecord(reused.body).error ?? "");
  if (!reusedErr.includes("already been used") && !reusedErr.includes("no longer valid")) {
    throw new Error(`reuse message unexpected: ${reusedErr}`);
  }

  const loginOld = await json("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password: oldPassword }),
  });
  if (loginOld.status !== 401) throw new Error(`old password should fail, got ${loginOld.status}`);

  const loginNew = await json("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password: newPassword }),
  });
  if (loginNew.status !== 200) throw new Error(`new password login ${loginNew.status}`);

  const shell = await fetch("http://127.0.0.1:5173/reset-password?token=probe");
  if (shell.status !== 200) throw new Error(`reset shell expected 200, got ${shell.status}`);

  console.log(
    JSON.stringify(
      {
        ok: true,
        page: "PAGE-005",
        email,
        userId,
        page004Handoff: true,
        neonHashUpdated: true,
        plaintextNeverStored: true,
        sessionsRevoked: true,
        oldPasswordRejected: true,
        newPasswordAccepted: true,
        oneTimeUse: true,
        expiredRejected: true,
        postResetNavigation: "/login (client success → 3s)",
      },
      null,
      2,
    ),
  );
} finally {
  await pool.end();
  await closeValkey().catch(() => undefined);
}
