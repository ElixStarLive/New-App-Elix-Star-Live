/**
 * PAGE-003 runtime proof — unverified → verify-email → Neon → session → /me.
 * Run: npx tsx scripts/_page003_verify_runtime_proof.ts
 */
import "dotenv/config";
import pg from "pg";
import { SignJWT } from "jose";
import { hashPassword } from "../server/infra/password.ts";
import { issueEmailVerifyToken } from "../server/modules/auth/emailVerify.ts";

const base = process.env.PROOF_API_BASE?.trim() || "http://127.0.0.1:8080";
const unique = `p3${Date.now().toString(36)}`;
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
  const reg = asRecord(registered.body);
  const user = asRecord(reg.user);
  const userId = String(user.id ?? "");
  if (!userId) throw new Error("missing user id");

  // Force unverified state (local SMTP usually auto-confirms on register).
  await pool.query(`UPDATE users SET email_confirmed_at = NULL WHERE id = $1`, [userId]);
  const hashRow = await pool.query<{ password_hash: string }>(
    `SELECT password_hash FROM users WHERE id = $1`,
    [userId],
  );
  const passwordHash = hashRow.rows[0]?.password_hash;
  if (!passwordHash) throw new Error("missing password_hash");

  const token = await issueEmailVerifyToken({
    id: userId,
    email,
    email_confirmed_at: null,
    password_hash: passwordHash,
  });

  const missing = await json("/api/auth/verify-email", {
    method: "POST",
    body: JSON.stringify({ token: "" }),
  });
  if (missing.status !== 400) throw new Error(`empty token expected 400, got ${missing.status}`);

  const expired = await new SignJWT({
    email,
    purpose: "email_verify",
    pv: "b".repeat(22),
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(userId)
    .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
    .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
    .sign(new TextEncoder().encode(jwtSecret));
  const expiredRes = await json("/api/auth/verify-email", {
    method: "POST",
    body: JSON.stringify({ token: expired }),
  });
  if (expiredRes.status !== 401) throw new Error(`expired expected 401, got ${expiredRes.status}`);

  const staleTok = await issueEmailVerifyToken({
    id: userId,
    email,
    email_confirmed_at: null,
    password_hash: passwordHash,
  });
  const newHash = await hashPassword("password99xx");
  await pool.query(`UPDATE users SET password_hash = $2 WHERE id = $1`, [userId, newHash]);
  const staleRes = await json("/api/auth/verify-email", {
    method: "POST",
    body: JSON.stringify({ token: staleTok }),
  });
  if (staleRes.status !== 401) throw new Error(`stale binding expected 401, got ${staleRes.status}`);
  const staleBody = asRecord(staleRes.body);
  if (staleBody.error !== "This confirmation link is no longer valid.") {
    throw new Error(`unexpected stale error: ${JSON.stringify(staleBody)}`);
  }
  await pool.query(`UPDATE users SET password_hash = $2 WHERE id = $1`, [userId, passwordHash]);

  const fresh = await issueEmailVerifyToken({
    id: userId,
    email,
    email_confirmed_at: null,
    password_hash: passwordHash,
  });
  const verified = await json("/api/auth/verify-email", {
    method: "POST",
    body: JSON.stringify({ token: fresh }),
  });
  if (verified.status !== 200) throw new Error(`verify ${verified.status}: ${JSON.stringify(verified.body)}`);
  const verifiedBody = asRecord(verified.body);
  const session = asRecord(verifiedBody.session);
  if (session.access_token !== session.accessToken) throw new Error("dual-token mismatch");
  if (verifiedBody.already_confirmed !== false) throw new Error("expected already_confirmed false");
  const accessToken = String(session.access_token ?? "");
  if (!accessToken) throw new Error("missing access token");

  const neon = await pool.query<{ email_confirmed_at: Date | null }>(
    `SELECT email_confirmed_at FROM users WHERE id = $1`,
    [userId],
  );
  if (!neon.rows[0]?.email_confirmed_at) throw new Error("Neon email_confirmed_at not set");

  const reused = await json("/api/auth/verify-email", {
    method: "POST",
    body: JSON.stringify({ token: fresh }),
  });
  if (reused.status !== 200) throw new Error(`reuse expected 200, got ${reused.status}`);
  if (asRecord(reused.body).already_confirmed !== true) throw new Error("expected already_confirmed true");

  const me = await json("/api/auth/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (me.status !== 200) throw new Error(`me expected 200, got ${me.status}`);
  const meUser = asRecord(asRecord(me.body).user);
  if (!String(meUser.email_confirmed_at ?? "")) throw new Error("me missing email_confirmed_at");

  const callbackShell = await fetch(`http://127.0.0.1:5173/auth/callback?token=${encodeURIComponent(fresh)}`);
  if (callbackShell.status !== 200) throw new Error(`callback shell expected 200, got ${callbackShell.status}`);

  console.log(
    JSON.stringify(
      {
        ok: true,
        page: "PAGE-003",
        email,
        userId,
        verifiedStatus: verified.status,
        alreadyConfirmedReuse: true,
        neonConfirmed: true,
        meOk: true,
        navigationHandoff: "/auth/callback → verify → session → /profile (UI)",
      },
      null,
      2,
    ),
  );
} finally {
  await pool.end();
}
