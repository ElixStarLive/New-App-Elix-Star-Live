/**
 * PAGE-002 runtime proof — register → consent → Neon (NEW DATABASE_URL only).
 * Run: npx tsx scripts/_page002_register_runtime_proof.ts
 */
import "dotenv/config";
import pg from "pg";

const base = process.env.PROOF_API_BASE?.trim() || "http://127.0.0.1:8080";
const unique = `p2${Date.now().toString(36)}`;
const email = `${unique}@example.com`;
const username = unique.slice(0, 20);

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

const registered = await json("/api/auth/register", {
  method: "POST",
  body: JSON.stringify({
    email,
    username,
    password: "password12",
    displayName: username,
    ageConfirmed13Plus: true,
    consentVersion: "2026-07-21",
  }),
});
if (registered.status !== 201) {
  throw new Error(`register expected 201, got ${registered.status}: ${JSON.stringify(registered.body)}`);
}
const reg = asRecord(registered.body);
const session = asRecord(reg.session);
const user = asRecord(reg.user);
const token = String(session.access_token ?? "");
const userId = String(user.id ?? "");
if (!token || !userId) throw new Error("register missing session/user");
if (session.access_token !== session.accessToken) throw new Error("register dual-token mismatch");
if (reg.needsEmailConfirmation !== false) throw new Error("expected immediate session (no SMTP confirm)");
if (!String(reg.welcome_message ?? "").includes("50,000")) throw new Error("missing starter welcome");

const dupEmail = await json("/api/auth/register", {
  method: "POST",
  body: JSON.stringify({
    email,
    username: `${username}x`,
    password: "password12",
    ageConfirmed13Plus: true,
    consentVersion: "2026-07-21",
  }),
});
if (dupEmail.status !== 409) throw new Error(`dup email expected 409, got ${dupEmail.status}`);

const dupUser = await json("/api/auth/register", {
  method: "POST",
  body: JSON.stringify({
    email: `${unique}2@example.com`,
    username,
    password: "password12",
    ageConfirmed13Plus: true,
    consentVersion: "2026-07-21",
  }),
});
if (dupUser.status !== 409) throw new Error(`dup username expected 409, got ${dupUser.status}`);

const shortPw = await json("/api/auth/register", {
  method: "POST",
  body: JSON.stringify({
    email: `${unique}3@example.com`,
    password: "short",
    ageConfirmed13Plus: true,
    consentVersion: "2026-07-21",
  }),
});
if (shortPw.status !== 400) throw new Error(`short password expected 400, got ${shortPw.status}`);

const consent = await json("/api/auth/consent", {
  method: "POST",
  headers: { Authorization: `Bearer ${token}` },
  body: JSON.stringify({
    consent_type: "terms_privacy_and_age_13_plus",
    version: "2026-07-21",
    age_confirmed_13_plus: true,
    meta: { email },
  }),
});
if (consent.status !== 200) {
  throw new Error(`consent expected 200, got ${consent.status}: ${JSON.stringify(consent.body)}`);
}

const me = await json("/api/auth/me", {
  headers: { Authorization: `Bearer ${token}` },
});
if (me.status !== 200) throw new Error(`me expected 200, got ${me.status}`);

const wallet = await json("/api/wallet", {
  headers: { Authorization: `Bearer ${token}` },
});
const walletBody = asRecord(wallet.body);
if (wallet.status !== 200) throw new Error(`wallet expected 200, got ${wallet.status}`);
if (walletBody.starter_balance !== 50000) throw new Error(`starter_balance expected 50000, got ${walletBody.starter_balance}`);
if (walletBody.coin_balance !== 0) throw new Error(`coin_balance expected 0, got ${walletBody.coin_balance}`);

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error("DATABASE_URL required for Neon proof");
const pool = new pg.Pool({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
try {
  const stored = await pool.query<{
    email: string;
    username: string;
    password_hash: string | null;
    email_confirmed_at: Date | null;
  }>(`SELECT email, username, password_hash, email_confirmed_at FROM users WHERE id = $1`, [userId]);
  if (!stored.rows[0]?.password_hash) throw new Error("user row missing password_hash");
  if (stored.rows[0].password_hash === "password12") throw new Error("password stored in plaintext");
  if (!stored.rows[0].email_confirmed_at) throw new Error("email_confirmed_at missing");

  const consentRow = await pool.query<{
    consent_type: string;
    version: string;
    age_confirmed_13_plus: boolean;
    meta: { email?: string };
  }>(
    `SELECT consent_type, version, age_confirmed_13_plus, meta
     FROM user_consents WHERE user_id = $1`,
    [userId],
  );
  const c = consentRow.rows[0];
  if (!c) throw new Error("consent row missing");
  if (c.consent_type !== "terms_privacy_and_age_13_plus") throw new Error("bad consent_type");
  if (c.version !== "2026-07-21") throw new Error("bad consent version");
  if (c.age_confirmed_13_plus !== true) throw new Error("age_confirmed_13_plus not true");
  if (c.meta?.email !== email) throw new Error("consent meta.email not persisted");

  const kindCol = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'user_consents' AND column_name = 'kind'
     ) AS exists`,
  );
  if (kindCol.rows[0]?.exists) throw new Error("obsolete user_consents.kind still present");

  const paid = await pool.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM paid_coin_lots WHERE user_id = $1`,
    [userId],
  );
  if (paid.rows[0]?.n !== 0) throw new Error("starter coins leaked into paid_coin_lots");
} finally {
  await pool.end();
}

console.log(
  JSON.stringify(
    {
      ok: true,
      page: "PAGE-002",
      email,
      userId,
      registerStatus: registered.status,
      consentStatus: consent.status,
      starterBalance: walletBody.starter_balance,
      verificationHandoff: "needsEmailConfirmation=false → session + consent (SMTP off)",
    },
    null,
    2,
  ),
);
