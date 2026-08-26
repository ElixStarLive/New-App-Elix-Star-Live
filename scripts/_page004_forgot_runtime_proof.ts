/**
 * PAGE-004 runtime proof — forgot-password enumeration, Valkey rate limit,
 * purpose JWT handoff to reset-password (PAGE-005 consume path).
 * Run: npx tsx scripts/_page004_forgot_runtime_proof.ts
 *
 * Requires a running API with SMTP_URL set (send may fail; response stays 200)
 * and local Valkey. Forces VALKEY_URL to localhost so Coolify DNS in .env cannot hang.
 */
import "dotenv/config";

process.env.VALKEY_URL = "redis://127.0.0.1:6379";
process.env.REDIS_URL = "redis://127.0.0.1:6379";

const { resetEnvCache } = await import("../server/infra/env.ts");
resetEnvCache();

const { default: pg } = await import("pg");
const { SignJWT } = await import("jose");
const { issuePasswordResetToken, passwordResetCallbackUrl, passwordResetRequestKey } = await import(
  "../server/modules/auth/passwordReset.ts"
);
const { valkeyDel, closeValkey } = await import("../server/infra/valkey.ts");

const base = process.env.PROOF_API_BASE?.trim() || "http://127.0.0.1:8080";
const unique = `p4${Date.now().toString(36)}`;
const email = `${unique}@example.com`;
const username = unique.slice(0, 20);
const password = "password12";

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

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error("DATABASE_URL required");
const jwtSecret = process.env.JWT_SECRET?.trim();
if (!jwtSecret) throw new Error("JWT_SECRET required");

const pool = new pg.Pool({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });

try {
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
  if (registered.status !== 201) {
    throw new Error(`register ${registered.status}: ${JSON.stringify(registered.body)}`);
  }
  const userId = String(asRecord(asRecord(registered.body).user).id ?? "");
  if (!userId) throw new Error("missing user id");

  await pool.query(`UPDATE users SET email_confirmed_at = COALESCE(email_confirmed_at, NOW()) WHERE id = $1`, [
    userId,
  ]);
  await valkeyDel(passwordResetRequestKey(email.toLowerCase()));

  const unknown = await json("/api/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email: `nobody-${unique}@example.com` }),
  });
  const known = await json("/api/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email: `  ${email.toUpperCase()}  ` }),
  });
  if (unknown.status !== 200 || known.status !== 200) {
    throw new Error(`enumeration shape failed unknown=${unknown.status} known=${known.status}`);
  }
  if (JSON.stringify(unknown.body) !== JSON.stringify({ success: true })) {
    throw new Error(`unknown body ${JSON.stringify(unknown.body)}`);
  }
  if (JSON.stringify(known.body) !== JSON.stringify({ success: true })) {
    throw new Error(`known body ${JSON.stringify(known.body)}`);
  }
  if ("token" in asRecord(known.body)) throw new Error("token leaked in forgot response");

  const hashRow = await pool.query<{ password_hash: string; email: string }>(
    `SELECT password_hash, email FROM users WHERE id = $1`,
    [userId],
  );
  const passwordHash = hashRow.rows[0]?.password_hash;
  if (!passwordHash) throw new Error("missing password_hash");
  const resetToken = await issuePasswordResetToken({
    id: userId,
    email: hashRow.rows[0].email,
    password_hash: passwordHash,
  });
  const link = passwordResetCallbackUrl("https://app.example", resetToken);
  if (!link.startsWith("https://app.example/reset-password?token=")) {
    throw new Error(`bad reset link ${link}`);
  }

  const expired = await new SignJWT({
    email,
    purpose: "password_reset",
    pv: "c".repeat(22),
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(userId)
    .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
    .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
    .sign(new TextEncoder().encode(jwtSecret));
  const expiredRes = await json("/api/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ token: expired, password: "password99xx" }),
  });
  if (expiredRes.status !== 401) throw new Error(`expired reset expected 401, got ${expiredRes.status}`);

  const resetOk = await json("/api/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ token: resetToken, password: "password99xx" }),
  });
  if (resetOk.status !== 200) {
    throw new Error(`reset-password ${resetOk.status}: ${JSON.stringify(resetOk.body)}`);
  }

  const reused = await json("/api/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ token: resetToken, password: "password88yy" }),
  });
  if (reused.status !== 401) throw new Error(`reused token expected 401, got ${reused.status}`);

  const loginNew = await json("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password: "password99xx" }),
  });
  if (loginNew.status !== 200) throw new Error(`login after reset ${loginNew.status}`);

  const loginOld = await json("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  if (loginOld.status !== 401) throw new Error(`old password should fail, got ${loginOld.status}`);

  const rateEmail = `rate-${unique}@example.com`;
  await valkeyDel(passwordResetRequestKey(rateEmail.toLowerCase()));
  for (let i = 0; i < 3; i += 1) {
    const r = await json("/api/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email: rateEmail }),
    });
    if (r.status !== 200) throw new Error(`forgot ${i} expected 200, got ${r.status}`);
  }
  const limited = await json("/api/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email: rateEmail }),
  });
  if (limited.status !== 429) throw new Error(`rate limit expected 429, got ${limited.status}`);

  const shell = await fetch("http://127.0.0.1:5173/forgot-password");
  if (shell.status !== 200) throw new Error(`forgot shell expected 200, got ${shell.status}`);

  console.log(
    JSON.stringify(
      {
        ok: true,
        page: "PAGE-004",
        email,
        userId,
        enumeration: "unknown===known===200 success:true",
        page005Consume: true,
        oneTimeUse: true,
        rateLimited: true,
        note: "SMTP send may fail to :9; forgot response stays non-enumerating",
      },
      null,
      2,
    ),
  );
} finally {
  await pool.end();
  await closeValkey().catch(() => undefined);
}
