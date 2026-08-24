import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import type { AddressInfo } from "node:net";
import type http from "node:http";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { applyPendingMigrations, closePool, getPool, withTransaction } from "./infra/postgres.js";
import { resetEnvCache } from "./infra/env.js";
import { closeValkey } from "./infra/valkey.js";
import { emailVerifyCallbackUrl, issueEmailVerifyToken } from "./modules/auth/emailVerify.js";
import { issuePasswordResetToken, passwordResetCallbackUrl } from "./modules/auth/passwordReset.js";
import { bumpAchievement } from "./modules/engagement/achievements.js";
import {
  grantStickerForUser,
  recordCreatorGiftProgress,
  recordCreatorWatchProgress,
  spawnTreasureChest,
} from "./modules/engagement/collections.js";

const TEST_JWT = "integration-test-jwt-secret-key-32chars";
let httpIntegrationSkipReason = "";

async function issueVerifyJwtForUser(userId: string): Promise<string> {
  const { rows } = await getPool().query<{
    email: string;
    email_confirmed_at: Date | null;
    password_hash: string;
  }>(`SELECT email, email_confirmed_at, password_hash FROM users WHERE id = $1`, [userId]);
  const row = rows[0];
  if (!row?.password_hash) throw new Error(`missing user ${userId}`);
  if (row.email_confirmed_at) {
    await getPool().query(`UPDATE users SET email_confirmed_at = NULL WHERE id = $1`, [userId]);
  }
  return issueEmailVerifyToken({
    id: userId,
    email: row.email,
    email_confirmed_at: null,
    password_hash: row.password_hash,
  });
}

async function issueResetJwtForUser(userId: string): Promise<string> {
  const { rows } = await getPool().query<{ email: string; password_hash: string }>(
    `SELECT email, password_hash FROM users WHERE id = $1`,
    [userId],
  );
  const row = rows[0];
  if (!row?.password_hash) throw new Error(`missing user ${userId}`);
  return issuePasswordResetToken({
    id: userId,
    email: row.email,
    password_hash: row.password_hash,
  });
}

async function resetIntegrationDatabase(url: string): Promise<void> {
  const pool = new Pool({ connectionString: url });
  try {
    const dbName = new URL(url).pathname.replace(/^\//, "");
    if (!/^[a-zA-Z0-9_]+$/.test(dbName)) {
      throw new Error("Invalid TEST_DATABASE_URL database name");
    }

    await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
    await pool.query("CREATE SCHEMA public");
    await pool.query("GRANT ALL ON SCHEMA public TO CURRENT_USER");
    await pool.query("GRANT ALL ON SCHEMA public TO public");
    await pool.query(`ALTER DATABASE ${dbName} SET search_path TO public`);
  } finally {
    await pool.end();
  }
}

async function startEmbeddedDatabase(): Promise<{ url: string; stop: () => Promise<void> } | null> {
  if (process.env.TEST_DATABASE_URL) {
    return { url: process.env.TEST_DATABASE_URL, stop: async () => undefined };
  }
  try {
    const EmbeddedPostgres = (await import("embedded-postgres")).default;
    const dir = await mkdtemp(path.join(os.tmpdir(), "elix-pg-"));
    const pg = new EmbeddedPostgres({
      databaseDir: dir,
      user: "postgres",
      password: "postgres",
      port: 55432,
      persistent: false,
    });
    await pg.initialise();
    await pg.start();
    await pg.createDatabase("elix_test");
    return {
      url: "postgresql://postgres:postgres@127.0.0.1:55432/elix_test",
      stop: async () => {
        await pg.stop();
      },
    };
  } catch (error) {
    httpIntegrationSkipReason =
      error instanceof Error ? error.message : typeof error === "string" ? error : "embedded postgres bootstrap failed";
    return null;
  }
}

describe("http integration", () => {
  let db: { url: string; stop: () => Promise<void> } | null = null;
  let base = "";
  let server: http.Server | undefined;
  let token = "";

  beforeAll(async () => {
    db = await startEmbeddedDatabase();
    if (!db) {
      if (!process.env.TEST_DATABASE_URL) {
        // One explicit reason for all conditional skips in this suite.
        // This avoids hidden environment-based skips.
        console.warn(`http integration skipped: ${httpIntegrationSkipReason || "embedded postgres unavailable"}`);
      }
      return;
    }
    process.env.NODE_ENV = "test";
    process.env.DATABASE_URL = db.url;
    process.env.JWT_SECRET = TEST_JWT;
    process.env.TEST_COINS_ISSUE_PASSWORD = "qa-test-coins";
    delete process.env.VALKEY_URL;
    delete process.env.REDIS_URL;
    delete process.env.SMTP_URL;
    delete process.env.LIVEKIT_URL;
    delete process.env.LIVEKIT_API_KEY;
    delete process.env.LIVEKIT_API_SECRET;
    resetEnvCache();
    await resetIntegrationDatabase(db.url);
    await applyPendingMigrations(db.url);
    const { createApp } = await import("./index.js");
    delete process.env.LIVEKIT_URL;
    delete process.env.LIVEKIT_API_KEY;
    delete process.env.LIVEKIT_API_SECRET;
    resetEnvCache();
    const app = await createApp();
    server = await new Promise<http.Server>((resolve) => {
      const started = app.listen(0, "127.0.0.1");
      started.on("listening", () => resolve(started));
    });
    const addr = server.address() as AddressInfo;
    base = `http://127.0.0.1:${addr.port}`;
  }, 180_000);

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      if (!server) {
        resolve();
        return;
      }
      server.close((err) => (err ? reject(err) : resolve()));
    });
    await closePool();
    await closeValkey().catch(() => undefined);
    await db?.stop();
    resetEnvCache();
  });

  function accessTokenFromLogin(body: unknown): string {
    if (!body || typeof body !== "object") return "";
    const session = (body as { session?: { access_token?: unknown } }).session;
    if (!session || typeof session !== "object") return "";
    const value = session.access_token;
    return typeof value === "string" ? value : "";
  }

  async function json(pathName: string, init: RequestInit = {}) {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(init.headers as Record<string, string> | undefined),
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${base}${pathName}`, { ...init, headers });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { status: res.status, body, setCookie: res.headers.get("set-cookie") ?? "" };
  }

  it("migrates, registers, logs in, and serves wallet", async ({ skip }) => {
    if (!db || !base) {
      skip();
      return;
    }
    const health = await json("/health");
    expect(health.status).toBe(200);
    expect(health.body.db).toBe(true);

    const unique = `u${Date.now()}`;
    const username = unique.slice(0, 12);
    const registered = await json("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({
        email: `${unique}@example.com`,
        username,
        password: "password12",
        ageConfirmed13Plus: true,
        consentVersion: "2026-07-21",
      }),
    });
    expect(registered.status).toBe(201);
    expect(registered.body).not.toHaveProperty("token");
    expect(registered.body).not.toHaveProperty("welcomeMessage");
    token = accessTokenFromLogin(registered.body);
    expect(token).toBeTruthy();
    expect(registered.body.needsEmailConfirmation).toBe(false);
    expect(String(registered.body.welcome_message ?? "")).toContain("50,000");
    const userId = String((registered.body.user as { id?: string } | undefined)?.id ?? "");
    expect(userId).toBeTruthy();

    const stored = await getPool().query<{ password_hash: string | null; is_admin: boolean; email_confirmed_at: Date | null }>(
      `SELECT password_hash, is_admin, email_confirmed_at FROM users WHERE id = $1`,
      [userId],
    );
    expect(stored.rows[0]?.password_hash).toBeTruthy();
    expect(stored.rows[0]?.password_hash).not.toBe("password12");
    expect(stored.rows[0]?.is_admin).toBe(false);
    expect(stored.rows[0]?.email_confirmed_at).toBeTruthy();

    const paidLots = await getPool().query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM paid_coin_lots WHERE user_id = $1`,
      [userId],
    );
    expect(paidLots.rows[0]?.n).toBe(0);
    const starter = await getPool().query<{ starter_coins: string }>(
      `SELECT starter_coins::text FROM wallet_balances WHERE user_id = $1`,
      [userId],
    );
    expect(Number(starter.rows[0]?.starter_coins ?? 0)).toBe(50000);
    const consent = await json("/api/auth/consent", {
      method: "POST",
      body: JSON.stringify({
        consent_type: "terms_privacy_and_age_13_plus",
        version: "2026-07-21",
        age_confirmed_13_plus: true,
      }),
    });
    expect(consent.status).toBe(200);
    const consentRow = await getPool().query<{ kind: string }>(
      `SELECT kind FROM user_consents WHERE user_id = $1`,
      [userId],
    );
    expect(consentRow.rows[0]?.kind).toBe("terms_privacy_and_age_13_plus");

    const dupEmail = await json("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({
        email: `${unique}@example.com`,
        username: `${username}x`,
        password: "password12",
        ageConfirmed13Plus: true,
        consentVersion: "2026-07-21",
      }),
    });
    expect(dupEmail.status).toBe(409);
    expect(dupEmail.body.message).toBe("An account with this email already exists.");

    const dupUsername = await json("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({
        email: `${unique}2@example.com`,
        username,
        password: "password12",
        ageConfirmed13Plus: true,
        consentVersion: "2026-07-21",
      }),
    });
    expect(dupUsername.status).toBe(409);
    expect(dupUsername.body.message).toBe("This username is already taken.");

    const missingTerms = await json("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({
        email: `${unique}3@example.com`,
        password: "password12",
      }),
    });
    expect(missingTerms.status).toBe(201);
    expect(accessTokenFromLogin(missingTerms.body)).toBeTruthy();

    const shortPassword = await json("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({
        email: `${unique}4@example.com`,
        password: "short",
        ageConfirmed13Plus: true,
        consentVersion: "2026-07-21",
      }),
    });
    expect(shortPassword.status).toBe(400);

    const login = await json("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: username, password: "password12" }),
    });
    expect(login.status).toBe(200);
    expect(login.body).not.toHaveProperty("token");
    expect(login.body.user).toEqual(
      expect.objectContaining({
        email: `${unique}@example.com`,
        user_metadata: expect.objectContaining({ username }),
      }),
    );
    expect(login.body.session).toEqual(
      expect.objectContaining({ access_token: expect.any(String), accessToken: expect.any(String) }),
    );
    expect(login.body.profile_meta).toEqual(
      expect.objectContaining({
        is_admin: false,
        banned_until: null,
      }),
    );
    expect(login.setCookie).toMatch(/auth_token=/);
    expect(login.setCookie).toMatch(/HttpOnly/i);
    token = accessTokenFromLogin(login.body);
    expect(token).toBeTruthy();

    const loginByEmail = await json("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: `${unique}@example.com`, password: "password12" }),
    });
    expect(loginByEmail.status).toBe(200);
    expect(loginByEmail.body).not.toHaveProperty("token");
    expect(accessTokenFromLogin(loginByEmail.body)).toBeTruthy();

    const runtimeEnv = await fetch(`${base}/env.js`);
    expect(runtimeEnv.status).toBe(200);
    const runtimeEnvText = await runtimeEnv.text();
    expect(runtimeEnvText).toContain("VITE_EMAIL_CONFIGURED");
    expect(runtimeEnvText).toContain("VITE_APPLE_SIGN_IN_ENABLED");
    expect(runtimeEnvText).toContain("__ELIX_ENV");
    
    const wrong = await json("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: `${unique}@example.com`, password: "nope-nope-12" }),
    });
    expect(wrong.status).toBe(401);
    expect(wrong.body.error).toBe("Invalid login credentials.");

    const unknownUser = await json("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "missing-user-xyz@example.com", password: "nope-nope-12" }),
    });
    expect(unknownUser.status).toBe(401);
    expect(unknownUser.body.error).toBe(wrong.body.error);

    const me = await json("/api/auth/me");
    expect(me.status).toBe(200);

    const wallet = await json("/api/wallet");
    expect(wallet.status).toBe(200);
    expect(wallet.body.coin_balance).toBe(0);
    expect(wallet.body.starter_balance).toBe(50000);
    expect(wallet.body.starter_coins).toBe(50000);
    expect(wallet.body.promotional_balance).toBe(0);
    expect(wallet.body.promotional_coins).toBe(0);
    expect(wallet.body.testCoins).toBeUndefined();
    expect(wallet.body.test_coins).toBeUndefined();

    const mint = await json("/api/wallet/test-coins", {
      method: "POST",
      body: JSON.stringify({ password: "qa-test-coins", amount: 25 }),
    });
    expect(mint.status).toBe(404);

    const testBalance = await json("/api/test-coins/balance");
    expect(testBalance.status).toBe(503);

    const iap = await json("/api/verify-purchase", {
      method: "POST",
      body: JSON.stringify({ provider: "apple", productId: "coins100", receipt: "not-a-jws" }),
    });
    expect(iap.status).toBe(400);

    const gifts = await json("/api/gifts");
    expect(gifts.status).toBe(200);

    const verifyMissing = await json("/api/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ token: "" }),
    });
    expect(verifyMissing.status).toBe(400);

    const verifyShort = await json("/api/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ token: "shorttok" }),
    });
    expect(verifyShort.status).toBe(400);

    const verifyGarbage = await json("/api/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ token: "a".repeat(64) }),
    });
    expect(verifyGarbage.status).toBe(401);
    expect(verifyGarbage.body.error).toBe("Invalid or expired confirmation link.");

    await getPool().query(`UPDATE users SET email_confirmed_at = NULL WHERE id = $1`, [userId]);
    process.env.SMTP_URL = "smtp://127.0.0.1:9";
    const unconfirmedLogin = await json("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: `${unique}@example.com`, password: "password12" }),
    });
    expect(unconfirmedLogin.status).toBe(403);
    const unconfirmedForgot = await json("/api/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email: `${unique}@example.com` }),
    });
    expect(unconfirmedForgot.status).toBe(200);
    expect(unconfirmedForgot.body).toEqual({ success: true });
    delete process.env.SMTP_URL;

    const raw = await issueVerifyJwtForUser(userId);
    expect(emailVerifyCallbackUrl("https://app.example", raw)).toContain("/auth/callback?token=");
    expect(raw.split(".").length).toBe(3);

    const verified = await json("/api/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ token: raw }),
    });
    expect(verified.status).toBe(200);
    expect(verified.body.already_confirmed).toBe(false);
    expect((verified.body as { session?: { access_token?: string } }).session?.access_token).toBeTruthy();
    expect((verified.body as { user?: { email_confirmed_at?: string } }).user?.email_confirmed_at).toBeTruthy();

    const confirmed = await getPool().query<{ email_confirmed_at: Date | null }>(
      `SELECT email_confirmed_at FROM users WHERE id = $1`,
      [userId],
    );
    expect(confirmed.rows[0]?.email_confirmed_at).toBeTruthy();

    const reused = await json("/api/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ token: raw }),
    });
    expect(reused.status).toBe(200);
    expect(reused.body.already_confirmed).toBe(true);
    expect((reused.body as { session?: { access_token?: string } }).session?.access_token).toBeTruthy();

    const raceRaw = await issueVerifyJwtForUser(userId);
    const [firstRace, secondRace] = await Promise.all([
      json("/api/auth/verify-email", { method: "POST", body: JSON.stringify({ token: raceRaw }) }),
      json("/api/auth/verify-email", { method: "POST", body: JSON.stringify({ token: raceRaw }) }),
    ]);
    expect(firstRace.status).toBe(200);
    expect(secondRace.status).toBe(200);

    const afterVerifyLogin = await json("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: `${unique}@example.com`, password: "password12" }),
    });
    expect(afterVerifyLogin.status).toBe(200);
    token = accessTokenFromLogin(afterVerifyLogin.body);


    const forgotMissing = await json("/api/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email: "   " }),
    });
    expect(forgotMissing.status).toBe(400);

    const forgotInvalid = await json("/api/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email: "not-an-email" }),
    });
    expect(forgotInvalid.status).toBe(400);

    const forgotWithoutMail = await json("/api/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email: `${unique}@example.com` }),
    });
    expect(forgotWithoutMail.status).toBe(501);
    expect(forgotWithoutMail.body.error).toBe("Email service is not configured. Please contact support.");

    process.env.SMTP_URL = "smtp://127.0.0.1:9";
    process.env.CLIENT_URL = "https://app.example";
    const sessionsBeforeForgot = await getPool().query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM auth_sessions WHERE user_id = $1`,
      [userId],
    );
    const unknownForgot = await json("/api/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email: "nobody-unknown@example.com" }),
    });
    const knownForgot = await json("/api/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email: `  ${unique.toUpperCase()}@EXAMPLE.COM  ` }),
    });
    expect(unknownForgot.status).toBe(200);
    expect(knownForgot.status).toBe(200);
    expect(unknownForgot.body).toEqual({ success: true });
    expect(knownForgot.body).toEqual({ success: true });
    expect(knownForgot.body).not.toHaveProperty("token");

    const knownForgotAgain = await json("/api/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email: `${unique}@example.com` }),
    });
    expect(knownForgotAgain.status).toBe(200);
    expect(knownForgotAgain.body).toEqual({ success: true });

    const sessionsAfterForgot = await getPool().query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM auth_sessions WHERE user_id = $1`,
      [userId],
    );
    expect(sessionsAfterForgot.rows[0]?.n).toBe(sessionsBeforeForgot.rows[0]?.n);

    const meAfterForgot = await json("/api/auth/me");
    expect(meAfterForgot.status).toBe(200);

    const resetRaw = await issueResetJwtForUser(userId);
    expect(passwordResetCallbackUrl("https://app.example", resetRaw)).toBe(
      `https://app.example/reset-password?token=${encodeURIComponent(resetRaw)}`,
    );
    expect(resetRaw.split(".")).toHaveLength(3);
    const resetPayload = JSON.parse(Buffer.from(resetRaw.split(".")[1] ?? "", "base64url").toString("utf8")) as {
      purpose?: string;
      sub?: string;
    };
    expect(resetPayload.purpose).toBe("password_reset");
    expect(resetPayload.sub).toBe(userId);
    expect(resetRaw.length).toBeGreaterThanOrEqual(64);

    const resetAsVerify = await json("/api/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ token: resetRaw }),
    });
    expect(resetAsVerify.status).toBe(401);
    expect(resetAsVerify.body.error).toBe("Invalid or expired confirmation link.");

    // Purpose JWT remains valid until password changes (cannot expire via DB row).
    const hashBeforeExpiredReset = await getPool().query<{ password_hash: string }>(
      `SELECT password_hash FROM users WHERE id = $1`,
      [userId],
    );
    expect(hashBeforeExpiredReset.rows[0]?.password_hash).toBeTruthy();

    const verifyAsReset = await issueVerifyJwtForUser(userId);
    const verifyCannotReset = await json("/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token: verifyAsReset, password: "password99xx" }),
    });
    expect(verifyCannotReset.status).toBe(401);
    expect(verifyCannotReset.body.error).toBe("Invalid or expired reset link.");

    const sessionCannotReset = await json("/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, password: "password99xx" }),
    });
    expect(sessionCannotReset.status).toBe(401);

    const previousSession = token;
    token = resetRaw;
    const resetAsSession = await json("/api/auth/me");
    expect(resetAsSession.status).toBe(401);
    token = previousSession;

    await getPool().query(`UPDATE users SET banned_until = $2 WHERE id = $1`, [userId, new Date("9999-12-31T00:00:00.000Z")]);
    const bannedMe = await json("/api/auth/me");
    expect(bannedMe.status).toBe(403);
    const suspendedForgot = await json("/api/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email: `${unique}@example.com` }),
    });
    expect(suspendedForgot.status).toBe(200);
    expect(suspendedForgot.body).toEqual({ success: true });
    await getPool().query(`UPDATE users SET banned_until = NULL WHERE id = $1`, [userId]);
    delete process.env.SMTP_URL;
    delete process.env.CLIENT_URL;

    const resetUsername = `${username}s`.slice(0, 24);
    const resetEmail = `${unique}s@example.com`;
    const registeredReset = await json("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({
        email: resetEmail,
        username: resetUsername,
        password: "password12",
        ageConfirmed13Plus: true,
        consentVersion: "2026-07-21",
      }),
    });
    expect(registeredReset.status).toBe(201);
    const resetUserId = String((registeredReset.body.user as { id?: string } | undefined)?.id ?? "");
    expect(resetUserId).toBeTruthy();
    const resetLogin = await json("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: resetEmail, password: "password12" }),
    });
    expect(resetLogin.status).toBe(200);
    const resetSession = accessTokenFromLogin(resetLogin.body);
    expect(resetSession).toBeTruthy();

    const resetMissing = await json("/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ password: "password99xx" }),
    });
    expect(resetMissing.status).toBe(400);
    const resetEmpty = await json("/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token: "   ", password: "password99xx" }),
    });
    expect(resetEmpty.status).toBe(400);
    const resetShort = await json("/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token: "shorttok", password: "password99xx" }),
    });
    expect(resetShort.status).toBe(400);
    const resetUnknown = await json("/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token: "a".repeat(64), password: "password99xx" }),
    });
    expect(resetUnknown.status).toBe(401);
    expect(resetUnknown.body.error).toBe("Invalid or expired reset link.");

    const weakTok = await issueResetJwtForUser(resetUserId);
    const weakReset = await json("/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token: weakTok, password: "short" }),
    });
    expect(weakReset.status).toBe(400);
    expect(weakReset.body.error).toBe("validation_error");
    expect(weakReset.body.message).toBe("Password must be at least 8 characters.");
    const stillOld = await json("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: resetEmail, password: "password12" }),
    });
    expect(stillOld.status).toBe(200);

    const firstResetTok = await issueResetJwtForUser(resetUserId);
    const liveReset = await issueResetJwtForUser(resetUserId);

    const appleCannotReset = await json("/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({
        token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.signaturepaddingxx",
        password: "ResetPass12",
      }),
    });
    expect(appleCannotReset.status).toBe(401);

    const applied = await json("/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token: liveReset, password: "ResetPass12" }),
    });
    expect(applied.status).toBe(200);
    expect(applied.body).toEqual({ success: true });
    expect(applied.body).not.toHaveProperty("token");
    expect(applied.body).not.toHaveProperty("password_hash");

    const storedResetHash = await getPool().query<{ password_hash: string }>(
      `SELECT password_hash FROM users WHERE id = $1`,
      [resetUserId],
    );
    expect(storedResetHash.rows[0]?.password_hash).toBeTruthy();
    expect(storedResetHash.rows[0]?.password_hash).not.toBe("ResetPass12");
    expect(storedResetHash.rows[0]?.password_hash).not.toBe("password12");

    const supersededReset = await json("/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token: firstResetTok, password: "ResetPass12" }),
    });
    expect(supersededReset.status).toBe(401);
    expect(supersededReset.body.error).toBe("This reset link has already been used or is no longer valid.");

    const reusedReset = await json("/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token: liveReset, password: "ResetPass99" }),
    });
    expect(reusedReset.status).toBe(401);
    expect(reusedReset.body.error).toBe("This reset link has already been used or is no longer valid.");

    const oldPasswordLogin = await json("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: resetEmail, password: "password12" }),
    });
    expect(oldPasswordLogin.status).toBe(401);
    const newPasswordLogin = await json("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: resetEmail, password: "ResetPass12" }),
    });
    expect(newPasswordLogin.status).toBe(200);
    
    const keptFirstSession = token;
    token = resetSession;
    const revokedSession = await json("/api/auth/me");
    expect(revokedSession.status).toBe(401);
    token = keptFirstSession;
    const firstUserStill = await json("/api/auth/me");
    expect(firstUserStill.status).toBe(200);

    const raceTok = await issueResetJwtForUser(resetUserId);
    const [raceA, raceB] = await Promise.all([
      json("/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token: raceTok, password: "RacePassA1" }),
      }),
      json("/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token: raceTok, password: "RacePassB1" }),
      }),
    ]);
    const raceStatuses = [raceA.status, raceB.status].sort();
    expect(raceStatuses).toEqual([200, 401]);
    const raceALogin = await json("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: resetEmail, password: "RacePassA1" }),
    });
    const raceBLogin = await json("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: resetEmail, password: "RacePassB1" }),
    });
    expect([raceALogin.status, raceBLogin.status].sort()).toEqual([200, 401]);
    const winningPassword = raceALogin.status === 200 ? "RacePassA1" : "RacePassB1";

    await getPool().query(`UPDATE users SET banned_until = $2 WHERE id = $1`, [
      resetUserId,
      new Date("9999-12-31T00:00:00.000Z"),
    ]);
    const suspendedTok = await issueResetJwtForUser(resetUserId);
    const suspendedReset = await json("/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token: suspendedTok, password: "ResetBan12" }),
    });
    expect(suspendedReset.status).toBe(200);
    const suspendedLogin = await json("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: resetEmail, password: "ResetBan12" }),
    });
    expect(suspendedLogin.status).toBe(403);
    await getPool().query(`UPDATE users SET banned_until = NULL WHERE id = $1`, [resetUserId]);
    const afterUnban = await json("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: resetEmail, password: "ResetBan12" }),
    });
    expect(afterUnban.status).toBe(200);
    const winningStillFails = await json("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: resetEmail, password: winningPassword }),
    });
    expect(winningStillFails.status).toBe(401);

    const deletedTok = await issueResetJwtForUser(resetUserId);
    await getPool().query(`UPDATE users SET deleted_at = NOW() WHERE id = $1`, [resetUserId]);
    const deletedReset = await json("/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token: deletedTok, password: "Deleted12x" }),
    });
    expect(deletedReset.status).toBe(400);
    expect(deletedReset.body.error).toBe("Invalid or expired reset link.");

    const bannedRaw = await issueVerifyJwtForUser(userId);
    await getPool().query(`UPDATE users SET banned_until = $2 WHERE id = $1`, [userId, new Date("9999-12-31T00:00:00.000Z")]);
    const banned = await json("/api/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ token: bannedRaw }),
    });
    expect(banned.status).toBe(403);
    await getPool().query(`UPDATE users SET banned_until = NULL WHERE id = $1`, [userId]);

    const deletedRaw = await issueVerifyJwtForUser(userId);
    await getPool().query(`UPDATE users SET deleted_at = NOW() WHERE id = $1`, [userId]);
    process.env.SMTP_URL = "smtp://127.0.0.1:9";
    const deletedForgot = await json("/api/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email: `${unique}@example.com` }),
    });
    expect(deletedForgot.status).toBe(200);
    expect(deletedForgot.body).toEqual({ success: true });
    delete process.env.SMTP_URL;
    const deleted = await json("/api/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ token: deletedRaw }),
    });
    expect(deleted.status).toBe(404);
  }, 60_000);

  it("PAGE-007 foryou ranking, unique views, blocks, and live cards", async ({ skip }) => {
    if (!db || !base) {
      skip();
      return;
    }

    async function registerUser(stamp: string) {
      const username = `p7${stamp}${Math.random().toString(36).slice(2, 8)}`.slice(0, 12);
      const registered = await json("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          email: `${username}@example.com`,
          username,
          password: "password12",
          ageConfirmed13Plus: true,
          consentVersion: "2026-07-21",
        }),
      });
      expect(registered.status).toBe(201);
      const id = String((registered.body.user as { id?: string } | undefined)?.id ?? "");
      const userToken = accessTokenFromLogin(registered.body);
      return { id, token: userToken };
    }

    const viewer = await registerUser("v");
    const creator = await registerUser("c");
    const blocked = await registerUser("b");
    token = "";
    const unauth = await json("/api/feed/foryou");
    expect(unauth.status).toBe(200);
    expect(Array.isArray(unauth.body.videos)).toBe(true);
    expect(unauth.body).toEqual(
      expect.objectContaining({
        mutualUserIds: [],
        page: 1,
        hasMore: expect.any(Boolean),
        source: expect.any(String),
      }),
    );
    expect(unauth.body).not.toHaveProperty("items");
    expect(unauth.body).not.toHaveProperty("nextCursor");
    token = viewer.token;

    const publicVideo = await getPool().query<{ id: string }>(
      `INSERT INTO videos (user_id, bunny_path, caption, privacy) VALUES ($1, 'https://cdn.example/p7.mp4', 'hello', 'public') RETURNING id`,
      [creator.id],
    );
    const videoId = publicVideo.rows[0].id;
    await getPool().query(
      `INSERT INTO videos (user_id, bunny_path, caption, privacy) VALUES ($1, 'https://cdn.example/priv.mp4', 'nope', 'private')`,
      [creator.id],
    );
    const blockedVideo = await getPool().query<{ id: string }>(
      `INSERT INTO videos (user_id, bunny_path, caption, privacy) VALUES ($1, 'https://cdn.example/blk.mp4', 'blocked', 'public') RETURNING id`,
      [blocked.id],
    );
    await getPool().query(`INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2)`, [viewer.id, blocked.id]);

    const foryou = await json("/api/feed/foryou");
    expect(foryou.status).toBe(200);
    const items = (foryou.body.videos as Array<{ id: string; user: { id: string } }>) || [];
    expect(items.some((row) => row.id === videoId)).toBe(true);
    expect(items.some((row) => row.id === blockedVideo.rows[0].id)).toBe(false);
    expect(items.every((row) => row.user.id !== blocked.id)).toBe(true);

    const tooShort = await json("/api/feed/track-view", {
      method: "POST",
      body: JSON.stringify({ videoId, watchTime: 1 }),
    });
    expect(tooShort.status).toBe(200);
    expect(tooShort.body.counted).toBe(false);

    const counted = await json("/api/feed/track-view", {
      method: "POST",
      body: JSON.stringify({ videoId, watchTime: 3 }),
    });
    expect(counted.status).toBe(200);
    expect(counted.body.counted).toBe(true);

    const duplicate = await json("/api/feed/track-view", {
      method: "POST",
      body: JSON.stringify({ videoId, watchTime: 3 }),
    });
    expect(duplicate.status).toBe(200);
    expect(duplicate.body.counted).toBe(false);

    token = creator.token;
    const selfView = await json("/api/feed/track-view", {
      method: "POST",
      body: JSON.stringify({ videoId, watchTime: 3 }),
    });
    expect(selfView.status).toBe(200);
    expect(selfView.body.counted).toBe(false);

    token = viewer.token;
    type FeedFlags = { id: string; isLiked?: boolean; isSaved?: boolean; isFollowing?: boolean };
    function flagsFor(body: Record<string, unknown>): FeedFlags | undefined {
      return ((body.videos as FeedFlags[]) || []).find((row) => row.id === videoId);
    }

    expect(flagsFor(foryou.body)?.isLiked).toBe(false);
    expect(flagsFor(foryou.body)?.isSaved).toBe(false);
    expect(flagsFor(foryou.body)?.isFollowing).toBe(false);

    const like = await json(`/api/videos/${videoId}/like`, { method: "POST" });
    expect(like.status).toBe(200);
    const likedReload = await json("/api/feed/foryou");
    expect(flagsFor(likedReload.body)?.isLiked).toBe(true);

    const unlike = await json(`/api/videos/${videoId}/unlike`, { method: "POST" });
    expect(unlike.status).toBe(200);
    const unlikedReload = await json("/api/feed/foryou");
    expect(flagsFor(unlikedReload.body)?.isLiked).toBe(false);

    const save = await json(`/api/videos/${videoId}/save`, { method: "POST" });
    expect(save.status).toBe(200);
    const savedReload = await json("/api/feed/foryou");
    expect(flagsFor(savedReload.body)?.isSaved).toBe(true);

    const unsave = await json(`/api/videos/${videoId}/unsave`, { method: "POST" });
    expect(unsave.status).toBe(200);
    const unsavedReload = await json("/api/feed/foryou");
    expect(flagsFor(unsavedReload.body)?.isSaved).toBe(false);

    const follow = await json(`/api/profiles/${creator.id}/follow`, { method: "POST" });
    expect(follow.status).toBe(200);
    const followedReload = await json("/api/feed/foryou");
    expect(flagsFor(followedReload.body)?.isFollowing).toBe(true);

    const unfollow = await json(`/api/profiles/${creator.id}/follow`, { method: "DELETE" });
    expect(unfollow.status).toBe(200);
    const unfollowedReload = await json("/api/feed/foryou");
    expect(flagsFor(unfollowedReload.body)?.isFollowing).toBe(false);

    const downloadHeaders: Record<string, string> = { Authorization: `Bearer ${viewer.token}` };
    const downloadRes = await fetch(`${base}/api/videos/${videoId}/download`, { headers: downloadHeaders });
    expect(downloadRes.status).toBe(400);
    const downloadBody = (await downloadRes.json()) as { error?: string; message?: string };
    expect(downloadBody.message).toMatch(/not downloadable/i);

    const live = await getPool().query<{ id: string }>(
      `INSERT INTO live_streams (host_id, room_id, title, status) VALUES ($1, $2, 'now', 'live') RETURNING id`,
      [creator.id, creator.id],
    );
    const streams = await json("/api/live/streams");
    expect(streams.status).toBe(200);
    const liveRows = (streams.body.streams as Array<{ streamId: string; hostId: string }>) || [];
    expect(liveRows.some((row) => row.streamId === live.rows[0].id && row.hostId === creator.id)).toBe(true);

    await getPool().query(`UPDATE live_streams SET status = 'ended', ended_at = NOW() WHERE id = $1`, [live.rows[0].id]);
    const afterEnd = await json("/api/live/streams");
    const afterRows = (afterEnd.body.streams as Array<{ streamId: string }>) || [];
    expect(afterRows.some((row) => row.streamId === live.rows[0].id)).toBe(false);

    for (let i = 0; i < 21; i += 1) {
      await getPool().query(
        `INSERT INTO videos (user_id, bunny_path, caption, privacy, created_at)
         VALUES ($1, $2, $3, 'public', NOW() - ($4 || ' minutes')::interval)`,
        [creator.id, `https://cdn.example/p7-${i}.mp4`, `page ${i}`, String(i)],
      );
    }
    const page1 = await json("/api/feed/foryou?page=1&limit=20");
    const page1Items = (page1.body.videos as Array<{ id: string }>) || [];
    expect(page1Items.length).toBe(20);
    expect(page1.body.hasMore).toBe(true);
    const page2 = await json("/api/feed/foryou?page=2&limit=20");
    const page2Items = (page2.body.videos as Array<{ id: string }>) || [];
    const seen = new Set(page1Items.map((row) => row.id));
    for (const row of page2Items) {
      expect(seen.has(row.id)).toBe(false);
      seen.add(row.id);
    }
  }, 60_000);

  it("PAGE-008 STEM ranking, extras, blocks, and hydration", async ({ skip }) => {
    if (!db || !base) {
      skip();
      return;
    }

    async function registerUser(stamp: string) {
      const username = `p8${stamp}${Math.random().toString(36).slice(2, 8)}`.slice(0, 12);
      const registered = await json("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          email: `${username}@example.com`,
          username,
          password: "password12",
          ageConfirmed13Plus: true,
          consentVersion: "2026-07-21",
        }),
      });
      expect(registered.status).toBe(201);
      return {
        id: String((registered.body.user as { id?: string } | undefined)?.id ?? ""),
        token: accessTokenFromLogin(registered.body),
      };
    }

    async function allStemItems() {
      const collected: Array<{
        id: string;
        isLiked?: boolean;
        isSaved?: boolean;
        isFollowing?: boolean;
        viewCount?: number;
      }> = [];
      let cursor: string | null = null;
      for (let i = 0; i < 6; i += 1) {
        const path = cursor ? `/api/feed/stem?cursor=${encodeURIComponent(cursor)}` : "/api/feed/stem";
        const page = await json(path);
        expect(page.status).toBe(200);
        const rows = (page.body.videos as typeof collected) || [];
        collected.push(...rows);
        cursor = typeof page.body.nextCursor === "string" ? page.body.nextCursor : null;
        if (!cursor) break;
      }
      return collected;
    }

    const viewer = await registerUser("v");
    const creator = await registerUser("c");
    const blocked = await registerUser("b");
    token = "";
    const unauth = await json("/api/feed/stem");
    expect(unauth.status).toBe(401);
    token = viewer.token;

    const high = await getPool().query<{ id: string }>(
      `INSERT INTO videos (user_id, bunny_path, caption, privacy, is_stem)
       VALUES ($1, 'https://cdn.example/p8-hi.mp4', 'hello', 'public', FALSE) RETURNING id`,
      [creator.id],
    );
    const extra = await getPool().query<{ id: string }>(
      `INSERT INTO videos (user_id, bunny_path, caption, privacy, hashtags, is_stem)
       VALUES ($1, 'https://cdn.example/p8-beach.mp4', 'holiday', 'public', ARRAY['beach'], FALSE) RETURNING id`,
      [creator.id],
    );
    const priv = await getPool().query<{ id: string }>(
      `INSERT INTO videos (user_id, bunny_path, caption, privacy) VALUES ($1, 'https://cdn.example/p8-priv.mp4', 'nope', 'private') RETURNING id`,
      [creator.id],
    );
    const blank = await getPool().query<{ id: string }>(
      `INSERT INTO videos (user_id, bunny_path, caption, privacy) VALUES ($1, '   ', 'blank', 'public') RETURNING id`,
      [creator.id],
    );
    const deleted = await getPool().query<{ id: string }>(
      `INSERT INTO videos (user_id, bunny_path, caption, privacy, deleted_at)
       VALUES ($1, 'https://cdn.example/p8-del.mp4', 'gone', 'public', NOW()) RETURNING id`,
      [creator.id],
    );
    const blockedVideo = await getPool().query<{ id: string }>(
      `INSERT INTO videos (user_id, bunny_path, caption, privacy) VALUES ($1, 'https://cdn.example/p8-blk.mp4', 'blocked', 'public') RETURNING id`,
      [blocked.id],
    );
    await getPool().query(`INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [viewer.id, blocked.id]);
    for (let i = 0; i < 8; i += 1) {
      const watcher = await registerUser(`w${i}`);
      await getPool().query(`INSERT INTO video_views (video_id, viewer_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [
        high.rows[0].id,
        watcher.id,
      ]);
    }

    const items = await allStemItems();
    expect(items.some((row) => row.id === high.rows[0].id)).toBe(true);
    expect(items.some((row) => row.id === extra.rows[0].id)).toBe(true);
    expect(items.some((row) => row.id === priv.rows[0].id)).toBe(false);
    expect(items.some((row) => row.id === blank.rows[0].id)).toBe(false);
    expect(items.some((row) => row.id === blockedVideo.rows[0].id)).toBe(false);
    expect(items.some((row) => row.id === deleted.rows[0].id)).toBe(false);
    expect(items.findIndex((row) => row.id === high.rows[0].id)).toBeLessThan(
      items.findIndex((row) => row.id === extra.rows[0].id),
    );

    const like = await json(`/api/videos/${high.rows[0].id}/like`, { method: "POST" });
    expect(like.status).toBe(200);
    const afterLike = await allStemItems();
    expect(afterLike.find((row) => row.id === high.rows[0].id)?.isLiked).toBe(true);
    const unlike = await json(`/api/videos/${high.rows[0].id}/unlike`, { method: "POST" });
    expect(unlike.status).toBe(200);
    expect((await allStemItems()).find((row) => row.id === high.rows[0].id)?.isLiked).toBe(false);
    const likeAgain = await json(`/api/videos/${high.rows[0].id}/like`, { method: "POST" });
    expect(likeAgain.status).toBe(200);
    const save = await json(`/api/videos/${high.rows[0].id}/save`, { method: "POST" });
    expect(save.status).toBe(200);
    const afterSave = await allStemItems();
    expect(afterSave.find((row) => row.id === high.rows[0].id)?.isSaved).toBe(true);
    const follow = await json(`/api/profiles/${creator.id}/follow`, { method: "POST" });
    expect(follow.status).toBe(200);
    expect((await allStemItems()).find((row) => row.id === high.rows[0].id)?.isFollowing).toBe(true);
    const unfollowPost = await json(`/api/profiles/${creator.id}/unfollow`, { method: "POST" });
    expect(unfollowPost.status).toBe(200);
    expect((await allStemItems()).find((row) => row.id === high.rows[0].id)?.isFollowing).toBe(false);
    const followAgain = await json(`/api/profiles/${creator.id}/follow`, { method: "POST" });
    expect(followAgain.status).toBe(200);

    const flagged = await getPool().query<{ id: string }>(
      `INSERT INTO videos (user_id, bunny_path, caption, privacy, is_stem, created_at)
       VALUES ($1, 'https://cdn.example/p8-flag.mp4', 'hello', 'public', TRUE, NOW() + interval '2 hours') RETURNING id`,
      [creator.id],
    );
    expect((await allStemItems()).some((row) => row.id === flagged.rows[0].id)).toBe(true);

    const bannedCreator = await registerUser("bn");
    const bannedVideo = await getPool().query<{ id: string }>(
      `INSERT INTO videos (user_id, bunny_path, caption, privacy)
       VALUES ($1, 'https://cdn.example/p8-ban.mp4', 'hello', 'public') RETURNING id`,
      [bannedCreator.id],
    );
    await getPool().query(`UPDATE users SET banned_until = NOW() + interval '1 day' WHERE id = $1`, [bannedCreator.id]);
    expect((await allStemItems()).some((row) => row.id === bannedVideo.rows[0].id)).toBe(false);

    for (let i = 0; i < 40; i += 1) {
      await getPool().query(
        `INSERT INTO videos (user_id, bunny_path, caption, privacy, created_at)
         VALUES ($1, $2, 'hello', 'public', NOW() + ($3 || ' minutes')::interval)`,
        [creator.id, `https://cdn.example/p8-top-${i}.mp4`, String(90 + i)],
      );
    }
    const extraTail: string[] = [];
    for (let i = 0; i < 25; i += 1) {
      const row = await getPool().query<{ id: string }>(
        `INSERT INTO videos (user_id, bunny_path, caption, privacy, hashtags, created_at)
         VALUES ($1, $2, 'holiday', 'public', ARRAY['beach'], NOW() - ($3 || ' minutes')::interval) RETURNING id`,
        [creator.id, `https://cdn.example/p8-extra-${i}.mp4`, String(i + 1)],
      );
      extraTail.push(row.rows[0].id);
    }
    const ranked = await allStemItems();
    expect(ranked.length).toBeLessThanOrEqual(55);
    expect(ranked.filter((row) => extraTail.includes(row.id)).length).toBeLessThanOrEqual(20);
    expect(ranked.some((row) => extraTail.includes(row.id) || row.id === extra.rows[0].id)).toBe(true);

    const page1 = await json("/api/feed/stem");
    expect(page1.status).toBe(200);
    expect(Array.isArray(page1.body.videos)).toBe(true);
    const page1Items = (page1.body.videos as Array<{ id: string }>) || [];
    expect(page1.body.nextCursor).toBe("off:20");
    const page2 = await json(`/api/feed/stem?cursor=${encodeURIComponent(String(page1.body.nextCursor))}`);
    expect(page2.status).toBe(200);
    const seen = new Set(page1Items.map((row) => row.id));
    for (const row of (page2.body.videos as Array<{ id: string }>) || []) {
      expect(seen.has(row.id)).toBe(false);
    }

    await getPool().query(`TRUNCATE videos CASCADE`);
    const empty = await json("/api/feed/stem");
    expect(empty.status).toBe(200);
    expect(empty.body).toEqual({ videos: [], nextCursor: null });
  }, 60_000);

  it("PAGE-009 Following relation feed, newest first, blocks, and hydration", async ({ skip }) => {
    if (!db || !base) {
      skip();
      return;
    }

    async function registerUser(stamp: string) {
      const username = `p9${stamp}${Math.random().toString(36).slice(2, 8)}`.slice(0, 12);
      const registered = await json("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          email: `${username}@example.com`,
          username,
          password: "password12",
          ageConfirmed13Plus: true,
          consentVersion: "2026-07-21",
        }),
      });
      expect(registered.status).toBe(201);
      return {
        id: String((registered.body.user as { id?: string } | undefined)?.id ?? ""),
        token: accessTokenFromLogin(registered.body),
      };
    }

    const viewer = await registerUser("v");
    const followed = await registerUser("f");
    const stranger = await registerUser("s");
    const blockedUser = await registerUser("b");
    token = "";
    const unauth = await json("/api/feed/following");
    expect(unauth.status).toBe(200);
    expect(unauth.body).toEqual({ videos: [] });

    token = viewer.token;
    const empty = await json("/api/feed/following");
    expect(empty.status).toBe(200);
    expect(empty.body).toEqual({ videos: [] });

    const newer = await getPool().query<{ id: string }>(
      `INSERT INTO videos (user_id, bunny_path, caption, privacy, created_at)
       VALUES ($1, 'https://cdn.example/p9-new.mp4', 'hello', 'public', NOW()) RETURNING id`,
      [followed.id],
    );
    const older = await getPool().query<{ id: string }>(
      `INSERT INTO videos (user_id, bunny_path, caption, privacy, created_at)
       VALUES ($1, 'https://cdn.example/p9-old.mp4', 'hello', 'public', NOW() - interval '2 hours') RETURNING id`,
      [followed.id],
    );
    const own = await getPool().query<{ id: string }>(
      `INSERT INTO videos (user_id, bunny_path, caption, privacy)
       VALUES ($1, 'https://cdn.example/p9-self.mp4', 'mine', 'public') RETURNING id`,
      [viewer.id],
    );
    const strangerVideo = await getPool().query<{ id: string }>(
      `INSERT INTO videos (user_id, bunny_path, caption, privacy)
       VALUES ($1, 'https://cdn.example/p9-str.mp4', 'nope', 'public') RETURNING id`,
      [stranger.id],
    );
    const priv = await getPool().query<{ id: string }>(
      `INSERT INTO videos (user_id, bunny_path, caption, privacy)
       VALUES ($1, 'https://cdn.example/p9-priv.mp4', 'secret', 'private') RETURNING id`,
      [followed.id],
    );
    const blank = await getPool().query<{ id: string }>(
      `INSERT INTO videos (user_id, bunny_path, caption, privacy)
       VALUES ($1, '   ', 'blank', 'public') RETURNING id`,
      [followed.id],
    );
    const storyish = await getPool().query<{ id: string }>(
      `INSERT INTO videos (user_id, bunny_path, caption, privacy)
       VALUES ($1, 'https://cdn.example/stories/p9.mp4', 'story', 'public') RETURNING id`,
      [followed.id],
    );
    const deleted = await getPool().query<{ id: string }>(
      `INSERT INTO videos (user_id, bunny_path, caption, privacy, deleted_at)
       VALUES ($1, 'https://cdn.example/p9-del.mp4', 'gone', 'public', NOW()) RETURNING id`,
      [followed.id],
    );
    const blockedVideo = await getPool().query<{ id: string }>(
      `INSERT INTO videos (user_id, bunny_path, caption, privacy)
       VALUES ($1, 'https://cdn.example/p9-blk.mp4', 'blocked', 'public') RETURNING id`,
      [blockedUser.id],
    );

    const beforeFollow = await json("/api/feed/following");
    expect(((beforeFollow.body.videos as Array<{ id: string }>) || []).map((row) => row.id)).toEqual([]);

    const follow = await json(`/api/profiles/${followed.id}/follow`, { method: "POST" });
    expect(follow.status).toBe(200);
    await json(`/api/profiles/${blockedUser.id}/follow`, { method: "POST" });
    await getPool().query(`INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [
      viewer.id,
      blockedUser.id,
    ]);

    const page = await json("/api/feed/following");
    expect(page.status).toBe(200);
    const items = (page.body.videos as Array<{
      id: string;
      isLiked?: boolean;
      isSaved?: boolean;
      isFollowing?: boolean;
    }>) || [];
    const ids = items.map((row) => row.id);
    expect(ids).toContain(newer.rows[0].id);
    expect(ids).toContain(older.rows[0].id);
    expect(ids.indexOf(newer.rows[0].id)).toBeLessThan(ids.indexOf(older.rows[0].id));
    expect(ids).not.toContain(own.rows[0].id);
    expect(ids).not.toContain(strangerVideo.rows[0].id);
    expect(ids).not.toContain(priv.rows[0].id);
    expect(ids).not.toContain(blank.rows[0].id);
    expect(ids).not.toContain(storyish.rows[0].id);
    expect(ids).not.toContain(deleted.rows[0].id);
    expect(ids).not.toContain(blockedVideo.rows[0].id);
    expect(items.find((row) => row.id === newer.rows[0].id)?.isFollowing).toBe(true);

    const like = await json(`/api/videos/${newer.rows[0].id}/like`, { method: "POST" });
    expect(like.status).toBe(200);
    const save = await json(`/api/videos/${newer.rows[0].id}/save`, { method: "POST" });
    expect(save.status).toBe(200);
    const hydrated = await json("/api/feed/following");
    const hydratedRow = ((hydrated.body.videos as typeof items) || []).find((row) => row.id === newer.rows[0].id);
    expect(hydratedRow?.isLiked).toBe(true);
    expect(hydratedRow?.isSaved).toBe(true);
    expect(hydratedRow?.isFollowing).toBe(true);

    const bannedCreator = await registerUser("bn");
    await json(`/api/profiles/${bannedCreator.id}/follow`, { method: "POST" });
    const bannedVideo = await getPool().query<{ id: string }>(
      `INSERT INTO videos (user_id, bunny_path, caption, privacy)
       VALUES ($1, 'https://cdn.example/p9-ban.mp4', 'hello', 'public') RETURNING id`,
      [bannedCreator.id],
    );
    await getPool().query(`UPDATE users SET banned_until = NOW() + interval '1 day' WHERE id = $1`, [bannedCreator.id]);
    expect(((await json("/api/feed/following")).body.videos as Array<{ id: string }>).some((row) => row.id === bannedVideo.rows[0].id)).toBe(
      false,
    );

    for (let i = 0; i < 21; i += 1) {
      await getPool().query(
        `INSERT INTO videos (user_id, bunny_path, caption, privacy, created_at)
         VALUES ($1, $2, 'page', 'public', NOW() - ($3 || ' minutes')::interval)`,
        [followed.id, `https://cdn.example/p9-page-${i}.mp4`, String(i + 3)],
      );
    }
    const page1 = await json("/api/feed/following");
    expect(page1.status).toBe(200);
    const page1Items = (page1.body.videos as Array<{ id: string }>) || [];
    expect(page1Items.length).toBe(23);
    expect(page1.body.nextCursor).toBeUndefined();

    const unfollow = await json(`/api/profiles/${followed.id}/unfollow`, { method: "POST" });
    expect(unfollow.status).toBe(200);
    const afterUnfollow = await json("/api/feed/following");
    expect(((afterUnfollow.body.videos as Array<{ id: string }>) || []).some((row) => row.id === newer.rows[0].id)).toBe(false);
  }, 60_000);

  it("PAGE-010 Friends union feed is not mutual-only, newest first, with hydration", async ({ skip }) => {
    if (!db || !base) {
      skip();
      return;
    }

    async function registerUser(stamp: string) {
      const username = `p0${stamp}${Math.random().toString(36).slice(2, 8)}`.slice(0, 12);
      const registered = await json("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          email: `${username}@example.com`,
          username,
          password: "password12",
          ageConfirmed13Plus: true,
          consentVersion: "2026-07-21",
        }),
      });
      expect(registered.status).toBe(201);
      return {
        id: String((registered.body.user as { id?: string } | undefined)?.id ?? ""),
        token: accessTokenFromLogin(registered.body),
      };
    }

    const viewer = await registerUser("v");
    const followee = await registerUser("e");
    const follower = await registerUser("r");
    const stranger = await registerUser("s");
    const blockedUser = await registerUser("b");
    token = "";
    const unauth = await json("/api/feed/friends");
    expect(unauth.status).toBe(200);
    expect(unauth.body).toEqual({ videos: [] });

    token = viewer.token;
    const empty = await json("/api/feed/friends");
    expect(empty.status).toBe(200);
    expect(empty.body).toEqual({ videos: [] });

    const followeeNewer = await getPool().query<{ id: string }>(
      `INSERT INTO videos (user_id, bunny_path, caption, privacy, created_at)
       VALUES ($1, 'https://cdn.example/p10-e-new.mp4', 'hello', 'public', NOW()) RETURNING id`,
      [followee.id],
    );
    const followeeOlder = await getPool().query<{ id: string }>(
      `INSERT INTO videos (user_id, bunny_path, caption, privacy, created_at)
       VALUES ($1, 'https://cdn.example/p10-e-old.mp4', 'hello', 'public', NOW() - interval '2 hours') RETURNING id`,
      [followee.id],
    );
    const followerVideo = await getPool().query<{ id: string }>(
      `INSERT INTO videos (user_id, bunny_path, caption, privacy)
       VALUES ($1, 'https://cdn.example/p10-r.mp4', 'hello', 'public') RETURNING id`,
      [follower.id],
    );
    const own = await getPool().query<{ id: string }>(
      `INSERT INTO videos (user_id, bunny_path, caption, privacy)
       VALUES ($1, 'https://cdn.example/p10-self.mp4', 'mine', 'public') RETURNING id`,
      [viewer.id],
    );
    const strangerVideo = await getPool().query<{ id: string }>(
      `INSERT INTO videos (user_id, bunny_path, caption, privacy)
       VALUES ($1, 'https://cdn.example/p10-str.mp4', 'nope', 'public') RETURNING id`,
      [stranger.id],
    );
    const priv = await getPool().query<{ id: string }>(
      `INSERT INTO videos (user_id, bunny_path, caption, privacy)
       VALUES ($1, 'https://cdn.example/p10-priv.mp4', 'secret', 'private') RETURNING id`,
      [followee.id],
    );
    const blockedVideo = await getPool().query<{ id: string }>(
      `INSERT INTO videos (user_id, bunny_path, caption, privacy)
       VALUES ($1, 'https://cdn.example/p10-blk.mp4', 'blocked', 'public') RETURNING id`,
      [blockedUser.id],
    );

    await json(`/api/profiles/${followee.id}/follow`, { method: "POST" });
    token = follower.token;
    await json(`/api/profiles/${viewer.id}/follow`, { method: "POST" });
    token = blockedUser.token;
    await json(`/api/profiles/${viewer.id}/follow`, { method: "POST" });
    token = viewer.token;
    await getPool().query(`INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [
      viewer.id,
      blockedUser.id,
    ]);

    const page = await json("/api/feed/friends");
    expect(page.status).toBe(200);
    const items = (page.body.videos as Array<{
      id: string;
      isLiked?: boolean;
      isSaved?: boolean;
      isFollowing?: boolean;
    }>) || [];
    const ids = items.map((row) => row.id);
    expect(ids).toContain(followeeNewer.rows[0].id);
    expect(ids).toContain(followeeOlder.rows[0].id);
    expect(ids).toContain(followerVideo.rows[0].id);
    expect(ids.indexOf(followeeNewer.rows[0].id)).toBeLessThan(ids.indexOf(followeeOlder.rows[0].id));
    expect(ids).not.toContain(own.rows[0].id);
    expect(ids).not.toContain(strangerVideo.rows[0].id);
    expect(ids).not.toContain(priv.rows[0].id);
    expect(ids).not.toContain(blockedVideo.rows[0].id);
    expect(items.find((row) => row.id === followeeNewer.rows[0].id)?.isFollowing).toBe(true);
    expect(items.find((row) => row.id === followerVideo.rows[0].id)?.isFollowing).toBe(false);

    const like = await json(`/api/videos/${followeeNewer.rows[0].id}/like`, { method: "POST" });
    expect(like.status).toBe(200);
    const save = await json(`/api/videos/${followeeNewer.rows[0].id}/save`, { method: "POST" });
    expect(save.status).toBe(200);
    const hydrated = await json("/api/feed/friends");
    const hydratedRow = ((hydrated.body.videos as typeof items) || []).find((row) => row.id === followeeNewer.rows[0].id);
    expect(hydratedRow?.isLiked).toBe(true);
    expect(hydratedRow?.isSaved).toBe(true);

    const unfollow = await json(`/api/profiles/${followee.id}/unfollow`, { method: "POST" });
    expect(unfollow.status).toBe(200);
    const afterUnfollow = await json("/api/feed/friends");
    const afterIds = ((afterUnfollow.body.videos as Array<{ id: string }>) || []).map((row) => row.id);
    expect(afterIds).not.toContain(followeeNewer.rows[0].id);
    expect(afterIds).toContain(followerVideo.rows[0].id);
  }, 60_000);

  it("PAGE-011 Discover trending, hashtags, ranking, blocks, and in-page search", async ({ skip }) => {
    if (!db || !base) {
      skip();
      return;
    }

    async function registerUser(stamp: string) {
      const username = `d11${stamp}${Math.random().toString(36).slice(2, 8)}`.slice(0, 12);
      const registered = await json("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          email: `${username}@example.com`,
          username,
          password: "password12",
          ageConfirmed13Plus: true,
          consentVersion: "2026-07-21",
        }),
      });
      expect(registered.status).toBe(201);
      return {
        id: String((registered.body.user as { id?: string } | undefined)?.id ?? ""),
        username,
        token: accessTokenFromLogin(registered.body),
      };
    }

    const viewer = await registerUser("v");
    const creator = await registerUser("c");
    const blockedUser = await registerUser("b");
    const other = await registerUser("o");

    await getPool().query(`TRUNCATE videos CASCADE`);
    await getPool().query(`TRUNCATE gift_transactions CASCADE`);
    await getPool().query(`TRUNCATE blocks CASCADE`);

    const hot = await getPool().query<{ id: string }>(
      `INSERT INTO videos (user_id, bunny_path, caption, privacy, hashtags)
       VALUES ($1, 'https://cdn.example/d11-hot.mp4', 'nsfw night', 'public', ARRAY['dance']) RETURNING id`,
      [creator.id],
    );
    const beach = await getPool().query<{ id: string }>(
      `INSERT INTO videos (user_id, bunny_path, caption, privacy, hashtags)
       VALUES ($1, 'https://cdn.example/d11-beach.mp4', 'beach day', 'public', ARRAY['summer']) RETURNING id`,
      [creator.id],
    );
    const blockedVideo = await getPool().query<{ id: string }>(
      `INSERT INTO videos (user_id, bunny_path, caption, privacy, hashtags)
       VALUES ($1, 'https://cdn.example/d11-blk.mp4', 'sexy blocked', 'public', ARRAY['nsfw']) RETURNING id`,
      [blockedUser.id],
    );
    const gone = await getPool().query<{ id: string }>(
      `INSERT INTO videos (user_id, bunny_path, caption, privacy, deleted_at)
       VALUES ($1, 'https://cdn.example/d11-del.mp4', 'nsfw gone', 'public', NOW()) RETURNING id`,
      [creator.id],
    );
    const extraTag = await getPool().query<{ id: string }>(
      `INSERT INTO videos (user_id, bunny_path, caption, privacy, hashtags)
       VALUES ($1, 'https://cdn.example/d11-tag.mp4', 'hello dance', 'public', ARRAY['dance','funny']) RETURNING id`,
      [other.id],
    );

    await getPool().query(`INSERT INTO video_views (video_id, viewer_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [
      hot.rows[0].id,
      viewer.id,
    ]);
    await getPool().query(`INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [
      viewer.id,
      blockedUser.id,
    ]);
    await getPool().query(
      `INSERT INTO gift_transactions (sender_id, recipient_id, gift_id, coin_cost, bucket, idempotency_key)
       VALUES ($1, $2, 'rose', 10, 'paid', $3), ($1, $2, 'rose', 999, 'test', $4), ($1, $5, 'heart', 50, 'paid', $6)`,
      [viewer.id, creator.id, `d11a-${Date.now()}`, `d11b-${Date.now()}`, other.id, `d11c-${Date.now()}`],
    );

    token = viewer.token;
    const page = await json("/api/discover");
    expect(page.status).toBe(200);
    const trending = (page.body.trending as Array<{ id: string; caption?: string }>) || [];
    const trendingIds = trending.map((row) => row.id);
    expect(trendingIds).toContain(hot.rows[0].id);
    expect(trendingIds).not.toContain(beach.rows[0].id);
    expect(trendingIds).not.toContain(blockedVideo.rows[0].id);
    expect(trendingIds).not.toContain(gone.rows[0].id);
    expect(trendingIds.indexOf(hot.rows[0].id)).toBe(0);

    const hashtags = (page.body.hashtags as Array<{ tag: string; useCount: number }>) || [];
    const dance = hashtags.find((row) => row.tag === "dance");
    expect(dance?.useCount).toBeGreaterThanOrEqual(2);
    expect(hashtags[0]?.tag).toBe("dance");

    const rankings = (page.body.rankings as Array<{ userId: string; totalCoins: number }>) || [];
    expect(rankings.map((row) => row.userId)).toEqual([other.id, creator.id]);
    expect(rankings[0]?.totalCoins).toBe(50);
    expect(rankings[1]?.totalCoins).toBe(10);

    const search = await json(`/api/discover/search?q=${encodeURIComponent(creator.username.slice(0, 4))}`);
    expect(search.status).toBe(200);
    const users = (search.body.users as Array<{ userId: string }>) || [];
    expect(users.some((row) => row.userId === creator.id)).toBe(true);
    expect(users.some((row) => row.userId === viewer.id)).toBe(false);
    expect(users.some((row) => row.userId === blockedUser.id)).toBe(false);

    const videoSearch = await json("/api/discover/search?q=hello");
    const videos = (videoSearch.body.videos as Array<{ id: string }>) || [];
    expect(videos.map((row) => row.id)).toContain(extraTag.rows[0].id);
    expect(videos.map((row) => row.id)).not.toContain(blockedVideo.rows[0].id);
  }, 60_000);

  it("PAGE-012 Search is server-authoritative for users, videos, blocks, and browse", async ({ skip }) => {
    if (!db || !base) {
      skip();
      return;
    }

    async function registerUser(stamp: string) {
      const username = `s12${stamp}${Math.random().toString(36).slice(2, 8)}`.slice(0, 12);
      const registered = await json("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          email: `${username}@example.com`,
          username,
          password: "password12",
          ageConfirmed13Plus: true,
          consentVersion: "2026-07-21",
        }),
      });
      expect(registered.status).toBe(201);
      return {
        id: String((registered.body.user as { id?: string } | undefined)?.id ?? ""),
        username,
        token: accessTokenFromLogin(registered.body),
      };
    }

    const viewer = await registerUser("v");
    const maya = await registerUser("m");
    const blockedUser = await registerUser("b");
    await getPool().query(`UPDATE users SET display_name = 'Maya Star' WHERE id = $1`, [maya.id]);
    await getPool().query(
      `INSERT INTO videos (user_id, bunny_path, caption, privacy, hashtags)
       VALUES ($1, 'https://cdn.example/s12-dance.mp4', 'dance night', 'public', ARRAY['dance'])`,
      [maya.id],
    );
    await getPool().query(
      `INSERT INTO videos (user_id, bunny_path, caption, privacy, hashtags)
       VALUES ($1, 'https://cdn.example/s12-blk.mp4', 'dance blocked', 'public', ARRAY['dance'])`,
      [blockedUser.id],
    );
    await getPool().query(`INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [
      viewer.id,
      blockedUser.id,
    ]);
    await getPool().query(
      `INSERT INTO videos (user_id, bunny_path, caption, privacy, deleted_at)
       VALUES ($1, 'https://cdn.example/s12-del.mp4', 'dance gone', 'public', NOW())`,
      [maya.id],
    );

    token = viewer.token;
    const empty = await json("/api/search?category=All");
    expect(empty.status).toBe(200);
    expect(Array.isArray(empty.body.users)).toBe(true);
    expect(((empty.body.users as unknown[]) || []).length).toBe(0);
    const browseIds = ((empty.body.videos as Array<{ id: string; caption?: string }>) || []).map((row) => row.id);

    const dance = await json("/api/search?category=Dance");
    const danceCaptions = ((dance.body.videos as Array<{ description?: string; user?: { username?: string } }>) || []).map(
      (row) => `${row.description || ""} ${row.user?.username || ""}`,
    );
    expect(danceCaptions.some((row) => row.includes("dance night"))).toBe(true);
    expect(danceCaptions.some((row) => row.includes("dance blocked"))).toBe(false);

    const found = await json(`/api/search?q=${encodeURIComponent(maya.username.slice(0, 4))}`);
    expect(found.status).toBe(200);
    const users = (found.body.users as Array<{ userId: string; username: string }>) || [];
    expect(users.some((row) => row.userId === maya.id)).toBe(true);
    expect(users.some((row) => row.userId === blockedUser.id)).toBe(false);

    const videoHits = await json("/api/search?q=dance");
    const videos = (videoHits.body.videos as Array<{ description?: string; id: string }>) || [];
    expect(videos.some((row) => (row.description || "").includes("dance night"))).toBe(true);
    expect(videos.some((row) => (row.description || "").includes("dance gone"))).toBe(false);
    expect(videos.some((row) => (row.description || "").includes("dance blocked"))).toBe(false);
    expect(browseIds.length).toBeGreaterThan(0);

    const blank = await json("/api/search?q=%20%20");
    expect(((blank.body.users as unknown[]) || []).length).toBe(0);
  }, 60_000);

  it("PAGE-013 Hashtag exact match, views ranking, blocks, and count", async ({ skip }) => {
    if (!db || !base) {
      skip();
      return;
    }

    async function registerUser(stamp: string) {
      const username = `h13${stamp}${Math.random().toString(36).slice(2, 8)}`.slice(0, 12);
      const registered = await json("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          email: `${username}@example.com`,
          username,
          password: "password12",
          ageConfirmed13Plus: true,
          consentVersion: "2026-07-21",
        }),
      });
      expect(registered.status).toBe(201);
      return {
        id: String((registered.body.user as { id?: string } | undefined)?.id ?? ""),
        username,
        token: accessTokenFromLogin(registered.body),
      };
    }

    const viewer = await registerUser("v");
    const creator = await registerUser("c");
    const blockedUser = await registerUser("b");
    const car = await getPool().query<{ id: string }>(
      `INSERT INTO videos (user_id, bunny_path, caption, privacy, hashtags)
       VALUES ($1, 'https://cdn.example/h13-car.mp4', 'car clip', 'public', ARRAY['car'])
       RETURNING id`,
      [creator.id],
    );
    const carpet = await getPool().query<{ id: string }>(
      `INSERT INTO videos (user_id, bunny_path, caption, privacy, hashtags)
       VALUES ($1, 'https://cdn.example/h13-carpet.mp4', 'carpet clip', 'public', ARRAY['carpet'])
       RETURNING id`,
      [creator.id],
    );
    await getPool().query(
      `INSERT INTO videos (user_id, bunny_path, caption, privacy, hashtags)
       VALUES ($1, 'https://cdn.example/h13-hash.mp4', 'hashed car', 'public', ARRAY['#Car'])`,
      [creator.id],
    );
    const blockedVid = await getPool().query<{ id: string }>(
      `INSERT INTO videos (user_id, bunny_path, caption, privacy, hashtags)
       VALUES ($1, 'https://cdn.example/h13-blk.mp4', 'blocked car', 'public', ARRAY['car'])
       RETURNING id`,
      [blockedUser.id],
    );
    await getPool().query(
      `INSERT INTO videos (user_id, bunny_path, caption, privacy, hashtags, deleted_at)
       VALUES ($1, 'https://cdn.example/h13-del.mp4', 'deleted car', 'public', ARRAY['car'], NOW())`,
      [creator.id],
    );
    await getPool().query(`INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [
      viewer.id,
      blockedUser.id,
    ]);
    await getPool().query(`INSERT INTO video_views (video_id, viewer_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [
      car.rows[0].id,
      viewer.id,
    ]);

    token = viewer.token;
    const page = await json("/api/hashtags/Car");
    expect(page.status).toBe(200);
    expect(page.body.tag).toBe("car");
    expect(Number(page.body.useCount)).toBe(2);
    const videos = (page.body.videos as Array<{ id: string }>) || [];
    expect(videos.map((row) => row.id)).toContain(car.rows[0].id);
    expect(videos.map((row) => row.id)).not.toContain(carpet.rows[0].id);
    expect(videos.map((row) => row.id)).not.toContain(blockedVid.rows[0].id);
    expect(videos[0]?.id).toBe(car.rows[0].id);

    const hashed = await json("/api/hashtags/%23car");
    expect(hashed.body.tag).toBe("car");
    expect(((hashed.body.videos as Array<{ id: string }>) || []).map((row) => row.id)).toContain(car.rows[0].id);

    const missing = await json("/api/hashtags/nope");
    expect(missing.body.useCount).toBe(0);
    expect(missing.body.videos).toEqual([]);
  }, 60_000);

  it("PAGE-014 video detail is server-authoritative for access and hydration", async ({ skip }) => {
    if (!db || !base) {
      skip();
      return;
    }

    async function registerUser(stamp: string) {
      const username = `p14${stamp}${Math.random().toString(36).slice(2, 8)}`.slice(0, 12);
      const registered = await json("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          email: `${username}@example.com`,
          username,
          password: "password12",
          ageConfirmed13Plus: true,
          consentVersion: "2026-07-21",
        }),
      });
      expect(registered.status).toBe(201);
      return {
        id: String((registered.body.user as { id?: string } | undefined)?.id ?? ""),
        token: accessTokenFromLogin(registered.body),
      };
    }

    const viewer = await registerUser("v");
    const creator = await registerUser("c");
    const blockedUser = await registerUser("b");
    const publicVideo = await getPool().query<{ id: string }>(
      `INSERT INTO videos (user_id, bunny_path, caption, privacy, hashtags)
       VALUES ($1, 'https://cdn.example/p14.mp4', 'hello #car', 'public', ARRAY['car'])
       RETURNING id`,
      [creator.id],
    );
    const videoId = publicVideo.rows[0].id;
    const privateVideo = await getPool().query<{ id: string }>(
      `INSERT INTO videos (user_id, bunny_path, caption, privacy)
       VALUES ($1, 'https://cdn.example/p14-priv.mp4', 'secret', 'private')
       RETURNING id`,
      [creator.id],
    );
    const blockedVideo = await getPool().query<{ id: string }>(
      `INSERT INTO videos (user_id, bunny_path, caption, privacy)
       VALUES ($1, 'https://cdn.example/p14-blk.mp4', 'blocked', 'public')
       RETURNING id`,
      [blockedUser.id],
    );
    const deletedVideo = await getPool().query<{ id: string }>(
      `INSERT INTO videos (user_id, bunny_path, caption, privacy, deleted_at)
       VALUES ($1, 'https://cdn.example/p14-del.mp4', 'gone', 'public', NOW())
       RETURNING id`,
      [creator.id],
    );
    const blankMedia = await getPool().query<{ id: string }>(
      `INSERT INTO videos (user_id, bunny_path, caption, privacy)
       VALUES ($1, '   ', 'empty media', 'public')
       RETURNING id`,
      [creator.id],
    );
    await getPool().query(`INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [
      viewer.id,
      blockedUser.id,
    ]);

    token = "";
    const anon = await json(`/api/videos/${videoId}`);
    expect(anon.status).toBe(200);
    expect(anon.body.id).toBe(videoId);
    expect(anon.body.url).toBe("https://cdn.example/p14.mp4");
    expect(anon.body.isLiked).toBe(false);

    const malformed = await json("/api/videos/not-a-video");
    expect(malformed.status).toBe(404);
    const unknown = await json("/api/videos/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(unknown.status).toBe(404);
    const deleted = await json(`/api/videos/${deletedVideo.rows[0].id}`);
    expect(deleted.status).toBe(404);
    const blank = await json(`/api/videos/${blankMedia.rows[0].id}`);
    expect(blank.status).toBe(404);

    token = viewer.token;
    const blocked = await json(`/api/videos/${blockedVideo.rows[0].id}`);
    expect(blocked.status).toBe(404);
    const strangerPrivate = await json(`/api/videos/${privateVideo.rows[0].id}`);
    expect(strangerPrivate.status).toBe(404);

    token = creator.token;
    const ownerPrivate = await json(`/api/videos/${privateVideo.rows[0].id}`);
    expect(ownerPrivate.status).toBe(200);
    expect(ownerPrivate.body.id).toBe(privateVideo.rows[0].id);

    token = viewer.token;
    const like = await json(`/api/videos/${videoId}/like`, { method: "POST" });
    expect(like.status).toBe(200);
    const save = await json(`/api/videos/${videoId}/save`, { method: "POST" });
    expect(save.status).toBe(200);
    const follow = await json(`/api/profiles/${creator.id}/follow`, { method: "POST" });
    expect(follow.status).toBe(200);
    const hydrated = await json(`/api/videos/${videoId}`);
    expect(hydrated.status).toBe(200);
    expect(hydrated.body.isLiked).toBe(true);
    expect(hydrated.body.isSaved).toBe(true);
    expect(hydrated.body.isFollowing).toBe(true);
    const hydratedUser = (hydrated.body.user as { id?: string; username?: string } | undefined) ?? {};
    expect(hydratedUser.id).toBe(creator.id);
    expect(hydratedUser.username).toBeTruthy();

    const unlike = await json(`/api/videos/${videoId}/unlike`, { method: "POST" });
    expect(unlike.status).toBe(200);
    const unsave = await json(`/api/videos/${videoId}/unsave`, { method: "POST" });
    expect(unsave.status).toBe(200);
    const unfollow = await json(`/api/profiles/${creator.id}/follow`, { method: "DELETE" });
    expect(unfollow.status).toBe(200);
    const cleared = await json(`/api/videos/${videoId}`);
    expect(cleared.body.isLiked).toBe(false);
    expect(cleared.body.isSaved).toBe(false);
    expect(cleared.body.isFollowing).toBe(false);

    await getPool().query(`INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [
      creator.id,
      viewer.id,
    ]);
    const creatorBlockedViewer = await json(`/api/videos/${videoId}`);
    expect(creatorBlockedViewer.status).toBe(404);
    await getPool().query(`DELETE FROM blocks WHERE blocker_id = $1 AND blocked_id = $2`, [creator.id, viewer.id]);

    await getPool().query(`UPDATE users SET banned_until = NOW() + INTERVAL '1 day' WHERE id = $1`, [creator.id]);
    const banned = await json(`/api/videos/${videoId}`);
    expect(banned.status).toBe(404);
    await getPool().query(`UPDATE users SET banned_until = NULL WHERE id = $1`, [creator.id]);

    await getPool().query(`UPDATE users SET deleted_at = NOW() WHERE id = $1`, [creator.id]);
    const creatorGone = await json(`/api/videos/${videoId}`);
    expect(creatorGone.status).toBe(404);
  }, 60_000);

  it("PAGE-015 saved list is save-time ordered, authed, and access-filtered", async ({ skip }) => {
    if (!db || !base) {
      skip();
      return;
    }

    async function registerUser(stamp: string) {
      const username = `p15${stamp}${Math.random().toString(36).slice(2, 8)}`.slice(0, 12);
      const registered = await json("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          email: `${username}@example.com`,
          username,
          password: "password12",
          ageConfirmed13Plus: true,
          consentVersion: "2026-07-21",
        }),
      });
      expect(registered.status).toBe(201);
      return {
        id: String((registered.body.user as { id?: string } | undefined)?.id ?? ""),
        token: accessTokenFromLogin(registered.body),
      };
    }

    const viewer = await registerUser("v");
    const other = await registerUser("o");
    const creator = await registerUser("c");
    const blockedUser = await registerUser("b");

    const older = await getPool().query<{ id: string }>(
      `INSERT INTO videos (user_id, bunny_path, caption, privacy)
       VALUES ($1, 'https://cdn.example/p15-old.mp4', 'older', 'public')
       RETURNING id`,
      [creator.id],
    );
    const newer = await getPool().query<{ id: string }>(
      `INSERT INTO videos (user_id, bunny_path, caption, privacy)
       VALUES ($1, 'https://cdn.example/p15-new.mp4', 'newer', 'public')
       RETURNING id`,
      [creator.id],
    );
    const ownPrivate = await getPool().query<{ id: string }>(
      `INSERT INTO videos (user_id, bunny_path, caption, privacy)
       VALUES ($1, 'https://cdn.example/p15-mine.mp4', 'mine', 'private')
       RETURNING id`,
      [viewer.id],
    );
    const theirPrivate = await getPool().query<{ id: string }>(
      `INSERT INTO videos (user_id, bunny_path, caption, privacy)
       VALUES ($1, 'https://cdn.example/p15-priv.mp4', 'secret', 'private')
       RETURNING id`,
      [creator.id],
    );
    const blockedVid = await getPool().query<{ id: string }>(
      `INSERT INTO videos (user_id, bunny_path, caption, privacy)
       VALUES ($1, 'https://cdn.example/p15-blk.mp4', 'blocked', 'public')
       RETURNING id`,
      [blockedUser.id],
    );
    const deletedVid = await getPool().query<{ id: string }>(
      `INSERT INTO videos (user_id, bunny_path, caption, privacy, deleted_at)
       VALUES ($1, 'https://cdn.example/p15-del.mp4', 'gone', 'public', NOW())
       RETURNING id`,
      [creator.id],
    );
    const blankVid = await getPool().query<{ id: string }>(
      `INSERT INTO videos (user_id, bunny_path, caption, privacy)
       VALUES ($1, '   ', 'blank', 'public')
       RETURNING id`,
      [creator.id],
    );

    token = viewer.token;
    const saveOlder = await json(`/api/videos/${older.rows[0].id}/save`, { method: "POST" });
    expect(saveOlder.status).toBe(200);
    const saveMine = await json(`/api/videos/${ownPrivate.rows[0].id}/save`, { method: "POST" });
    expect(saveMine.status).toBe(200);
    await getPool().query(`UPDATE video_saves SET created_at = NOW() - INTERVAL '2 hours' WHERE user_id = $1 AND video_id = $2`, [
      viewer.id,
      older.rows[0].id,
    ]);
    await getPool().query(`UPDATE video_saves SET created_at = NOW() - INTERVAL '1 hour' WHERE user_id = $1 AND video_id = $2`, [
      viewer.id,
      ownPrivate.rows[0].id,
    ]);
    const saveNewer = await json(`/api/videos/${newer.rows[0].id}/save`, { method: "POST" });
    expect(saveNewer.status).toBe(200);
    await getPool().query(`INSERT INTO video_saves (user_id, video_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [
      viewer.id,
      theirPrivate.rows[0].id,
    ]);
    await getPool().query(`INSERT INTO video_saves (user_id, video_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [
      viewer.id,
      blockedVid.rows[0].id,
    ]);
    await getPool().query(`INSERT INTO video_saves (user_id, video_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [
      viewer.id,
      deletedVid.rows[0].id,
    ]);
    await getPool().query(`INSERT INTO video_saves (user_id, video_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [
      viewer.id,
      blankVid.rows[0].id,
    ]);
    await getPool().query(`INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [
      viewer.id,
      blockedUser.id,
    ]);

    token = "";
    const unauth = await json("/api/videos/saved/list");
    expect(unauth.status).toBe(401);

    token = viewer.token;
    const page = await json("/api/videos/saved/list?limit=50&offset=0");
    expect(page.status).toBe(200);
    const videos = (page.body.videos as Array<{ id: string }>) || [];
    const ids = videos.map((row) => row.id);
    expect(ids[0]).toBe(newer.rows[0].id);
    expect(ids).toContain(older.rows[0].id);
    expect(ids).toContain(ownPrivate.rows[0].id);
    expect(ids).not.toContain(theirPrivate.rows[0].id);
    expect(ids).not.toContain(blockedVid.rows[0].id);
    expect(ids).not.toContain(deletedVid.rows[0].id);
    expect(ids).not.toContain(blankVid.rows[0].id);
    expect(page.body.hasMore).toBe(false);

    const first = await json("/api/videos/saved/list?limit=1&offset=0");
    expect(((first.body.videos as Array<{ id: string }>) || [])[0]?.id).toBe(newer.rows[0].id);
    expect(first.body.hasMore).toBe(true);
    const second = await json("/api/videos/saved/list?limit=1&offset=1");
    expect(((second.body.videos as Array<{ id: string }>) || [])[0]?.id).not.toBe(newer.rows[0].id);

    const unsave = await json(`/api/videos/${newer.rows[0].id}/unsave`, { method: "POST" });
    expect(unsave.status).toBe(200);
    const afterUnsave = await json("/api/videos/saved/list");
    expect(((afterUnsave.body.videos as Array<{ id: string }>) || []).map((row) => row.id)).not.toContain(newer.rows[0].id);

    token = other.token;
    const otherPage = await json("/api/videos/saved/list");
    expect(otherPage.status).toBe(200);
    expect(otherPage.body.videos).toEqual([]);
  }, 60_000);

  it("PAGE-016 music status, playlists, local search, and preview are server-owned", async ({ skip }) => {
    if (!db || !base) {
      skip();
      return;
    }

    const previousKey = process.env.EPIDEMIC_SOUND_API_KEY;
    delete process.env.EPIDEMIC_SOUND_API_KEY;
    delete process.env.EPIDEMIC_API_KEY;
    delete process.env.EPIDEMIC_SOUND_KEY;

    const status = await json("/api/music/status");
    expect(status.status).toBe(200);
    expect(status.body.configured).toBe(false);

    const playlists = await json("/api/music/playlists");
    expect(playlists.status).toBe(200);
    expect(playlists.body.configured).toBe(false);
    expect(playlists.body.playlists).toEqual([]);

    await getPool().query(
      `INSERT INTO sounds (id, title, artist, audio_url, cover_url, duration_ms, provider)
       VALUES ('local-sound-1', 'Studio Take', 'Creator', 'https://cdn.example/local.mp3', NULL, 15000, 'elix')
       ON CONFLICT (id) DO UPDATE SET audio_url = EXCLUDED.audio_url`,
    );

    const emptySearch = await json("/api/music/search");
    expect(emptySearch.status).toBe(200);
    expect(Array.isArray(emptySearch.body.tracks)).toBe(true);
    expect(((emptySearch.body.tracks as Array<{ id: string }>) || []).some((row) => row.id === "local-sound-1")).toBe(true);

    const termSearch = await json("/api/music/search?term=Studio");
    expect(termSearch.status).toBe(503);

    const preview = await json("/api/music/tracks/local-sound-1/preview");
    expect(preview.status).toBe(200);
    expect(preview.body.url).toBe("https://cdn.example/local.mp3");

    const missing = await json("/api/music/tracks/not-a-real-track/preview");
    expect(missing.status).toBe(404);

    const videosFeed = await json("/api/music/videos/local-sound-1");
    expect(videosFeed.status).toBe(404);

    if (previousKey) process.env.EPIDEMIC_SOUND_API_KEY = previousKey;
  }, 60_000);

  it("PAGE-017 live discover list is server-authoritative and access-filtered", async ({ skip }) => {
    if (!db || !base) {
      skip();
      return;
    }

    async function registerUser(stamp: string) {
      const username = `p17${stamp}${Math.random().toString(36).slice(2, 8)}`.slice(0, 12);
      const registered = await json("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          email: `${username}@example.com`,
          username,
          password: "password12",
          ageConfirmed13Plus: true,
          consentVersion: "2026-07-21",
        }),
      });
      expect(registered.status).toBe(201);
      return {
        id: String((registered.body.user as { id?: string } | undefined)?.id ?? ""),
        token: accessTokenFromLogin(registered.body),
      };
    }

    const viewer = await registerUser("v");
    const hostA = await registerUser("a");
    const hostB = await registerUser("b");
    const blockedHost = await registerUser("x");
    const hostWhoBlocks = await registerUser("h");
    const bannedHost = await registerUser("n");
    const deletedHost = await registerUser("d");

    const older = await getPool().query<{ id: string }>(
      `INSERT INTO live_streams (host_id, room_id, title, status, started_at)
       VALUES ($1, $2, 'older', 'live', NOW() - INTERVAL '2 hours') RETURNING id`,
      [hostA.id, hostA.id],
    );
    const newer = await getPool().query<{ id: string }>(
      `INSERT INTO live_streams (host_id, room_id, title, status, started_at)
       VALUES ($1, $2, 'newer', 'live', NOW() - INTERVAL '1 minute') RETURNING id`,
      [hostB.id, hostB.id],
    );
    const ended = await getPool().query<{ id: string }>(
      `INSERT INTO live_streams (host_id, room_id, title, status, started_at, ended_at)
       VALUES ($1, $2, 'ended', 'ended', NOW(), NOW()) RETURNING id`,
      [hostA.id, `${hostA.id}-ended`],
    );
    const blockedLive = await getPool().query<{ id: string }>(
      `INSERT INTO live_streams (host_id, room_id, title, status)
       VALUES ($1, $2, 'blocked', 'live') RETURNING id`,
      [blockedHost.id, blockedHost.id],
    );
    const hostBlockedViewer = await getPool().query<{ id: string }>(
      `INSERT INTO live_streams (host_id, room_id, title, status)
       VALUES ($1, $2, 'host-block', 'live') RETURNING id`,
      [hostWhoBlocks.id, hostWhoBlocks.id],
    );
    const bannedLive = await getPool().query<{ id: string }>(
      `INSERT INTO live_streams (host_id, room_id, title, status)
       VALUES ($1, $2, 'banned', 'live') RETURNING id`,
      [bannedHost.id, bannedHost.id],
    );
    const deletedLive = await getPool().query<{ id: string }>(
      `INSERT INTO live_streams (host_id, room_id, title, status)
       VALUES ($1, $2, 'deleted', 'live') RETURNING id`,
      [deletedHost.id, deletedHost.id],
    );

    await getPool().query(`INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [
      viewer.id,
      blockedHost.id,
    ]);
    await getPool().query(`INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [
      hostWhoBlocks.id,
      viewer.id,
    ]);
    await getPool().query(`UPDATE users SET banned_until = NOW() + INTERVAL '1 day' WHERE id = $1`, [bannedHost.id]);
    await getPool().query(`UPDATE users SET deleted_at = NOW() WHERE id = $1`, [deletedHost.id]);

    token = viewer.token;
    const listed = await json("/api/live/streams");
    expect(listed.status).toBe(200);
    const rows = (listed.body.streams as Array<{ streamId: string; roomId: string; hostId: string; title: string }>) || [];
    const ids = rows.map((row) => row.streamId);
    expect(ids[0]).toBe(newer.rows[0].id);
    expect(ids).toContain(older.rows[0].id);
    expect(rows.find((row) => row.streamId === newer.rows[0].id)?.roomId).toBe(hostB.id);
    expect(ids).not.toContain(ended.rows[0].id);
    expect(ids).not.toContain(blockedLive.rows[0].id);
    expect(ids).not.toContain(hostBlockedViewer.rows[0].id);
    expect(ids).not.toContain(bannedLive.rows[0].id);
    expect(ids).not.toContain(deletedLive.rows[0].id);

    await getPool().query(`UPDATE live_streams SET status = 'ended', ended_at = NOW() WHERE id = $1`, [newer.rows[0].id]);
    const afterEnd = await json("/api/live/streams");
    const afterIds = ((afterEnd.body.streams as Array<{ streamId: string }>) || []).map((row) => row.streamId);
    expect(afterIds).not.toContain(newer.rows[0].id);
    expect(afterIds).toContain(older.rows[0].id);
  }, 60_000);

  it("PAGE-018 live host start/end is server-owned and restartable", async ({ skip }) => {
    if (!db || !base) {
      skip();
      return;
    }

    async function registerUser(stamp: string) {
      const username = `p18${stamp}${Math.random().toString(36).slice(2, 8)}`.slice(0, 12);
      const registered = await json("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          email: `${username}@example.com`,
          username,
          password: "password12",
          ageConfirmed13Plus: true,
          consentVersion: "2026-07-21",
        }),
      });
      expect(registered.status).toBe(201);
      return {
        id: String((registered.body.user as { id?: string } | undefined)?.id ?? ""),
        token: accessTokenFromLogin(registered.body),
      };
    }

    const host = await registerUser("h");
    const other = await registerUser("o");

    const unauth = await fetch(`${base}/api/live/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "LIVE" }),
    });
    expect(unauth.status).toBe(401);

    const start = await fetch(`${base}/api/live/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${host.token}` },
      body: JSON.stringify({ title: "LIVE" }),
    });
    expect(start.status).toBe(503);

    const first = await getPool().query<{ id: string }>(
      `INSERT INTO live_streams (host_id, room_id, title, status) VALUES ($1, $2, 'LIVE', 'live') RETURNING id`,
      [host.id, host.id],
    );
    const listed = await fetch(`${base}/api/live/streams`, {
      headers: { Authorization: `Bearer ${host.token}` },
    });
    expect(listed.status).toBe(200);
    const listedBody = (await listed.json()) as { streams: Array<{ streamId: string; roomId: string; hostId: string }> };
    expect(listedBody.streams.some((row) => row.streamId === first.rows[0].id && row.roomId === host.id && row.hostId === host.id)).toBe(
      true,
    );

    const stolen = await fetch(`${base}/api/live/${first.rows[0].id}/end`, {
      method: "POST",
      headers: { Authorization: `Bearer ${other.token}` },
    });
    expect(stolen.status).toBe(404);

    const ended = await fetch(`${base}/api/live/${first.rows[0].id}/end`, {
      method: "POST",
      headers: { Authorization: `Bearer ${host.token}` },
    });
    expect(ended.status).toBe(200);
    const endedBody = (await ended.json()) as { ok?: boolean; alreadyEnded?: boolean };
    expect(endedBody.ok).toBe(true);

    const again = await fetch(`${base}/api/live/${first.rows[0].id}/end`, {
      method: "POST",
      headers: { Authorization: `Bearer ${host.token}` },
    });
    expect(again.status).toBe(200);
    const againBody = (await again.json()) as { alreadyEnded?: boolean };
    expect(againBody.alreadyEnded).toBe(true);

    const afterEnd = await fetch(`${base}/api/live/streams`, {
      headers: { Authorization: `Bearer ${host.token}` },
    });
    const afterBody = (await afterEnd.json()) as { streams: Array<{ streamId: string }> };
    expect(afterBody.streams.some((row) => row.streamId === first.rows[0].id)).toBe(false);

    const restart = await getPool().query<{ id: string }>(
      `INSERT INTO live_streams (host_id, room_id, title, status) VALUES ($1, $2, 'LIVE', 'live') RETURNING id`,
      [host.id, host.id],
    );
    expect(restart.rows[0].id).not.toBe(first.rows[0].id);
    const relisted = await fetch(`${base}/api/live/streams`, {
      headers: { Authorization: `Bearer ${host.token}` },
    });
    const relistedBody = (await relisted.json()) as { streams: Array<{ streamId: string; roomId: string }> };
    expect(relistedBody.streams.some((row) => row.streamId === restart.rows[0].id && row.roomId === host.id)).toBe(true);
    expect(relistedBody.streams.filter((row) => row.roomId === host.id)).toHaveLength(1);
  }, 60_000);

  it("PAGE-019 spectator token is subscribe-only and roomId-canonical", async ({ skip }) => {
    if (!db || !base) {
      skip();
      return;
    }

    async function registerUser(stamp: string) {
      const username = `p19${stamp}${Math.random().toString(36).slice(2, 8)}`.slice(0, 12);
      const registered = await json("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          email: `${username}@example.com`,
          username,
          password: "password12",
          ageConfirmed13Plus: true,
          consentVersion: "2026-07-21",
        }),
      });
      expect(registered.status).toBe(201);
      return {
        id: String((registered.body.user as { id?: string } | undefined)?.id ?? ""),
        token: accessTokenFromLogin(registered.body),
      };
    }

    const host = await registerUser("h");
    const viewer = await registerUser("v");
    const blocked = await registerUser("b");

    const unauth = await fetch(`${base}/api/live/token?roomId=${encodeURIComponent(host.id)}&role=spectator`);
    expect(unauth.status).toBe(401);

    const live = await getPool().query<{ id: string }>(
      `INSERT INTO live_streams (host_id, room_id, title, status) VALUES ($1, $2, 'LIVE', 'live') RETURNING id`,
      [host.id, host.id],
    );

    const byStreamId = await fetch(
      `${base}/api/live/token?roomId=${encodeURIComponent(live.rows[0].id)}&role=spectator`,
      { headers: { Authorization: `Bearer ${viewer.token}` } },
    );
    expect(byStreamId.status).toBe(404);

    const asSpectator = await fetch(
      `${base}/api/live/token?roomId=${encodeURIComponent(host.id)}&role=spectator`,
      { headers: { Authorization: `Bearer ${viewer.token}` } },
    );
    expect(asSpectator.status).toBe(503);

    const asHostFromViewer = await fetch(
      `${base}/api/live/token?roomId=${encodeURIComponent(host.id)}&role=host`,
      { headers: { Authorization: `Bearer ${viewer.token}` } },
    );
    expect(asHostFromViewer.status).toBe(403);

    await getPool().query(`INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [
      host.id,
      blocked.id,
    ]);
    const blockedTok = await fetch(
      `${base}/api/live/token?roomId=${encodeURIComponent(host.id)}&role=spectator`,
      { headers: { Authorization: `Bearer ${blocked.token}` } },
    );
    expect(blockedTok.status).toBe(403);

    const spectatorEnd = await fetch(`${base}/api/live/${live.rows[0].id}/end`, {
      method: "POST",
      headers: { Authorization: `Bearer ${viewer.token}` },
    });
    expect(spectatorEnd.status).toBe(404);

    const stillListed = await fetch(`${base}/api/live/streams`, {
      headers: { Authorization: `Bearer ${viewer.token}` },
    });
    const stillBody = (await stillListed.json()) as { streams: Array<{ streamId: string }> };
    expect(stillBody.streams.some((row) => row.streamId === live.rows[0].id)).toBe(true);

    await fetch(`${base}/api/live/${live.rows[0].id}/end`, {
      method: "POST",
      headers: { Authorization: `Bearer ${host.token}` },
    });
    const endedTok = await fetch(
      `${base}/api/live/token?roomId=${encodeURIComponent(host.id)}&role=spectator`,
      { headers: { Authorization: `Bearer ${viewer.token}` } },
    );
    expect(endedTok.status).toBe(404);
  }, 60_000);

  it("PAGE-020 profile GET is server-authoritative for missing and blocked users", async ({ skip }) => {
    if (!db || !base) {
      skip();
      return;
    }

    async function registerUser(stamp: string) {
      const username = `p20${stamp}${Math.random().toString(36).slice(2, 8)}`.slice(0, 12);
      const registered = await json("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          email: `${username}@example.com`,
          username,
          password: "password12",
          ageConfirmed13Plus: true,
          consentVersion: "2026-07-21",
        }),
      });
      expect(registered.status).toBe(201);
      return {
        id: String((registered.body.user as { id?: string } | undefined)?.id ?? ""),
        token: accessTokenFromLogin(registered.body),
      };
    }

    const viewer = await registerUser("v");
    const target = await registerUser("t");
    const missing = await fetch(
      `${base}/api/profiles/00000000-0000-4000-8000-000000000000`,
      { headers: { Authorization: `Bearer ${viewer.token}` } },
    );
    expect(missing.status).toBe(404);

    const visible = await fetch(`${base}/api/profiles/${target.id}`, {
      headers: { Authorization: `Bearer ${viewer.token}` },
    });
    expect(visible.status).toBe(200);
    const visibleBody = (await visible.json()) as { user?: { id?: string; isFollowing?: boolean } };
    expect(visibleBody.user?.id).toBe(target.id);
    expect(visibleBody.user?.isFollowing).toBe(false);

    await getPool().query(`INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [
      target.id,
      viewer.id,
    ]);
    const blocked = await fetch(`${base}/api/profiles/${target.id}`, {
      headers: { Authorization: `Bearer ${viewer.token}` },
    });
    expect(blocked.status).toBe(403);
  }, 60_000);

  it("PAGE-021 camera option lists are static server config", async ({ skip }) => {
    if (!db || !base) {
      skip();
      return;
    }
    const filters = await json("/api/camera-filters");
    expect(filters.status).toBe(200);
    expect(Array.isArray(filters.body.data)).toBe(true);
    expect((filters.body.data as Array<{ id?: string }>).some((row) => row.id === "none")).toBe(true);
    const speeds = await json("/api/speed-options");
    expect(speeds.status).toBe(200);
    expect((speeds.body.data as Array<{ value?: number }>).some((row) => row.value === 1)).toBe(true);
    const stickers = await json("/api/sticker-options");
    expect(stickers.status).toBe(200);
    expect((stickers.body.data as Array<{ emoji?: string }>).length).toBeGreaterThan(0);
  });

  it("PAGE-022 upload session publishes once with hashtags and idempotent retry", async ({ skip }) => {
    if (!db || !base || !token) {
      skip();
      return;
    }
    const me = await json("/api/auth/me");
    const userId = String((me.body.user as { id?: string } | undefined)?.id ?? "");
    expect(userId).toBeTruthy();

    const unauth = await fetch(`${base}/api/uploads/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        idempotencyKey: crypto.randomUUID(),
        kind: "video",
        contentType: "video/mp4",
        byteSize: 8,
      }),
    });
    expect(unauth.status).toBe(401);

    const empty = await json("/api/uploads/sessions", {
      method: "POST",
      body: JSON.stringify({
        idempotencyKey: crypto.randomUUID(),
        kind: "video",
        contentType: "video/mp4",
        byteSize: 0,
      }),
    });
    expect(empty.status).toBe(400);

    const badType = await json("/api/uploads/sessions", {
      method: "POST",
      body: JSON.stringify({
        idempotencyKey: crypto.randomUUID(),
        kind: "video",
        contentType: "application/pdf",
        byteSize: 12,
      }),
    });
    expect(badType.status).toBe(400);

    const legacy = await fetch(`${base}/api/videos/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: new Uint8Array([1, 2, 3]),
    });
    expect([404, 405]).toContain(legacy.status);

    const key = crypto.randomUUID();
    const created = await json("/api/uploads/sessions", {
      method: "POST",
      body: JSON.stringify({
        idempotencyKey: key,
        kind: "video",
        contentType: "video/mp4",
        byteSize: 12,
        filename: "clip.mp4",
        durationMs: 1500,
        width: 720,
        height: 1280,
      }),
    });
    expect(created.status).toBe(201);
    expect(created.body.sessionId).toBe(key);
    expect(created.body).not.toHaveProperty("cdnUrl");
    expect(created.body).not.toHaveProperty("AccessKey");

    const createdAgain = await json("/api/uploads/sessions", {
      method: "POST",
      body: JSON.stringify({
        idempotencyKey: key,
        kind: "video",
        contentType: "video/mp4",
        byteSize: 12,
      }),
    });
    expect(createdAgain.body.sessionId).toBe(key);

    const stored = await getPool().query<{ storage_path: string }>(
      `SELECT storage_path FROM upload_sessions WHERE id = $1`,
      [key],
    );
    expect(stored.rows[0]?.storage_path.startsWith(`videos/${userId}/`)).toBe(true);

    const bytes = await fetch(`${base}/api/uploads/sessions/${key}/bytes`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "video/mp4",
      },
      body: Buffer.from("mp4-bytes-ok"),
    });
    expect(bytes.status).toBe(200);

    const bytesAgain = await fetch(`${base}/api/uploads/sessions/${key}/bytes`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "video/mp4",
      },
      body: Buffer.from("mp4-bytes-ok"),
    });
    expect(bytesAgain.status).toBe(200);

    const published = await json(`/api/uploads/sessions/${key}/publish`, {
      method: "POST",
      body: JSON.stringify({
        caption: "hello #Car",
        extraHashtags: "#Dance",
        privacy: "public",
        soundId: "epidemic-1",
      }),
    });
    expect(published.status).toBe(201);
    expect(published.body.id).toBe(key);
    expect(published.body.processingStatus).toBe("ready");

    const publishedAgain = await json(`/api/uploads/sessions/${key}/publish`, {
      method: "POST",
      body: JSON.stringify({ caption: "hello #Car", extraHashtags: "#Dance" }),
    });
    expect(publishedAgain.status).toBe(201);
    expect(publishedAgain.body.id).toBe(key);

    const videoCount = await getPool().query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM videos WHERE id = $1`, [key]);
    expect(videoCount.rows[0]?.n).toBe(1);
    const row = await getPool().query<{ caption: string; hashtags: string[]; sound_id: string | null; privacy: string }>(
      `SELECT caption, hashtags, sound_id, privacy FROM videos WHERE id = $1`,
      [key],
    );
    expect(row.rows[0]?.caption).toBe("hello #Car");
    expect(row.rows[0]?.hashtags).toEqual(expect.arrayContaining(["car", "dance"]));
    expect(row.rows[0]?.sound_id).toBe("epidemic-1");
    expect(row.rows[0]?.privacy).toBe("public");

    const detail = await json(`/api/videos/${key}`);
    expect(detail.status).toBe(200);
    expect(detail.body.id).toBe(key);

    const hashed = await json("/api/hashtags/Car");
    expect(hashed.status).toBe(200);
    const tagged = (hashed.body.videos as Array<{ id?: string }>) || [];
    expect(tagged.some((item) => item.id === key)).toBe(true);

    const privKey = crypto.randomUUID();
    const privSession = await json("/api/uploads/sessions", {
      method: "POST",
      body: JSON.stringify({
        idempotencyKey: privKey,
        kind: "video",
        contentType: "video/mp4",
        byteSize: 8,
      }),
    });
    expect(privSession.status).toBe(201);
    const privBytes = await fetch(`${base}/api/uploads/sessions/${privKey}/bytes`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "video/mp4" },
      body: Buffer.from("private1"),
    });
    expect(privBytes.status).toBe(200);
    const privPub = await json(`/api/uploads/sessions/${privKey}/publish`, {
      method: "POST",
      body: JSON.stringify({ caption: "#Car secret", privacy: "private" }),
    });
    expect(privPub.status).toBe(201);
    const hashedAfter = await json("/api/hashtags/Car");
    const taggedAfter = (hashedAfter.body.videos as Array<{ id?: string }>) || [];
    expect(taggedAfter.some((item) => item.id === privKey)).toBe(false);

    const storyKey = crypto.randomUUID();
    const storySession = await json("/api/uploads/sessions", {
      method: "POST",
      body: JSON.stringify({
        idempotencyKey: storyKey,
        kind: "story",
        contentType: "image/jpeg",
        byteSize: 6,
      }),
    });
    expect(storySession.status).toBe(201);
    const storyBytes = await fetch(`${base}/api/uploads/sessions/${storyKey}/bytes`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "image/jpeg" },
      body: Buffer.from("jpgjpg"),
    });
    expect(storyBytes.status).toBe(200);
    const storyPub = await json(`/api/uploads/sessions/${storyKey}/publish`, { method: "POST", body: JSON.stringify({}) });
    expect(storyPub.status).toBe(201);
    const stories = await getPool().query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM stories WHERE id = $1`, [storyKey]);
    expect(stories.rows[0]?.n).toBe(1);

    const saves = await getPool().query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM video_saves WHERE video_id = $1`, [key]);
    expect(saves.rows[0]?.n).toBe(0);
  });

  it("PAGE-024 own profile is session-derived, unique views, and private videos are owner-only", async ({ skip }) => {
    if (!db || !base || !token) {
      skip();
      return;
    }
    async function registerUser(stamp: string) {
      const username = `p24${stamp}${Math.random().toString(36).slice(2, 8)}`.slice(0, 12);
      const registered = await json("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          email: `${username}@example.com`,
          username,
          password: "password12",
          ageConfirmed13Plus: true,
          consentVersion: "2026-07-21",
        }),
      });
      expect(registered.status).toBe(201);
      return {
        id: String((registered.body.user as { id?: string } | undefined)?.id ?? ""),
        token: accessTokenFromLogin(registered.body),
      };
    }

    const owner = await registerUser("o");
    const other = await registerUser("x");

    const unauth = await fetch(`${base}/api/profiles/me`);
    expect(unauth.status).toBe(401);

    const me = await fetch(`${base}/api/profiles/me`, {
      headers: { Authorization: `Bearer ${owner.token}` },
    });
    expect(me.status).toBe(200);
    const meBody = (await me.json()) as {
      user?: { id?: string; followerCount?: number; followingCount?: number; likeCount?: number; viewCount?: number };
    };
    expect(meBody.user?.id).toBe(owner.id);
    expect(meBody.user?.followerCount).toBe(0);
    expect(meBody.user?.followingCount).toBe(0);
    expect(meBody.user?.likeCount).toBe(0);
    expect(meBody.user?.viewCount).toBe(0);

    await getPool().query(
      `INSERT INTO videos (user_id, bunny_path, caption, privacy)
       VALUES ($1, 'https://cdn.example/p24-pub.mp4', 'pub', 'public'),
              ($1, 'https://cdn.example/p24-priv.mp4', 'secret', 'private')`,
      [owner.id],
    );
    await getPool().query(`INSERT INTO follows (follower_id, followee_id) VALUES ($1, $2)`, [other.id, owner.id]);
    const pubVideo = await getPool().query<{ id: string }>(
      `SELECT id FROM videos WHERE user_id = $1 AND privacy = 'public' AND bunny_path LIKE '%p24-pub%'`,
      [owner.id],
    );
    await getPool().query(`INSERT INTO video_likes (user_id, video_id) VALUES ($1, $2)`, [other.id, pubVideo.rows[0].id]);

    const counted = await fetch(`${base}/api/profiles/me`, {
      headers: { Authorization: `Bearer ${owner.token}` },
    });
    const countedBody = (await counted.json()) as { user?: { followerCount?: number; likeCount?: number } };
    expect(countedBody.user?.followerCount).toBe(1);
    expect(countedBody.user?.likeCount).toBe(1);

    const selfView = await fetch(`${base}/api/profiles/${owner.id}/view`, {
      method: "POST",
      headers: { Authorization: `Bearer ${owner.token}`, "Content-Type": "application/json" },
      body: "{}",
    });
    expect(selfView.status).toBe(200);
    const selfViewBody = (await selfView.json()) as { uniqueViews?: number; recorded?: boolean };
    expect(selfViewBody.recorded).toBe(false);
    expect(selfViewBody.uniqueViews).toBe(0);

    const otherView = await fetch(`${base}/api/profiles/${owner.id}/view`, {
      method: "POST",
      headers: { Authorization: `Bearer ${other.token}`, "Content-Type": "application/json" },
      body: "{}",
    });
    expect(otherView.status).toBe(200);
    const otherViewBody = (await otherView.json()) as { uniqueViews?: number; recorded?: boolean };
    expect(otherViewBody.recorded).toBe(true);
    expect(otherViewBody.uniqueViews).toBe(1);

    const meViews = await fetch(`${base}/api/profiles/me`, {
      headers: { Authorization: `Bearer ${owner.token}` },
    });
    const meViewsBody = (await meViews.json()) as { user?: { viewCount?: number } };
    expect(meViewsBody.user?.viewCount).toBe(1);

    const ownerPrivate = await fetch(`${base}/api/videos/user/${owner.id}?privacy=private`, {
      headers: { Authorization: `Bearer ${owner.token}` },
    });
    expect(ownerPrivate.status).toBe(200);
    const ownerPrivateBody = (await ownerPrivate.json()) as { videos?: Array<{ id?: string }> };
    expect((ownerPrivateBody.videos ?? []).length).toBe(1);

    const strangerPrivate = await fetch(`${base}/api/videos/user/${owner.id}?privacy=private`, {
      headers: { Authorization: `Bearer ${other.token}` },
    });
    expect(strangerPrivate.status).toBe(403);

    const ownerPublic = await fetch(`${base}/api/videos/user/${owner.id}`, {
      headers: { Authorization: `Bearer ${owner.token}` },
    });
    const ownerPublicBody = (await ownerPublic.json()) as { videos?: Array<{ id?: string }> };
    expect((ownerPublicBody.videos ?? []).every((item) => item.id)).toBe(true);
    expect((ownerPublicBody.videos ?? []).length).toBeGreaterThanOrEqual(1);

    const otherMe = await fetch(`${base}/api/profiles/me`, {
      headers: { Authorization: `Bearer ${other.token}` },
    });
    const otherMeBody = (await otherMe.json()) as { user?: { id?: string } };
    expect(otherMeBody.user?.id).toBe(other.id);
    expect(otherMeBody.user?.id).not.toBe(owner.id);
  });

  it("PAGE-025 public profile is server-authoritative for identity, follow, blocks, and public videos", async ({ skip }) => {
    if (!db || !base) {
      skip();
      return;
    }
    async function registerUser(stamp: string) {
      const username = `p25${stamp}${Math.random().toString(36).slice(2, 8)}`.slice(0, 12);
      const registered = await json("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          email: `${username}@example.com`,
          username,
          password: "password12",
          ageConfirmed13Plus: true,
          consentVersion: "2026-07-21",
        }),
      });
      expect(registered.status).toBe(201);
      return {
        id: String((registered.body.user as { id?: string } | undefined)?.id ?? ""),
        username,
        token: accessTokenFromLogin(registered.body),
      };
    }

    const viewer = await registerUser("v");
    const target = await registerUser("t");

    await getPool().query(
      `INSERT INTO videos (user_id, bunny_path, caption, privacy)
       VALUES ($1, 'https://cdn.example/p25-pub.mp4', 'pub', 'public'),
              ($1, 'https://cdn.example/p25-priv.mp4', 'secret', 'private')`,
      [target.id],
    );

    const byName = await fetch(`${base}/api/profiles/by-username/${target.username}`, {
      headers: { Authorization: `Bearer ${viewer.token}` },
    });
    expect(byName.status).toBe(200);
    const byNameBody = (await byName.json()) as { user?: { id?: string; isFollowing?: boolean; isLive?: boolean } };
    expect(byNameBody.user?.id).toBe(target.id);
    expect(byNameBody.user?.isFollowing).toBe(false);
    expect(byNameBody.user?.isLive).toBe(false);

    const videos = await fetch(`${base}/api/videos/user/${target.id}`, {
      headers: { Authorization: `Bearer ${viewer.token}` },
    });
    expect(videos.status).toBe(200);
    const videosBody = (await videos.json()) as { videos?: Array<{ id?: string; description?: string }> };
    expect((videosBody.videos ?? []).some((row) => row.description === "secret")).toBe(false);
    expect((videosBody.videos ?? []).some((row) => row.description === "pub")).toBe(true);

    const privateAttempt = await fetch(`${base}/api/videos/user/${target.id}?privacy=private`, {
      headers: { Authorization: `Bearer ${viewer.token}` },
    });
    expect(privateAttempt.status).toBe(403);

    const followed = await fetch(`${base}/api/profiles/${target.id}/follow`, {
      method: "POST",
      headers: { Authorization: `Bearer ${viewer.token}`, "Content-Type": "application/json" },
    });
    expect(followed.status).toBe(200);
    const afterFollow = await fetch(`${base}/api/profiles/${target.id}`, {
      headers: { Authorization: `Bearer ${viewer.token}` },
    });
    const afterFollowBody = (await afterFollow.json()) as { user?: { isFollowing?: boolean; followerCount?: number } };
    expect(afterFollowBody.user?.isFollowing).toBe(true);
    expect(afterFollowBody.user?.followerCount).toBe(1);

    const view = await fetch(`${base}/api/profiles/${target.id}/view`, {
      method: "POST",
      headers: { Authorization: `Bearer ${viewer.token}`, "Content-Type": "application/json" },
      body: "{}",
    });
    expect(view.status).toBe(200);

    await getPool().query(`INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2)`, [viewer.id, target.id]);
    const blockedProfile = await fetch(`${base}/api/profiles/${target.id}`, {
      headers: { Authorization: `Bearer ${viewer.token}` },
    });
    expect(blockedProfile.status).toBe(403);
    const blockedVideos = await fetch(`${base}/api/videos/user/${target.id}`, {
      headers: { Authorization: `Bearer ${viewer.token}` },
    });
    expect(blockedVideos.status).toBe(403);
    const blockedFollow = await fetch(`${base}/api/profiles/${target.id}/follow`, {
      method: "POST",
      headers: { Authorization: `Bearer ${viewer.token}`, "Content-Type": "application/json" },
    });
    expect(blockedFollow.status).toBe(403);

    const missing = await fetch(`${base}/api/profiles/by-username/no-such-user-zz`, {
      headers: { Authorization: `Bearer ${viewer.token}` },
    });
    expect(missing.status).toBe(404);
  });

  it("PAGE-026 edit profile is session-derived, field-whitelisted, and unique on username", async ({ skip }) => {
    if (!db || !base) {
      skip();
      return;
    }
    async function registerUser(stamp: string) {
      const username = `p26${stamp}${Math.random().toString(36).slice(2, 8)}`.slice(0, 12);
      const registered = await json("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          email: `${username}@example.com`,
          username,
          password: "password12",
          ageConfirmed13Plus: true,
          consentVersion: "2026-07-21",
        }),
      });
      expect(registered.status).toBe(201);
      return {
        id: String((registered.body.user as { id?: string } | undefined)?.id ?? ""),
        token: accessTokenFromLogin(registered.body),
        username,
      };
    }

    const owner = await registerUser("o");
    const other = await registerUser("x");

    const unauth = await fetch(`${base}/api/profiles/me`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bio: "nope" }) });
    expect(unauth.status).toBe(401);

    const otherUserPatch = await fetch(`${base}/api/profiles/${other.id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${owner.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ bio: "hijack" }),
    });
    expect(otherUserPatch.status).toBe(404);

    const mass = await fetch(`${base}/api/profiles/me`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${owner.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ bio: "ok", isAdmin: true, avatarUrl: "https://evil.example/a.jpg" }),
    });
    expect(mass.status).toBe(400);

    const saved = await fetch(`${base}/api/profiles/me`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${owner.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        username: owner.username,
        displayName: "Display ✨",
        bio: "Bio line",
        website: "https://elix.example",
        instagram: "@elix",
        youtube: "",
        tiktok: "",
      }),
    });
    expect(saved.status).toBe(200);
    const savedBody = (await saved.json()) as {
      user?: { id?: string; displayName?: string; bio?: string; website?: string; instagram?: string; isAdmin?: boolean };
    };
    expect(savedBody.user?.id).toBe(owner.id);
    expect(savedBody.user?.displayName).toBe("Display ✨");
    expect(savedBody.user?.bio).toBe("Bio line");
    expect(savedBody.user?.website).toBe("https://elix.example");
    expect(savedBody.user?.instagram).toBe("@elix");
    expect(savedBody.user?.isAdmin).toBeUndefined();

    const publicAfter = await fetch(`${base}/api/profiles/${owner.id}`, {
      headers: { Authorization: `Bearer ${other.token}` },
    });
    const publicAfterBody = (await publicAfter.json()) as { user?: { displayName?: string; bio?: string; website?: unknown } };
    expect(publicAfterBody.user?.displayName).toBe("Display ✨");
    expect(publicAfterBody.user?.bio).toBe("Bio line");
    expect(publicAfterBody.user?.website).toBeUndefined();

    const taken = await fetch(`${base}/api/profiles/me`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${other.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ username: owner.username }),
    });
    expect(taken.status).toBe(409);

    const invalidUser = await fetch(`${base}/api/profiles/me`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${owner.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ username: "ab" }),
    });
    expect(invalidUser.status).toBe(400);

    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 1, 2, 3, 4, 5, 6, 7]);
    const form = new FormData();
    form.append("file", new Blob([jpeg], { type: "image/jpeg" }), "avatar.jpg");
    const avatar = await fetch(`${base}/api/profiles/me/avatar`, {
      method: "POST",
      headers: { Authorization: `Bearer ${owner.token}` },
      body: form,
    });
    expect(avatar.status).toBe(200);
    const avatarBody = (await avatar.json()) as { avatarUrl?: string };
    expect(avatarBody.avatarUrl).toMatch(new RegExp(`avatars/${owner.id}/`));

    const me = await fetch(`${base}/api/profiles/me`, { headers: { Authorization: `Bearer ${owner.token}` } });
    const meBody = (await me.json()) as { user?: { avatarUrl?: string } };
    expect(meBody.user?.avatarUrl).toBe(avatarBody.avatarUrl);

    const badFile = new FormData();
    badFile.append("file", new Blob(["not-an-image"], { type: "text/plain" }), "x.txt");
    const badAvatar = await fetch(`${base}/api/profiles/me/avatar`, {
      method: "POST",
      headers: { Authorization: `Bearer ${owner.token}` },
      body: badFile,
    });
    expect(badAvatar.status).toBe(400);

    const dbUser = await getPool().query<{ is_admin: boolean; email: string }>(
      `SELECT is_admin, email FROM users WHERE id = $1`,
      [owner.id],
    );
    expect(dbUser.rows[0]?.is_admin).toBe(false);
  });

  it("PAGE-027 followers list is access-gated, newest-first, and follow-back is server-owned", async ({ skip }) => {
    if (!db || !base) {
      skip();
      return;
    }
    async function registerUser(stamp: string) {
      const username = `p27${stamp}${Math.random().toString(36).slice(2, 8)}`.slice(0, 12);
      const registered = await json("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          email: `${username}@example.com`,
          username,
          password: "password12",
          ageConfirmed13Plus: true,
          consentVersion: "2026-07-21",
        }),
      });
      expect(registered.status).toBe(201);
      return {
        id: String((registered.body.user as { id?: string } | undefined)?.id ?? ""),
        token: accessTokenFromLogin(registered.body),
        username,
      };
    }

    const owner = await registerUser("o");
    const firstFan = await registerUser("a");
    const secondFan = await registerUser("b");
    const stranger = await registerUser("s");

    const empty = await fetch(`${base}/api/profiles/${owner.id}/followers`, {
      headers: { Authorization: `Bearer ${owner.token}` },
    });
    expect(empty.status).toBe(200);
    const emptyBody = (await empty.json()) as { users?: unknown[] };
    expect(emptyBody.users).toEqual([]);

    const followedA = await fetch(`${base}/api/profiles/${owner.id}/follow`, {
      method: "POST",
      headers: { Authorization: `Bearer ${firstFan.token}`, "Content-Type": "application/json" },
    });
    expect(followedA.status).toBe(200);
    const followedB = await fetch(`${base}/api/profiles/${owner.id}/follow`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secondFan.token}`, "Content-Type": "application/json" },
    });
    expect(followedB.status).toBe(200);

    const listed = await fetch(`${base}/api/profiles/${owner.id}/followers`, {
      headers: { Authorization: `Bearer ${stranger.token}` },
    });
    expect(listed.status).toBe(200);
    const listedBody = (await listed.json()) as { users?: Array<{ id?: string; isFollowing?: boolean }> };
    expect((listedBody.users ?? []).map((row) => row.id)).toEqual([secondFan.id, firstFan.id]);
    expect(listedBody.users?.every((row) => row.isFollowing === false)).toBe(true);

    const followBack = await fetch(`${base}/api/profiles/${firstFan.id}/follow`, {
      method: "POST",
      headers: { Authorization: `Bearer ${stranger.token}`, "Content-Type": "application/json" },
    });
    expect(followBack.status).toBe(200);
    const afterFollow = await fetch(`${base}/api/profiles/${owner.id}/followers`, {
      headers: { Authorization: `Bearer ${stranger.token}` },
    });
    const afterFollowBody = (await afterFollow.json()) as { users?: Array<{ id?: string; isFollowing?: boolean }> };
    expect(afterFollowBody.users?.find((row) => row.id === firstFan.id)?.isFollowing).toBe(true);
    expect(afterFollowBody.users?.find((row) => row.id === secondFan.id)?.isFollowing).toBe(false);

    await getPool().query(`INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2)`, [stranger.id, owner.id]);
    const blocked = await fetch(`${base}/api/profiles/${owner.id}/followers`, {
      headers: { Authorization: `Bearer ${stranger.token}` },
    });
    expect(blocked.status).toBe(403);

    const missing = await fetch(`${base}/api/profiles/${crypto.randomUUID()}/followers`, {
      headers: { Authorization: `Bearer ${owner.token}` },
    });
    expect(missing.status).toBe(404);
  });

  it("PAGE-028 following list is access-gated, newest-first, and unfollow is server-owned", async ({ skip }) => {
    if (!db || !base) {
      skip();
      return;
    }
    async function registerUser(stamp: string) {
      const username = `p28${stamp}${Math.random().toString(36).slice(2, 8)}`.slice(0, 12);
      const registered = await json("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          email: `${username}@example.com`,
          username,
          password: "password12",
          ageConfirmed13Plus: true,
          consentVersion: "2026-07-21",
        }),
      });
      expect(registered.status).toBe(201);
      return {
        id: String((registered.body.user as { id?: string } | undefined)?.id ?? ""),
        token: accessTokenFromLogin(registered.body),
        username,
      };
    }

    const owner = await registerUser("o");
    const firstFollowee = await registerUser("a");
    const secondFollowee = await registerUser("b");
    const stranger = await registerUser("s");

    const empty = await fetch(`${base}/api/profiles/${owner.id}/following`, {
      headers: { Authorization: `Bearer ${owner.token}` },
    });
    expect(empty.status).toBe(200);
    const emptyBody = (await empty.json()) as { users?: unknown[] };
    expect(emptyBody.users).toEqual([]);

    const followedA = await fetch(`${base}/api/profiles/${firstFollowee.id}/follow`, {
      method: "POST",
      headers: { Authorization: `Bearer ${owner.token}`, "Content-Type": "application/json" },
    });
    expect(followedA.status).toBe(200);
    const followedB = await fetch(`${base}/api/profiles/${secondFollowee.id}/follow`, {
      method: "POST",
      headers: { Authorization: `Bearer ${owner.token}`, "Content-Type": "application/json" },
    });
    expect(followedB.status).toBe(200);

    const listed = await fetch(`${base}/api/profiles/${owner.id}/following`, {
      headers: { Authorization: `Bearer ${stranger.token}` },
    });
    expect(listed.status).toBe(200);
    const listedBody = (await listed.json()) as { users?: Array<{ id?: string; isFollowing?: boolean }> };
    expect((listedBody.users ?? []).map((row) => row.id)).toEqual([secondFollowee.id, firstFollowee.id]);
    expect(listedBody.users?.every((row) => row.isFollowing === false)).toBe(true);

    const ownListed = await fetch(`${base}/api/profiles/${owner.username}/following`, {
      headers: { Authorization: `Bearer ${owner.token}` },
    });
    expect(ownListed.status).toBe(200);
    const ownBody = (await ownListed.json()) as { users?: Array<{ id?: string; isFollowing?: boolean }> };
    expect((ownBody.users ?? []).map((row) => row.id)).toEqual([secondFollowee.id, firstFollowee.id]);
    expect(ownBody.users?.every((row) => row.isFollowing === true)).toBe(true);

    const unauth = await fetch(`${base}/api/profiles/${owner.id}/following`);
    expect(unauth.status).toBe(200);

    const followFirst = await fetch(`${base}/api/profiles/${firstFollowee.id}/follow`, {
      method: "POST",
      headers: { Authorization: `Bearer ${stranger.token}`, "Content-Type": "application/json" },
    });
    expect(followFirst.status).toBe(200);
    const afterFollow = await fetch(`${base}/api/profiles/${owner.id}/following`, {
      headers: { Authorization: `Bearer ${stranger.token}` },
    });
    const afterFollowBody = (await afterFollow.json()) as { users?: Array<{ id?: string; isFollowing?: boolean }> };
    expect(afterFollowBody.users?.find((row) => row.id === firstFollowee.id)?.isFollowing).toBe(true);
    expect(afterFollowBody.users?.find((row) => row.id === secondFollowee.id)?.isFollowing).toBe(false);

    const unfollowed = await fetch(`${base}/api/profiles/${firstFollowee.id}/unfollow`, {
      method: "POST",
      headers: { Authorization: `Bearer ${owner.token}`, "Content-Type": "application/json" },
    });
    expect(unfollowed.status).toBe(200);
    const afterUnfollow = await fetch(`${base}/api/profiles/${owner.id}/following`, {
      headers: { Authorization: `Bearer ${owner.token}` },
    });
    const afterUnfollowBody = (await afterUnfollow.json()) as { users?: Array<{ id?: string }> };
    expect((afterUnfollowBody.users ?? []).map((row) => row.id)).toEqual([secondFollowee.id]);

    await getPool().query(`INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2)`, [stranger.id, owner.id]);
    const blocked = await fetch(`${base}/api/profiles/${owner.id}/following`, {
      headers: { Authorization: `Bearer ${stranger.token}` },
    });
    expect(blocked.status).toBe(403);

    const missing = await fetch(`${base}/api/profiles/${crypto.randomUUID()}/following`, {
      headers: { Authorization: `Bearer ${owner.token}` },
    });
    expect(missing.status).toBe(404);
  });

  it("PAGE-030 inbox threads, activity, gifts, and live-share are viewer-owned", async ({ skip }) => {
    if (!db || !base) {
      skip();
      return;
    }
    async function registerUser(stamp: string) {
      const username = `p30${stamp}${Math.random().toString(36).slice(2, 8)}`.slice(0, 12);
      const registered = await json("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          email: `${username}@example.com`,
          username,
          password: "password12",
          ageConfirmed13Plus: true,
          consentVersion: "2026-07-21",
        }),
      });
      expect(registered.status).toBe(201);
      return {
        id: String((registered.body.user as { id?: string } | undefined)?.id ?? ""),
        token: accessTokenFromLogin(registered.body),
        username,
      };
    }

    const unauth = await fetch(`${base}/api/inbox/threads`);
    expect(unauth.status).toBe(401);
    const unauthActivity = await fetch(`${base}/api/activity`);
    expect(unauthActivity.status).toBe(401);
    const unauthShares = await fetch(`${base}/api/inbox/live-share-requests`);
    expect(unauthShares.status).toBe(401);

    const owner = await registerUser("o");
    const peer = await registerUser("p");
    const stranger = await registerUser("s");

    const opened = await fetch(`${base}/api/inbox/threads`, {
      method: "POST",
      headers: { Authorization: `Bearer ${owner.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ userId: peer.id }),
    });
    expect([200, 201]).toContain(opened.status);
    const openedBody = (await opened.json()) as { id?: string };
    const threadId = String(openedBody.id ?? "");
    expect(threadId).toBeTruthy();

    const sent = await fetch(`${base}/api/inbox/threads/${threadId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${peer.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ body: "hello inbox" }),
    });
    expect(sent.status).toBe(201);

    const listed = await fetch(`${base}/api/inbox/threads`, {
      headers: { Authorization: `Bearer ${owner.token}` },
    });
    expect(listed.status).toBe(200);
    const listedBody = (await listed.json()) as {
      threads?: Array<{ id?: string; unread?: boolean; unreadCount?: number; lastMessage?: string }>;
    };
    expect(listedBody.threads?.[0]?.id).toBe(threadId);
    expect(listedBody.threads?.[0]?.unread).toBe(true);
    expect(listedBody.threads?.[0]?.unreadCount).toBe(1);
    expect(listedBody.threads?.[0]?.lastMessage).toBe("hello inbox");

    const strangerList = await fetch(`${base}/api/inbox/threads`, {
      headers: { Authorization: `Bearer ${stranger.token}` },
    });
    const strangerBody = (await strangerList.json()) as { threads?: unknown[] };
    expect(strangerBody.threads).toEqual([]);

    const deleted = await fetch(`${base}/api/inbox/threads/${threadId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${owner.token}` },
    });
    expect(deleted.status).toBe(200);
    const afterDelete = await fetch(`${base}/api/inbox/threads`, {
      headers: { Authorization: `Bearer ${owner.token}` },
    });
    const afterDeleteBody = (await afterDelete.json()) as { threads?: unknown[] };
    expect(afterDeleteBody.threads).toEqual([]);

    const video = await getPool().query<{ id: string }>(
      `INSERT INTO videos (user_id, bunny_path, caption, privacy) VALUES ($1, 'https://cdn.example/p30.mp4', 'clip', 'public') RETURNING id`,
      [owner.id],
    );
    const videoId = video.rows[0].id;
    await getPool().query(`INSERT INTO video_likes (user_id, video_id) VALUES ($1, $2)`, [peer.id, videoId]);
    await getPool().query(`INSERT INTO video_saves (user_id, video_id) VALUES ($1, $2)`, [peer.id, videoId]);
    await getPool().query(`INSERT INTO comments (video_id, user_id, body) VALUES ($1, $2, 'nice')`, [videoId, peer.id]);
    const otherVideo = await getPool().query<{ id: string }>(
      `INSERT INTO videos (user_id, bunny_path, caption, privacy) VALUES ($1, 'https://cdn.example/p30b.mp4', 'other', 'public') RETURNING id`,
      [peer.id],
    );
    await getPool().query(`INSERT INTO comments (video_id, user_id, body) VALUES ($1, $2, $3)`, [
      otherVideo.rows[0].id,
      stranger.id,
      `@${owner.username} hello`,
    ]);

    const activity = await fetch(`${base}/api/activity`, {
      headers: { Authorization: `Bearer ${owner.token}` },
    });
    expect(activity.status).toBe(200);
    const activityBody = (await activity.json()) as {
      total?: number;
      items?: Array<{ kind?: string; actorUserId?: string; videoId?: string }>;
    };
    expect(activityBody.total).toBe(4);
    const kinds = (activityBody.items ?? []).map((row) => row.kind).sort();
    expect(kinds).toEqual(["comment", "like", "mention", "save"]);
    expect(activityBody.items?.every((row) => row.actorUserId !== owner.id)).toBe(true);

    await getPool().query(
      `INSERT INTO gift_transactions (sender_id, recipient_id, gift_id, coin_cost, bucket, idempotency_key)
       VALUES ($1, $2, 'rose', 1, 'paid', $3), ($1, $2, 'heart', 10, 'test', $4)`,
      [peer.id, owner.id, crypto.randomUUID(), crypto.randomUUID()],
    );
    const notices = await fetch(`${base}/api/inbox/notices`, {
      headers: { Authorization: `Bearer ${owner.token}` },
    });
    expect(notices.status).toBe(200);
    const noticesBody = (await notices.json()) as { gifts?: Array<{ title?: string; body?: string }> };
    expect(noticesBody.gifts).toHaveLength(1);
    expect(noticesBody.gifts?.[0]?.body).toBe("Rose");

    await getPool().query(
      `INSERT INTO live_share_inbox (recipient_id, sharer_id, stream_key, host_user_id, host_name, sharer_name)
       VALUES ($1, $2, $3, $2, 'Host', 'Sharer')`,
      [owner.id, peer.id, peer.id],
    );
    const shares = await fetch(`${base}/api/inbox/live-share-requests`, {
      headers: { Authorization: `Bearer ${owner.token}` },
    });
    expect(shares.status).toBe(200);
    const sharesBody = (await shares.json()) as { items?: Array<{ sharerId?: string }> };
    expect(sharesBody.items?.[0]?.sharerId).toBe(peer.id);

    const followed = await fetch(`${base}/api/profiles/${peer.id}/follow`, {
      method: "POST",
      headers: { Authorization: `Bearer ${owner.token}`, "Content-Type": "application/json" },
    });
    expect(followed.status).toBe(200);
    const sharesAfterFollow = await fetch(`${base}/api/inbox/live-share-requests`, {
      headers: { Authorization: `Bearer ${owner.token}` },
    });
    const sharesAfterBody = (await sharesAfterFollow.json()) as { items?: unknown[] };
    expect(sharesAfterBody.items).toEqual([]);

    const chatDuplicate = await fetch(`${base}/api/chat/threads`, {
      headers: { Authorization: `Bearer ${owner.token}` },
    });
    expect(chatDuplicate.status).toBe(404);
  });

  it("PAGE-031 activity overlay source returns real actors, not stubs", async ({ skip }) => {
    if (!db || !base) {
      skip();
      return;
    }
    async function registerUser(stamp: string) {
      const username = `p31${stamp}${Math.random().toString(36).slice(2, 8)}`.slice(0, 12);
      const registered = await json("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          email: `${username}@example.com`,
          username,
          password: "password12",
          ageConfirmed13Plus: true,
          consentVersion: "2026-07-21",
        }),
      });
      expect(registered.status).toBe(201);
      return {
        id: String((registered.body.user as { id?: string } | undefined)?.id ?? ""),
        token: accessTokenFromLogin(registered.body),
        username,
      };
    }

    const unauth = await fetch(`${base}/api/activity`);
    expect(unauth.status).toBe(401);

    const owner = await registerUser("o");
    const peer = await registerUser("p");
    const stranger = await registerUser("s");

    const video = await getPool().query<{ id: string }>(
      `INSERT INTO videos (user_id, bunny_path, caption, privacy) VALUES ($1, 'https://cdn.example/p31.mp4', 'clip', 'public') RETURNING id`,
      [owner.id],
    );
    const videoId = video.rows[0].id;
    await getPool().query(`INSERT INTO video_likes (user_id, video_id) VALUES ($1, $2)`, [peer.id, videoId]);
    await getPool().query(`INSERT INTO comments (video_id, user_id, body) VALUES ($1, $2, 'nice work')`, [videoId, peer.id]);

    const activity = await fetch(`${base}/api/activity`, {
      headers: { Authorization: `Bearer ${owner.token}` },
    });
    expect(activity.status).toBe(200);
    const activityBody = (await activity.json()) as {
      total?: number;
      items?: Array<{
        kind?: string;
        actorUserId?: string;
        actorUsername?: string;
        actorDisplayName?: string | null;
        videoId?: string;
        snippet?: string | null;
      }>;
    };
    expect(activityBody.total).toBe(2);
    const actors = activityBody.items ?? [];
    expect(actors).toHaveLength(2);
    expect(actors.every((row) => row.actorUserId === peer.id)).toBe(true);
    expect(actors.every((row) => row.actorUsername === peer.username)).toBe(true);
    expect(actors.every((row) => row.actorUsername !== "user")).toBe(true);
    expect(actors.every((row) => (row.actorDisplayName || row.actorUsername) !== "user")).toBe(true);
    expect(actors.every((row) => row.videoId === videoId)).toBe(true);
    expect(actors.some((row) => row.kind === "comment" && row.snippet === "nice work")).toBe(true);

    const strangerList = await fetch(`${base}/api/activity`, {
      headers: { Authorization: `Bearer ${stranger.token}` },
    });
    const strangerBody = (await strangerList.json()) as { items?: unknown[]; total?: number };
    expect(strangerBody.items).toEqual([]);
    expect(strangerBody.total).toBe(0);
  });

  it("PAGE-032 alerts list is viewer-owned system/live rows and marks those ids read", async ({ skip }) => {
    if (!db || !base) {
      skip();
      return;
    }
    async function registerUser(stamp: string) {
      const username = `p32${stamp}${Math.random().toString(36).slice(2, 8)}`.slice(0, 12);
      const registered = await json("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          email: `${username}@example.com`,
          username,
          password: "password12",
          ageConfirmed13Plus: true,
          consentVersion: "2026-07-21",
        }),
      });
      expect(registered.status).toBe(201);
      return {
        id: String((registered.body.user as { id?: string } | undefined)?.id ?? ""),
        token: accessTokenFromLogin(registered.body),
        username,
      };
    }

    const unauth = await fetch(`${base}/api/notifications`);
    expect(unauth.status).toBe(401);

    const owner = await registerUser("o");
    const peer = await registerUser("p");
    const stranger = await registerUser("s");
    const roomId = `p32-${owner.id.slice(0, 8)}`;

    await getPool().query(
      `INSERT INTO notifications (user_id, kind, payload) VALUES
         ($1, 'system', $2::jsonb),
         ($1, 'follow', '{"title":"New follower"}'::jsonb),
         ($1, 'like', '{"title":"Liked your video"}'::jsonb),
         ($1, 'live_started', $3::jsonb),
         ($1, 'live_started', $4::jsonb)`,
      [
        owner.id,
        JSON.stringify({ title: "System notice", body: "Hello alerts" }),
        JSON.stringify({ title: `${peer.username} is live`, hostUserId: peer.id, roomId }),
        JSON.stringify({ title: "Ended host is live", hostUserId: stranger.id, roomId: `ended-${stranger.id.slice(0, 8)}` }),
      ],
    );
    await getPool().query(`INSERT INTO live_streams (host_id, room_id, title, status) VALUES ($1, $2, 'LIVE', 'live')`, [
      peer.id,
      roomId,
    ]);

    const listed = await fetch(`${base}/api/notifications`, {
      headers: { Authorization: `Bearer ${owner.token}` },
    });
    expect(listed.status).toBe(200);
    const listedBody = (await listed.json()) as {
      total?: number;
      unreadIds?: string[];
      items?: Array<{ kind?: string; title?: string; actionUrl?: string | null }>;
    };
    expect(listedBody.total).toBe(2);
    expect(listedBody.items?.map((row) => row.kind).sort()).toEqual(["live_started", "system"]);
    expect(listedBody.items?.some((row) => row.title === "System notice")).toBe(true);
    expect(listedBody.items?.some((row) => row.actionUrl === `/watch/${roomId}`)).toBe(true);
    expect(listedBody.items?.some((row) => row.title === "Ended host is live")).toBe(false);
    expect(listedBody.items?.some((row) => row.title === "New follower")).toBe(false);
    expect((listedBody.unreadIds ?? []).length).toBe(2);

    const strangerList = await fetch(`${base}/api/notifications`, {
      headers: { Authorization: `Bearer ${stranger.token}` },
    });
    const strangerBody = (await strangerList.json()) as { items?: unknown[]; total?: number };
    expect(strangerBody.items).toEqual([]);
    expect(strangerBody.total).toBe(0);

    const read = await fetch(`${base}/api/notifications/read`, {
      method: "POST",
      headers: { Authorization: `Bearer ${owner.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ids: listedBody.unreadIds }),
    });
    expect(read.status).toBe(200);
    const after = await getPool().query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM notifications WHERE user_id = $1 AND kind IN ('system', 'live_started') AND read_at IS NULL`,
      [owner.id],
    );
    expect(Number(after.rows[0]?.n)).toBe(1);
  });

  it("PAGE-033 chat thread membership, persist, read, block, and idempotency are server-owned", async ({ skip }) => {
    if (!db || !base) {
      skip();
      return;
    }
    async function registerUser(stamp: string) {
      const username = `p33${stamp}${Math.random().toString(36).slice(2, 8)}`.slice(0, 12);
      const registered = await json("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          email: `${username}@example.com`,
          username,
          password: "password12",
          ageConfirmed13Plus: true,
          consentVersion: "2026-07-21",
        }),
      });
      expect(registered.status).toBe(201);
      return {
        id: String((registered.body.user as { id?: string } | undefined)?.id ?? ""),
        token: accessTokenFromLogin(registered.body),
        username,
      };
    }

    const unauth = await fetch(`${base}/api/inbox/threads/${crypto.randomUUID()}/messages`);
    expect(unauth.status).toBe(401);

    const owner = await registerUser("o");
    const peer = await registerUser("p");
    const stranger = await registerUser("s");

    const opened = await fetch(`${base}/api/inbox/threads`, {
      method: "POST",
      headers: { Authorization: `Bearer ${owner.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ userId: peer.id }),
    });
    expect([200, 201]).toContain(opened.status);
    const threadId = String(((await opened.json()) as { id?: string }).id ?? "");
    expect(threadId).toBeTruthy();

    const missing = await fetch(`${base}/api/inbox/threads/not-a-uuid/messages`, {
      headers: { Authorization: `Bearer ${owner.token}` },
    });
    expect(missing.status).toBe(404);

    const strangerMeta = await fetch(`${base}/api/inbox/threads/${threadId}`, {
      headers: { Authorization: `Bearer ${stranger.token}` },
    });
    expect(strangerMeta.status).toBe(403);
    const strangerHistory = await fetch(`${base}/api/inbox/threads/${threadId}/messages`, {
      headers: { Authorization: `Bearer ${stranger.token}` },
    });
    expect(strangerHistory.status).toBe(403);
    const strangerSend = await fetch(`${base}/api/inbox/threads/${threadId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${stranger.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ body: "nope", senderId: owner.id }),
    });
    expect(strangerSend.status).toBe(403);

    const empty = await fetch(`${base}/api/inbox/threads/${threadId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${peer.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ body: "   " }),
    });
    expect(empty.status).toBe(400);
    const tooLong = await fetch(`${base}/api/inbox/threads/${threadId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${peer.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ body: "x".repeat(2001) }),
    });
    expect(tooLong.status).toBe(400);

    const sent = await fetch(`${base}/api/inbox/threads/${threadId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${peer.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ body: "message A1", clientRequestId: "req-a1" }),
    });
    expect(sent.status).toBe(201);
    const sentBody = (await sent.json()) as { message?: { id?: string; senderId?: string; body?: string; threadId?: string } };
    expect(sentBody.message?.threadId).toBe(threadId);
    expect(sentBody.message?.senderId).toBe(peer.id);
    expect(sentBody.message?.body).toBe("message A1");
    const messageId = String(sentBody.message?.id ?? "");
    expect(messageId).toBeTruthy();

    const replay = await fetch(`${base}/api/inbox/threads/${threadId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${peer.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ body: "message A1", clientRequestId: "req-a1" }),
    });
    expect([200, 201]).toContain(replay.status);
    const replayBody = (await replay.json()) as { message?: { id?: string } };
    expect(replayBody.message?.id).toBe(messageId);
    const countA = await getPool().query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM chat_messages WHERE thread_id = $1 AND body = 'message A1'`,
      [threadId],
    );
    expect(Number(countA.rows[0]?.n)).toBe(1);

    const historyBeforeRead = await fetch(`${base}/api/inbox/threads/${threadId}/messages`, {
      headers: { Authorization: `Bearer ${owner.token}` },
    });
    expect(historyBeforeRead.status).toBe(200);
    const historyBeforeReadBody = (await historyBeforeRead.json()) as {
      messages?: Array<{ id?: string; senderId?: string; body?: string }>;
    };
    expect(historyBeforeReadBody.messages?.map((row) => row.id)).toEqual([messageId]);
    expect(historyBeforeReadBody.messages?.[0]?.senderId).toBe(peer.id);

    const listedUnread = await fetch(`${base}/api/inbox/threads`, {
      headers: { Authorization: `Bearer ${owner.token}` },
    });
    const listedUnreadBody = (await listedUnread.json()) as {
      threads?: Array<{ id?: string; unread?: boolean; unreadCount?: number; lastMessage?: string }>;
    };
    expect(listedUnreadBody.threads?.[0]?.id).toBe(threadId);
    expect(listedUnreadBody.threads?.[0]?.unread).toBe(true);
    expect(listedUnreadBody.threads?.[0]?.unreadCount).toBe(1);
    expect(listedUnreadBody.threads?.[0]?.lastMessage).toBe("message A1");

    const marked = await fetch(`${base}/api/inbox/threads/${threadId}/read`, {
      method: "POST",
      headers: { Authorization: `Bearer ${owner.token}` },
    });
    expect(marked.status).toBe(200);
    const listedRead = await fetch(`${base}/api/inbox/threads`, {
      headers: { Authorization: `Bearer ${owner.token}` },
    });
    const listedReadBody = (await listedRead.json()) as {
      threads?: Array<{ unread?: boolean; unreadCount?: number }>;
    };
    expect(listedReadBody.threads?.[0]?.unread).toBe(false);
    expect(listedReadBody.threads?.[0]?.unreadCount).toBe(0);

    for (const text of ["1", "2", "3", "4", "5"]) {
      const burst = await fetch(`${base}/api/inbox/threads/${threadId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${owner.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ body: text, clientRequestId: `burst-${text}` }),
      });
      expect(burst.status).toBe(201);
    }
    const historyBurst = await fetch(`${base}/api/inbox/threads/${threadId}/messages`, {
      headers: { Authorization: `Bearer ${peer.token}` },
    });
    const historyBurstBody = (await historyBurst.json()) as { messages?: Array<{ body?: string; senderId?: string }> };
    expect(historyBurstBody.messages?.map((row) => row.body)).toEqual(["message A1", "1", "2", "3", "4", "5"]);
    expect(historyBurstBody.messages?.slice(1).every((row) => row.senderId === owner.id)).toBe(true);

    await getPool().query(`INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2)`, [owner.id, peer.id]);
    const blockedSend = await fetch(`${base}/api/inbox/threads/${threadId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${peer.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ body: "after block" }),
    });
    expect(blockedSend.status).toBe(403);
    const stillReadable = await fetch(`${base}/api/inbox/threads/${threadId}/messages`, {
      headers: { Authorization: `Bearer ${peer.token}` },
    });
    expect(stillReadable.status).toBe(200);
    const stillReadableBody = (await stillReadable.json()) as { messages?: Array<{ body?: string }> };
    expect(stillReadableBody.messages?.some((row) => row.body === "after block")).toBe(false);

    const persisted = await getPool().query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM chat_messages WHERE thread_id = $1`,
      [threadId],
    );
    expect(Number(persisted.rows[0]?.n)).toBe(6);
  });

  it("PAGE-034 video call is WS-owned, blocked server-side, and has no REST start", async ({ skip }) => {
    if (!db || !base || !server) {
      skip();
      return;
    }
    const { attachWebSocket } = await import("./websocket/index.js");
    const { WebSocket } = await import("ws");
    attachWebSocket(server);

    async function registerUser(stamp: string) {
      const username = `p34${stamp}${Math.random().toString(36).slice(2, 8)}`.slice(0, 12);
      const registered = await json("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          email: `${username}@example.com`,
          username,
          password: "password12",
          ageConfirmed13Plus: true,
          consentVersion: "2026-07-21",
        }),
      });
      expect(registered.status).toBe(201);
      return {
        id: String((registered.body.user as { id?: string } | undefined)?.id ?? ""),
        token: accessTokenFromLogin(registered.body),
        username,
      };
    }

    function openCallSocket(userToken: string) {
      return new Promise<{
        ws: InstanceType<typeof WebSocket>;
        events: Array<{ event: string; data: unknown }>;
      }>((resolve, reject) => {
        const ws = new WebSocket(`${base.replace("http", "ws")}/live/__feed__?token=${encodeURIComponent(userToken)}`);
        const events: Array<{ event: string; data: unknown }> = [];
        const timer = setTimeout(() => reject(new Error("call socket connect timeout")), 8000);
        ws.on("message", (raw) => {
          const parsed = JSON.parse(String(raw)) as { event?: string; data?: unknown };
          if (typeof parsed.event === "string") events.push({ event: parsed.event, data: parsed.data });
          if (parsed.event === "connected") {
            clearTimeout(timer);
            resolve({ ws, events });
          }
        });
        ws.on("error", (err: unknown) => {
          clearTimeout(timer);
          reject(err);
        });
      });
    }

    const missingStart = await fetch(`${base}/api/calls/start`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ userId: crypto.randomUUID() }),
    });
    expect(missingStart.status).toBe(404);

    const unauthToken = await fetch(`${base}/api/calls/${crypto.randomUUID()}/token`, { method: "POST" });
    expect(unauthToken.status).toBe(401);

    const caller = await registerUser("a");
    const callee = await registerUser("b");
    const stranger = await registerUser("s");
    const opened = await fetch(`${base}/api/inbox/threads`, {
      method: "POST",
      headers: { Authorization: `Bearer ${caller.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ userId: callee.id }),
    });
    expect([200, 201]).toContain(opened.status);
    const threadId = String(((await opened.json()) as { id?: string }).id ?? "");
    expect(threadId).toBeTruthy();

    const callerSock = await openCallSocket(caller.token);
    const calleeSock = await openCallSocket(callee.token);
    callerSock.ws.send(
      JSON.stringify({
        event: "call_invite",
        data: { calleeId: callee.id, threadId },
        timestamp: new Date().toISOString(),
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 400));
    const callerInvite = callerSock.events.find((row) => row.event === "call_invite");
    const calleeInvite = calleeSock.events.find((row) => row.event === "call_invite");
    expect(callerInvite).toBeTruthy();
    expect(calleeInvite).toBeTruthy();
    const invite = callerInvite?.data as { callId?: string; roomName?: string; callerId?: string; threadId?: string };
    expect(invite.callerId).toBe(caller.id);
    expect(invite.threadId).toBe(threadId);
    expect(invite.roomName).toMatch(/^call_/);
    const callId = String(invite.callId ?? "");
    expect(callId).toBeTruthy();

    const strangerToken = await fetch(`${base}/api/calls/${callId}/token`, {
      method: "POST",
      headers: { Authorization: `Bearer ${stranger.token}` },
    });
    expect(strangerToken.status).toBe(403);

    const liveBefore = await getPool().query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM live_streams WHERE room_id = $1`,
      [invite.roomName],
    );
    expect(Number(liveBefore.rows[0]?.n)).toBe(0);

    calleeSock.ws.send(
      JSON.stringify({
        event: "call_accepted",
        data: { callId },
        timestamp: new Date().toISOString(),
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(callerSock.events.some((row) => row.event === "call_accepted")).toBe(true);

    callerSock.ws.send(
      JSON.stringify({
        event: "call_ended",
        data: { callId },
        timestamp: new Date().toISOString(),
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(calleeSock.events.some((row) => row.event === "call_ended")).toBe(true);

    const blockedPeer = await registerUser("x");
    const blockedThread = await fetch(`${base}/api/inbox/threads`, {
      method: "POST",
      headers: { Authorization: `Bearer ${caller.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ userId: blockedPeer.id }),
    });
    const blockedThreadId = String(((await blockedThread.json()) as { id?: string }).id ?? "");
    await getPool().query(`INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2)`, [blockedPeer.id, caller.id]);
    const blockedSock = await openCallSocket(blockedPeer.token);
    blockedSock.ws.send(
      JSON.stringify({
        event: "call_invite",
        data: { calleeId: caller.id, threadId: blockedThreadId },
        timestamp: new Date().toISOString(),
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 400));
    const blockedEvent = blockedSock.events.find((row) => row.event === "call_rejected");
    expect((blockedEvent?.data as { reason?: string } | undefined)?.reason).toBe("blocked");
    expect(callerSock.events.filter((row) => row.event === "call_invite")).toHaveLength(1);

    const callLive = await getPool().query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM live_streams WHERE room_id LIKE 'call_%'`,
    );
    const calls = await getPool().query<{ n: string }>(`SELECT COUNT(*)::text AS n FROM calls WHERE thread_id = $1`, [
      blockedThreadId,
    ]);
    expect(Number(calls.rows[0]?.n)).toBe(0);
    expect(Number(callLive.rows[0]?.n)).toBe(0);

    callerSock.ws.close();
    calleeSock.ws.close();
    blockedSock.ws.close();
  }, 60_000);

  it("PAGE-036 shop catalog, ownership, and Stripe-only checkout contract", async ({ skip }) => {
    if (!db || !base) {
      skip();
      return;
    }

    async function registerUser(stamp: string) {
      const username = `p36${stamp}${Math.random().toString(36).slice(2, 8)}`.slice(0, 12);
      const registered = await json("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          email: `${username}@example.com`,
          username,
          password: "password12",
          ageConfirmed13Plus: true,
          consentVersion: "2026-07-21",
        }),
      });
      expect(registered.status).toBe(201);
      return {
        id: String((registered.body.user as { id?: string } | undefined)?.id ?? ""),
        token: accessTokenFromLogin(registered.body),
      };
    }

    const seller = await registerUser("s");
    const buyer = await registerUser("b");
    const created = await fetch(`${base}/api/shop/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${seller.token}` },
      body: JSON.stringify({
        title: "Hat",
        description: "Wool",
        price: 12.5,
        category: "clothing",
      }),
    });
    expect(created.status).toBe(201);
    const createdBody = (await created.json()) as { id?: string; pricePence?: number };
    const itemId = String(createdBody.id ?? "");
    expect(itemId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(createdBody.pricePence).toBe(1250);

    const listed = await fetch(`${base}/api/shop/items`);
    const listedBody = (await listed.json()) as { items?: Array<{ id?: string; category?: string }> };
    expect(listed.status).toBe(200);
    expect(listedBody.items?.some((row) => row.id === itemId && row.category === "clothing")).toBe(true);

    const patched = await fetch(`${base}/api/shop/items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${seller.token}` },
      body: JSON.stringify({ title: "Cap", description: "Wool", price: 15, category: "clothing" }),
    });
    expect(patched.status).toBe(200);
    expect(((await patched.json()) as { title?: string; pricePence?: number }).pricePence).toBe(1500);

    const foreign = await fetch(`${base}/api/shop/items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${buyer.token}` },
      body: JSON.stringify({ title: "Stolen", description: "no", price: 1, category: "other" }),
    });
    expect(foreign.status).toBe(404);

    const ownBuy = await fetch(`${base}/api/shop/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${seller.token}` },
      body: JSON.stringify({ itemId, price: 0.01 }),
    });
    expect(ownBuy.status).toBe(400);

    const qtyZero = await fetch(`${base}/api/shop/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${buyer.token}` },
      body: JSON.stringify({ itemId, quantity: 0 }),
    });
    expect(qtyZero.status).toBe(400);

    const tooMany = await fetch(`${base}/api/shop/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${buyer.token}` },
      body: JSON.stringify({
        items: Array.from({ length: 11 }, (_, i) => ({
          id: `00000000-0000-4000-8000-0000000000${String(i).padStart(2, "0")}`,
          quantity: 1,
        })),
      }),
    });
    expect(tooMany.status).toBe(400);

    const unauth = await fetch(`${base}/api/shop/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId }),
    });
    expect(unauth.status).toBe(401);

    const checkout = await fetch(`${base}/api/shop/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${buyer.token}` },
      body: JSON.stringify({ items: [{ id: itemId, quantity: 2 }], price: 0.01, success_url: "https://evil.example" }),
    });
    expect([400, 503]).toContain(checkout.status);

    const startGone = await fetch(`${base}/api/shop/start`, { method: "POST" });
    expect(startGone.status).toBe(404);

    await fetch(`${base}/api/shop/items/${itemId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${seller.token}` },
    });
    const afterDelete = await fetch(`${base}/api/shop/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${buyer.token}` },
      body: JSON.stringify({ itemId }),
    });
    expect([404, 503]).toContain(afterDelete.status);
    const empty = await fetch(`${base}/api/shop/items`);
    const emptyBody = (await empty.json()) as { items?: Array<{ id?: string }> };
    expect(emptyBody.items?.some((row) => row.id === itemId)).toBe(false);
  });

  it("PAGE-037 shop item deep-link identity and Stripe-only checkout contract", async ({ skip }) => {
    if (!db || !base) {
      skip();
      return;
    }

    async function registerUser(stamp: string) {
      const username = `p37${stamp}${Math.random().toString(36).slice(2, 8)}`.slice(0, 12);
      const registered = await json("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          email: `${username}@example.com`,
          username,
          password: "password12",
          ageConfirmed13Plus: true,
          consentVersion: "2026-07-21",
        }),
      });
      expect(registered.status).toBe(201);
      return {
        id: String((registered.body.user as { id?: string } | undefined)?.id ?? ""),
        token: accessTokenFromLogin(registered.body),
      };
    }

    const seller = await registerUser("s");
    const buyer = await registerUser("b");
    const first = await fetch(`${base}/api/shop/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${seller.token}` },
      body: JSON.stringify({ title: "Hat", description: "Wool", price: 12.5, category: "clothing" }),
    });
    const second = await fetch(`${base}/api/shop/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${seller.token}` },
      body: JSON.stringify({ title: "Cap", description: "Cotton", price: 8, category: "other" }),
    });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    const hatId = String(((await first.json()) as { id?: string }).id ?? "");
    const capId = String(((await second.json()) as { id?: string }).id ?? "");
    expect(hatId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(capId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(hatId).not.toBe(capId);

    const listed = await fetch(`${base}/api/shop/items`);
    const listedBody = (await listed.json()) as { items?: Array<{ id?: string; title?: string }> };
    expect(listed.status).toBe(200);
    expect(listedBody.items?.find((row) => row.id === hatId)?.title).toBe("Hat");
    expect(listedBody.items?.find((row) => row.id === capId)?.title).toBe("Cap");
    expect(listedBody.items?.some((row) => row.id === "not-a-real-item")).toBe(false);

    const malformed = await fetch(`${base}/api/shop/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${buyer.token}` },
      body: JSON.stringify({ itemId: "not-a-real-item" }),
    });
    expect(malformed.status).toBe(400);

    const missing = await fetch(`${base}/api/shop/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${buyer.token}` },
      body: JSON.stringify({ itemId: "44444444-4444-4444-8444-444444444444" }),
    });
    expect(missing.status).toBe(404);

    const itemCheckoutAlias = await fetch(`${base}/api/shop/${hatId}/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${buyer.token}` },
      body: JSON.stringify({}),
    });
    expect(itemCheckoutAlias.status).toBe(404);

    const tamper = await fetch(`${base}/api/shop/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${buyer.token}` },
      body: JSON.stringify({
        itemId: hatId,
        price: 0.01,
        total: 0.01,
        currency: "usd",
        success_url: "https://evil.example",
        cancel_url: "https://evil.example",
      }),
    });
    expect([400, 503]).toContain(tamper.status);

    await fetch(`${base}/api/shop/items/${hatId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${seller.token}` },
    });
    const afterDelete = await fetch(`${base}/api/shop/items`);
    const afterDeleteBody = (await afterDelete.json()) as { items?: Array<{ id?: string }> };
    expect(afterDeleteBody.items?.some((row) => row.id === hatId)).toBe(false);
    expect(afterDeleteBody.items?.some((row) => row.id === capId)).toBe(true);

    const deletedCheckout = await fetch(`${base}/api/shop/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${buyer.token}` },
      body: JSON.stringify({ itemId: hatId }),
    });
    expect([404, 503]).toContain(deletedCheckout.status);
  });

  it("PAGE-038 coin catalog and verify-purchase stay Apple/Google IAP only", async ({ skip }) => {
    if (!db || !base) {
      skip();
      return;
    }

    async function registerUser(stamp: string) {
      const username = `p38${stamp}${Math.random().toString(36).slice(2, 8)}`.slice(0, 12);
      const registered = await json("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          email: `${username}@example.com`,
          username,
          password: "password12",
          ageConfirmed13Plus: true,
          consentVersion: "2026-07-21",
        }),
      });
      expect(registered.status).toBe(201);
      return {
        id: String((registered.body.user as { id?: string } | undefined)?.id ?? ""),
        token: accessTokenFromLogin(registered.body),
      };
    }

    const buyer = await registerUser("a");
    const other = await registerUser("b");

    const catalog = await fetch(`${base}/api/coin-packages?provider=google`);
    const catalogBody = (await catalog.json()) as {
      packages?: Array<{ productId?: string; provider?: string; coins?: number }>;
    };
    expect(catalog.status).toBe(200);
    expect(catalogBody.packages?.length).toBeGreaterThan(0);
    expect(catalogBody.packages?.every((row) => row.provider === "google")).toBe(true);
    expect(catalogBody.packages?.some((row) => row.productId === "coins500a" && row.coins === 500)).toBe(true);
    expect(catalogBody.packages?.some((row) => row.productId === "coins500")).toBe(false);

    const appleCatalog = await fetch(`${base}/api/coin-packages?provider=apple`);
    const appleBody = (await appleCatalog.json()) as { packages?: Array<{ productId?: string }> };
    expect(appleBody.packages?.some((row) => row.productId === "coins500")).toBe(true);
    expect(appleBody.packages?.some((row) => row.productId === "coins500a")).toBe(false);

    const unauth = await fetch(`${base}/api/verify-purchase`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "apple", productId: "coins100", receipt: "not-a-jws" }),
    });
    expect(unauth.status).toBe(401);

    const forgedUser = await fetch(`${base}/api/verify-purchase`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${buyer.token}` },
      body: JSON.stringify({
        provider: "apple",
        productId: "coins100",
        receipt: "not-a-jws",
        userId: other.id,
      }),
    });
    expect(forgedUser.status).toBe(403);

    const unknownSku = await fetch(`${base}/api/verify-purchase`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${buyer.token}` },
      body: JSON.stringify({ provider: "apple", productId: "not-a-real-sku", receipt: "not-a-jws" }),
    });
    expect(unknownSku.status).toBe(400);

    const appleOnGoogleSku = await fetch(`${base}/api/verify-purchase`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${buyer.token}` },
      body: JSON.stringify({ provider: "apple", productId: "coins500a", receipt: "not-a-jws" }),
    });
    expect(appleOnGoogleSku.status).toBe(400);

    const badProof = await fetch(`${base}/api/verify-purchase`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${buyer.token}` },
      body: JSON.stringify({ provider: "apple", productId: "coins100", receipt: "not-a-jws", coins: 350000, price: 0.01 }),
    });
    expect(badProof.status).toBe(400);

    const stripeAlias = await fetch(`${base}/api/shop/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${buyer.token}` },
      body: JSON.stringify({ itemId: "coins100" }),
    });
    expect([400, 404]).toContain(stripeAlias.status);

    const lots = await getPool().query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM paid_coin_lots WHERE user_id = $1`,
      [buyer.id],
    );
    expect(Number(lots.rows[0]?.n)).toBe(0);
  });

  it("PAGE-039 wallet keeps paid/starter/promo separate and test coins out of GET /api/wallet", async ({ skip }) => {
    if (!db || !base) {
      skip();
      return;
    }

    async function registerIsolated(prefix: string) {
      const username = `${prefix}${Math.random().toString(36).slice(2, 10)}`.slice(0, 12);
      const res = await fetch(`${base}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: `${username}@example.com`,
          username,
          password: "password12",
          ageConfirmed13Plus: true,
          consentVersion: "2026-07-21",
        }),
      });
      const body = (await res.json()) as { token?: string; user?: { id?: string } };
      expect(res.status).toBe(201);
      return { id: String(body.user?.id ?? ""), token: accessTokenFromLogin(body) };
    }

    const unauth = await fetch(`${base}/api/wallet`);
    expect(unauth.status).toBe(401);

    const unauthTest = await fetch(`${base}/api/test-coins/balance`);
    expect(unauthTest.status).toBe(401);

    const user = await registerIsolated("p39");
    const other = await registerIsolated("p39b");

    const before = await fetch(`${base}/api/wallet?userId=${other.id}`, {
      headers: { Authorization: `Bearer ${user.token}` },
    });
    const beforeBody = (await before.json()) as Record<string, unknown>;
    expect(before.status).toBe(200);
    expect(beforeBody.user_id).toBe(user.id);
    expect(beforeBody.user_id).not.toBe(other.id);
    expect(beforeBody.coin_balance).toBe(0);
    expect(beforeBody.starter_balance).toBe(50000);
    expect(beforeBody.promotional_balance).toBe(0);
    expect(beforeBody.testCoins).toBeUndefined();
    expect(beforeBody.paidCoins).toBeUndefined();
    expect(beforeBody.coin_balance).not.toBe(beforeBody.starter_balance);

    const neonTest = await getPool().query<{ test_coins: string }>(
      `SELECT test_coins::text AS test_coins FROM wallet_balances WHERE user_id = $1`,
      [user.id],
    );
    expect(Number(neonTest.rows[0]?.test_coins ?? 0)).toBe(0);

    const giftsWallet = await fetch(`${base}/api/gifts/wallet`, {
      headers: { Authorization: `Bearer ${user.token}` },
    });
    expect(giftsWallet.status).toBe(404);

    const testBalance = await fetch(`${base}/api/test-coins/balance`, {
      headers: { Authorization: `Bearer ${user.token}` },
    });
    expect(testBalance.status).toBe(503);

    const mint = await fetch(`${base}/api/test-coins/mint`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${user.token}` },
      body: JSON.stringify({ password: "qa-test-coins", amount: 25 }),
    });
    expect(mint.status).toBe(503);

    const afterMintWallet = await fetch(`${base}/api/wallet`, {
      headers: { Authorization: `Bearer ${user.token}` },
    });
    const afterMintBody = (await afterMintWallet.json()) as Record<string, unknown>;
    expect(afterMintWallet.status).toBe(200);
    expect(afterMintBody.coin_balance).toBe(0);
    expect(afterMintBody.starter_balance).toBe(50000);
    expect(afterMintBody.promotional_balance).toBe(0);
    expect(afterMintBody.testCoins).toBeUndefined();
  });

  it("PAGE-040 logout revokes the session and delete is session-derived", async ({ skip }) => {
    if (!db || !base) {
      skip();
      return;
    }

    async function registerIsolated(prefix: string) {
      const username = `${prefix}${Math.random().toString(36).slice(2, 10)}`.slice(0, 12);
      const res = await fetch(`${base}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: `${username}@example.com`,
          username,
          password: "password12",
          ageConfirmed13Plus: true,
          consentVersion: "2026-07-21",
        }),
      });
      const body = (await res.json()) as { token?: string; user?: { id?: string; isAdmin?: boolean } };
      expect(res.status).toBe(201);
      return { id: String(body.user?.id ?? ""), token: accessTokenFromLogin(body), isAdmin: body.user?.isAdmin === true };
    }

    const unauthLogout = await fetch(`${base}/api/auth/logout`, { method: "POST" });
    expect(unauthLogout.status).toBe(401);
    const unauthDelete = await fetch(`${base}/api/auth/delete`, { method: "POST" });
    expect(unauthDelete.status).toBe(401);
    const missingLegacy = await fetch(`${base}/api/auth/delete-account`, { method: "POST" });
    expect(missingLegacy.status).toBe(404);

    const user = await registerIsolated("p40");
    const other = await registerIsolated("p40b");
    expect(user.isAdmin).toBe(false);

    const me = await fetch(`${base}/api/auth/me`, {
      headers: { Authorization: `Bearer ${user.token}` },
    });
    const meBody = (await me.json()) as {
      user?: { id?: string; user_metadata?: { username?: string } };
      session?: { access_token?: string };
      profile_meta?: { is_admin?: boolean };
    };
    expect(me.status).toBe(200);
    expect(meBody.user?.id).toBe(user.id);
    expect(meBody.session?.access_token).toBe(user.token);
    expect(meBody.profile_meta?.is_admin).toBe(false);

    const logout = await fetch(`${base}/api/auth/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${user.token}` },
    });
    expect(logout.status).toBe(200);
    const afterLogout = await fetch(`${base}/api/auth/me`, {
      headers: { Authorization: `Bearer ${user.token}` },
    });
    expect(afterLogout.status).toBe(401);

    const otherDelete = await fetch(`${base}/api/auth/delete`, {
      method: "POST",
      headers: { Authorization: `Bearer ${other.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ userId: user.id }),
    });
    expect(otherDelete.status).toBe(200);
    const otherGone = await getPool().query<{ deleted_at: Date | null }>(
      `SELECT deleted_at FROM users WHERE id = $1`,
      [other.id],
    );
    const userStill = await getPool().query<{ deleted_at: Date | null }>(
      `SELECT deleted_at FROM users WHERE id = $1`,
      [user.id],
    );
    expect(otherGone.rows[0]?.deleted_at).toBeTruthy();
    expect(userStill.rows[0]?.deleted_at).toBeNull();

    const otherMe = await fetch(`${base}/api/auth/me`, {
      headers: { Authorization: `Bearer ${other.token}` },
    });
    expect(otherMe.status).toBe(401);
  });

  it("PAGE-042 2FA status, enroll, verify, disable, and isolation", async ({ skip }) => {
    if (!db || !base) {
      skip();
      return;
    }
    const { totpNow } = await import("./infra/totp.js");

    async function registerIsolated(prefix: string) {
      const username = `${prefix}${Math.random().toString(36).slice(2, 10)}`.slice(0, 12);
      const email = `${username}@example.com`;
      const res = await fetch(`${base}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          username,
          password: "password12",
          ageConfirmed13Plus: true,
          consentVersion: "2026-07-21",
        }),
      });
      const body = (await res.json()) as { token?: string; user?: { id?: string } };
      expect(res.status).toBe(201);
      return { id: String(body.user?.id ?? ""), token: accessTokenFromLogin(body), email };
    }

    async function authJson(pathName: string, userToken: string, init: RequestInit = {}) {
      const res = await fetch(`${base}${pathName}`, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userToken}`,
          ...(init.headers as Record<string, string> | undefined),
        },
      });
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      return { status: res.status, body, cache: res.headers.get("cache-control") };
    }

    const unauth = await fetch(`${base}/api/auth/2fa/status`);
    expect(unauth.status).toBe(401);

    const userA = await registerIsolated("p42a");
    const userB = await registerIsolated("p42b");

    const statusA0 = await authJson("/api/auth/2fa/status", userA.token);
    expect(statusA0.status).toBe(200);
    expect(statusA0.body).toEqual({ enabled: false });
    expect(statusA0.body.enrolled).toBeUndefined();
    expect(statusA0.cache).toMatch(/no-store/);

    const enrollA1 = await authJson("/api/auth/2fa/enroll", userA.token, {
      method: "POST",
      body: JSON.stringify({ userId: userB.id }),
    });
    expect(enrollA1.status).toBe(200);
    const secretA1 = String(enrollA1.body.secret ?? "");
    expect(secretA1.length).toBeGreaterThan(8);
    expect(enrollA1.body.otpauth).toBeUndefined();
    const bAfterForeign = await getPool().query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM user_two_factor WHERE user_id = $1`,
      [userB.id],
    );
    expect(bAfterForeign.rows[0]?.n).toBe(0);

    const enrollA2 = await authJson("/api/auth/2fa/enroll", userA.token, { method: "POST", body: "{}" });
    expect(enrollA2.status).toBe(200);
    const secretA2 = String(enrollA2.body.secret ?? "");
    expect(secretA2).not.toBe(secretA1);

    const staleCode = totpNow(secretA1);
    const staleVerify = await authJson("/api/auth/2fa/verify", userA.token, {
      method: "POST",
      body: JSON.stringify({ code: staleCode, userId: userB.id }),
    });
    expect(staleVerify.status).toBe(401);
    const stillOff = await authJson("/api/auth/2fa/status", userA.token);
    expect(stillOff.body).toEqual({ enabled: false });

    const emptyVerify = await authJson("/api/auth/2fa/verify", userA.token, {
      method: "POST",
      body: JSON.stringify({ code: "" }),
    });
    expect(emptyVerify.status).toBe(400);

    const wrongVerify = await authJson("/api/auth/2fa/verify", userA.token, {
      method: "POST",
      body: JSON.stringify({ code: "000000" }),
    });
    expect(wrongVerify.status).toBe(401);
    expect((await authJson("/api/auth/2fa/status", userA.token)).body).toEqual({ enabled: false });

    const expiredVerify = await authJson("/api/auth/2fa/verify", userA.token, {
      method: "POST",
      body: JSON.stringify({ code: totpNow(secretA2, Date.now() - 120_000) }),
    });
    expect(expiredVerify.status).toBe(401);

    const validVerify = await authJson("/api/auth/2fa/verify", userA.token, {
      method: "POST",
      body: JSON.stringify({ code: totpNow(secretA2) }),
    });
    expect(validVerify.status).toBe(200);
    expect(validVerify.body).toEqual({ ok: true, enabled: true });
    expect((await authJson("/api/auth/2fa/status", userA.token)).body).toEqual({ enabled: true });

    const reenroll = await authJson("/api/auth/2fa/enroll", userA.token, { method: "POST", body: "{}" });
    expect(reenroll.status).toBe(409);

    const disableWrong = await authJson("/api/auth/2fa/disable", userA.token, {
      method: "POST",
      body: JSON.stringify({ code: "000000" }),
    });
    expect(disableWrong.status).toBe(401);
    expect((await authJson("/api/auth/2fa/status", userA.token)).body).toEqual({ enabled: true });

    const resetToken = await issueResetJwtForUser(userA.id);
    const reset = await fetch(`${base}/api/auth/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: resetToken, password: "password99xx" }),
    });
    expect(reset.status).toBe(200);
    const loginAfterReset = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: userA.email, password: "password99xx" }),
    });
    const loginAfterResetBody = (await loginAfterReset.json()) as Record<string, unknown>;
    expect(loginAfterReset.status).toBe(200);
    const tokenAfterReset = accessTokenFromLogin(loginAfterResetBody);
    expect((await authJson("/api/auth/2fa/status", tokenAfterReset)).body).toEqual({ enabled: true });

    const disableOk = await authJson("/api/auth/2fa/disable", tokenAfterReset, {
      method: "POST",
      body: JSON.stringify({ code: totpNow(secretA2), userId: userB.id }),
    });
    expect(disableOk.status).toBe(200);
    expect(disableOk.body).toEqual({ ok: true, enabled: false });
    expect((await authJson("/api/auth/2fa/status", tokenAfterReset)).body).toEqual({ enabled: false });

    const statusB = await authJson("/api/auth/2fa/status", userB.token);
    expect(statusB.body).toEqual({ enabled: false });
  });

  it("PAGE-043 device tokens persist per user/platform and push_notify stays honest", async ({ skip }) => {
    if (!db || !base) {
      skip();
      return;
    }
    const { pushNotifyUser } = await import("./modules/push/send.js");

    async function registerIsolated(prefix: string) {
      const username = `${prefix}${Math.random().toString(36).slice(2, 10)}`.slice(0, 12);
      const res = await fetch(`${base}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: `${username}@example.com`,
          username,
          password: "password12",
          ageConfirmed13Plus: true,
          consentVersion: "2026-07-21",
        }),
      });
      const body = (await res.json()) as { token?: string; user?: { id?: string } };
      expect(res.status).toBe(201);
      return { id: String(body.user?.id ?? ""), token: accessTokenFromLogin(body) };
    }

    async function authJson(pathName: string, userToken: string, init: RequestInit = {}) {
      const res = await fetch(`${base}${pathName}`, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userToken}`,
          ...(init.headers as Record<string, string> | undefined),
        },
      });
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      return { status: res.status, body };
    }

    expect((await fetch(`${base}/api/device-tokens`, { method: "POST" })).status).toBe(401);
    expect((await fetch(`${base}/api/device-tokens`, { method: "DELETE" })).status).toBe(401);
    expect((await fetch(`${base}/api/notifications/device-tokens`, { method: "POST" })).status).toBe(404);

    const userA = await registerIsolated("p43a");
    const userB = await registerIsolated("p43b");

    const empty = await authJson("/api/device-tokens", userA.token, {
      method: "POST",
      body: JSON.stringify({ token: "", platform: "android" }),
    });
    expect(empty.status).toBe(400);

    const badPlatform = await authJson("/api/device-tokens", userA.token, {
      method: "POST",
      body: JSON.stringify({ token: "android-token-1", platform: "windows" }),
    });
    expect(badPlatform.status).toBe(400);

    const first = await authJson("/api/device-tokens", userA.token, {
      method: "POST",
      body: JSON.stringify({ token: "android-token-1", platform: "android", userId: userB.id }),
    });
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ ok: true });

    const again = await authJson("/api/device-tokens", userA.token, {
      method: "POST",
      body: JSON.stringify({ token: "android-token-1", platform: "android" }),
    });
    expect(again.status).toBe(200);

    const rotated = await authJson("/api/device-tokens", userA.token, {
      method: "POST",
      body: JSON.stringify({ token: "android-token-2", platform: "android" }),
    });
    expect(rotated.status).toBe(200);

    const ios = await authJson("/api/device-tokens", userA.token, {
      method: "POST",
      body: JSON.stringify({ token: "ios-token-1", platform: "ios" }),
    });
    expect(ios.status).toBe(200);

    const aRows = await getPool().query<{ platform: string; token: string }>(
      `SELECT platform, token FROM device_tokens WHERE user_id = $1 ORDER BY platform`,
      [userA.id],
    );
    expect(aRows.rows).toEqual([
      { platform: "android", token: "android-token-2" },
      { platform: "ios", token: "ios-token-1" },
    ]);

    const bRows = await getPool().query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM device_tokens WHERE user_id = $1`,
      [userB.id],
    );
    expect(bRows.rows[0]?.n).toBe(0);

    const deleteAndroid = await authJson("/api/device-tokens", userA.token, {
      method: "DELETE",
      body: JSON.stringify({ platform: "android", userId: userB.id }),
    });
    expect(deleteAndroid.status).toBe(200);
    const afterDelete = await getPool().query<{ platform: string }>(
      `SELECT platform FROM device_tokens WHERE user_id = $1`,
      [userA.id],
    );
    expect(afterDelete.rows).toEqual([{ platform: "ios" }]);

    const otherDelete = await authJson("/api/device-tokens", userB.token, {
      method: "DELETE",
      body: JSON.stringify({ platform: "ios" }),
    });
    expect(otherDelete.status).toBe(200);
    const aStill = await getPool().query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM device_tokens WHERE user_id = $1`,
      [userA.id],
    );
    expect(aStill.rows[0]?.n).toBe(1);

    const push = await pushNotifyUser(userA.id, "Title", "Body");
    expect(push).toEqual({ configured: false, sent: 0, failed: 0, reason: "not_configured" });
  });

  it("PAGE-044 blocked list, unblock, isolation, and shared relationship reconcile", async ({ skip }) => {
    if (!db || !base) {
      skip();
      return;
    }

    async function registerIsolated(prefix: string) {
      const username = `${prefix}${Math.random().toString(36).slice(2, 10)}`.slice(0, 12);
      const res = await fetch(`${base}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: `${username}@example.com`,
          username,
          password: "password12",
          ageConfirmed13Plus: true,
          consentVersion: "2026-07-21",
        }),
      });
      const body = (await res.json()) as { token?: string; user?: { id?: string } };
      expect(res.status).toBe(201);
      return { id: String(body.user?.id ?? ""), token: accessTokenFromLogin(body), username };
    }

    async function authJson(pathName: string, userToken: string, init: RequestInit = {}) {
      const res = await fetch(`${base}${pathName}`, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userToken}`,
          ...(init.headers as Record<string, string> | undefined),
        },
      });
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      return { status: res.status, body, cache: res.headers.get("cache-control") };
    }

    expect((await fetch(`${base}/api/blocked-users`)).status).toBe(401);
    expect(
      (
        await fetch(`${base}/api/unblock-user`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        })
      ).status,
    ).toBe(401);
    expect((await fetch(`${base}/api/safety/blocked`)).status).toBe(404);

    const userA = await registerIsolated("p44a");
    const userB = await registerIsolated("p44b");
    const userC = await registerIsolated("p44c");

    const empty = await authJson("/api/blocked-users", userA.token);
    expect(empty.status).toBe(200);
    expect(empty.body).toEqual({ data: [] });
    expect(empty.cache).toMatch(/no-store/);

    const forgedList = await authJson(`/api/blocked-users?viewerId=${userB.id}&blockerId=${userB.id}`, userA.token);
    expect(forgedList.body).toEqual({ data: [] });

    const selfBlock = await authJson(`/api/block/${userA.id}`, userA.token, { method: "POST", body: "{}" });
    expect(selfBlock.status).toBe(400);

    const missingBlock = await authJson("/api/block/00000000-0000-4000-8000-000000000000", userA.token, {
      method: "POST",
      body: "{}",
    });
    expect(missingBlock.status).toBe(404);

    const blockB = await authJson(`/api/block/${userB.id}`, userA.token, {
      method: "POST",
      body: JSON.stringify({ viewerId: userB.id, blockerId: userB.id }),
    });
    expect(blockB.status).toBe(200);
    const blockC = await authJson(`/api/block/${userC.id}`, userA.token, { method: "POST", body: "{}" });
    expect(blockC.status).toBe(200);
    await getPool().query(`UPDATE blocks SET created_at = $3 WHERE blocker_id = $1 AND blocked_id = $2`, [
      userA.id,
      userB.id,
      "2026-01-01T00:00:00.000Z",
    ]);
    await getPool().query(`UPDATE blocks SET created_at = $3 WHERE blocker_id = $1 AND blocked_id = $2`, [
      userA.id,
      userC.id,
      "2026-08-01T00:00:00.000Z",
    ]);

    const listA = await authJson("/api/blocked-users", userA.token);
    expect(listA.status).toBe(200);
    const rows = (listA.body.data as Array<{ blocked_user_id?: string; username?: string }>) ?? [];
    expect(rows.map((row) => row.blocked_user_id)).toEqual([userC.id, userB.id]);
    expect(rows.some((row) => row.blocked_user_id === userA.id)).toBe(false);
    expect(rows.find((row) => row.blocked_user_id === userB.id)?.username).toBe(userB.username);

    const listB = await authJson("/api/blocked-users", userB.token);
    expect(listB.body).toEqual({ data: [] });

    const profileBlocked = await authJson(`/api/profiles/${userB.id}`, userA.token);
    expect(profileBlocked.status).toBe(403);
    const followBlocked = await authJson(`/api/profiles/${userB.id}/follow`, userA.token, { method: "POST", body: "{}" });
    expect(followBlocked.status).toBe(403);
    const messageBlocked = await authJson("/api/inbox/threads", userA.token, {
      method: "POST",
      body: JSON.stringify({ userId: userB.id }),
    });
    expect(messageBlocked.status).toBe(403);

    await getPool().query(
      `INSERT INTO videos (user_id, bunny_path, caption, privacy) VALUES ($1, 'https://cdn.example/p44.mp4', 'blocked-feed', 'public')`,
      [userB.id],
    );
    const feedBlocked = await authJson("/api/feed/foryou", userA.token);
    const feedBlockedItems = (feedBlocked.body.videos as Array<{ user?: { id?: string } }>) ?? [];
    expect(feedBlockedItems.every((item) => item.user?.id !== userB.id)).toBe(true);

    const malformed = await authJson("/api/unblock-user", userA.token, {
      method: "POST",
      body: JSON.stringify({ blockedUserId: "not-a-user", blockerId: userB.id }),
    });
    expect(malformed.status).toBe(400);

    const selfUnblock = await authJson("/api/unblock-user", userA.token, {
      method: "POST",
      body: JSON.stringify({ blockedUserId: userA.id }),
    });
    expect(selfUnblock.status).toBe(400);

    const foreignUnblock = await authJson("/api/unblock-user", userB.token, {
      method: "POST",
      body: JSON.stringify({ blockedUserId: userC.id, blockerId: userA.id }),
    });
    expect(foreignUnblock.status).toBe(200);
    expect(foreignUnblock.body).toEqual({ success: true });
    const stillBlocked = await getPool().query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM blocks WHERE blocker_id = $1 AND blocked_id = $2`,
      [userA.id, userC.id],
    );
    expect(stillBlocked.rows[0]?.n).toBe(1);

    const firstUnblock = await authJson("/api/unblock-user", userA.token, {
      method: "POST",
      body: JSON.stringify({ blockedUserId: userB.id, viewerId: userB.id }),
    });
    expect(firstUnblock.status).toBe(200);
    expect(firstUnblock.body).toEqual({ success: true });
    const again = await authJson("/api/unblock-user", userA.token, {
      method: "POST",
      body: JSON.stringify({ blockedUserId: userB.id }),
    });
    expect(again.status).toBe(200);
    expect(again.body).toEqual({ success: true });

    const after = await authJson("/api/blocked-users", userA.token);
    const afterRows = (after.body.data as Array<{ blocked_user_id?: string }>) ?? [];
    expect(afterRows.map((row) => row.blocked_user_id)).toEqual([userC.id]);

    const profileOpen = await authJson(`/api/profiles/${userB.id}`, userA.token);
    expect(profileOpen.status).toBe(200);
    const followOpen = await authJson(`/api/profiles/${userB.id}/follow`, userA.token, { method: "POST", body: "{}" });
    expect(followOpen.status).toBe(200);
    const messageOpen = await authJson("/api/inbox/threads", userA.token, {
      method: "POST",
      body: JSON.stringify({ userId: userB.id }),
    });
    expect([200, 201]).toContain(messageOpen.status);

    const feedOpen = await authJson("/api/feed/foryou", userA.token);
    const feedOpenItems = (feedOpen.body.videos as Array<{ user?: { id?: string } }>) ?? [];
    expect(feedOpenItems.some((item) => item.user?.id === userB.id)).toBe(true);

    const { isBlockedEitherWay } = await import("./modules/blocks/service.js");
    expect(await isBlockedEitherWay(userA.id, userB.id)).toBe(false);
    expect(await isBlockedEitherWay(userA.id, userC.id)).toBe(true);

    const deleted = await getPool().query(`UPDATE users SET deleted_at = NOW() WHERE id = $1`, [userC.id]);
    expect(deleted.rowCount).toBe(1);
    const omitted = await authJson("/api/blocked-users", userA.token);
    expect(omitted.body).toEqual({ data: [] });
  });

  it("PAGE-045 creator payout keeps available/held separate and never credits test/starter/promo GBP", async ({ skip }) => {
    if (!db || !base) {
      skip();
      return;
    }

    async function registerIsolated(prefix: string) {
      const username = `${prefix}${Math.random().toString(36).slice(2, 10)}`.slice(0, 12);
      const res = await fetch(`${base}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: `${username}@example.com`,
          username,
          password: "password12",
          ageConfirmed13Plus: true,
          consentVersion: "2026-07-21",
        }),
      });
      const body = (await res.json()) as { token?: string; user?: { id?: string } };
      expect(res.status).toBe(201);
      return { id: String(body.user?.id ?? ""), token: accessTokenFromLogin(body), username };
    }

    async function authJson(pathName: string, userToken: string, init: RequestInit = {}) {
      const res = await fetch(`${base}${pathName}`, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userToken}`,
          ...(init.headers as Record<string, string> | undefined),
        },
      });
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      return { status: res.status, body, cache: res.headers.get("cache-control") };
    }

    expect((await fetch(`${base}/api/creator/balance`)).status).toBe(401);
    expect((await fetch(`${base}/api/creator/ledger`)).status).toBe(401);
    expect((await fetch(`${base}/api/creator/withdrawals-gbp`)).status).toBe(401);
    expect((await fetch(`${base}/api/creator/payout-account`)).status).toBe(401);
    expect(
      (
        await fetch(`${base}/api/creator/withdraw-gbp`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        })
      ).status,
    ).toBe(401);
    expect((await fetch(`${base}/api/payouts/withdraw`, { method: "POST" })).status).toBe(404);
    expect((await fetch(`${base}/api/wallet/withdraw`, { method: "POST" })).status).toBe(404);

    const creator = await registerIsolated("p45c");
    const sender = await registerIsolated("p45s");
    const other = await registerIsolated("p45o");

    const empty = await authJson("/api/creator/balance", creator.token);
    expect(empty.status).toBe(200);
    expect(empty.cache).toMatch(/no-store/);
    expect(empty.body).toMatchObject({
      gbp: {
        available_pence: 0,
        pending_pence: 0,
        withdrawn_pence: 0,
        held_pence: 0,
        reversed_pence: 0,
      },
    });
    expect(empty.body.availablePence).toBeUndefined();

    const stream = await getPool().query<{ id: string }>(
      `INSERT INTO live_streams (host_id, room_id, title) VALUES ($1, $2, 'p45') RETURNING id::text AS id`,
      [creator.id, `p45-${creator.id}`],
    );
    const streamId = stream.rows[0].id;

    const starterGift = await authJson("/api/gifts/send", sender.token, {
      method: "POST",
      body: JSON.stringify({
        giftId: "rose",
        recipientId: creator.id,
        streamId,
        idempotencyKey: crypto.randomUUID(),
        bucket: "starter",
      }),
    });
    expect(starterGift.status).toBe(200);
    expect((await authJson("/api/creator/balance", creator.token)).body).toMatchObject({
      gbp: { available_pence: 0, pending_pence: 0 },
    });

    await getPool().query(`UPDATE wallet_balances SET promo_coins = promo_coins + 10 WHERE user_id = $1`, [sender.id]);
    const promoGift = await authJson("/api/gifts/send", sender.token, {
      method: "POST",
      body: JSON.stringify({
        giftId: "rose",
        recipientId: creator.id,
        streamId,
        idempotencyKey: crypto.randomUUID(),
        bucket: "promo",
      }),
    });
    expect(promoGift.status).toBe(200);
    expect((await authJson("/api/creator/balance", creator.token)).body).toMatchObject({
      gbp: { available_pence: 0, pending_pence: 0 },
    });

    const testGift = await authJson("/api/gifts/send", sender.token, {
      method: "POST",
      body: JSON.stringify({
        giftId: "rose",
        recipientId: creator.id,
        streamId,
        idempotencyKey: crypto.randomUUID(),
        bucket: "test",
      }),
    });
    expect([400, 503]).toContain(testGift.status);
    expect((await authJson("/api/creator/balance", creator.token)).body).toMatchObject({
      gbp: { available_pence: 0, pending_pence: 0 },
    });

    await getPool().query(`UPDATE wallet_balances SET paid_coins = paid_coins + 10 WHERE user_id = $1`, [sender.id]);
    await getPool().query(
      `INSERT INTO paid_coin_lots (
         user_id, provider, provider_txn_id, product_id, coins_original, coins_remaining, gross_pence, settlement_status
       ) VALUES ($1, 'google', $2, 'coins1000', 10, 10, 1000, 'settled')`,
      [sender.id, `p45-lot-${sender.id}`],
    );
    const paidGift = await authJson("/api/gifts/send", sender.token, {
      method: "POST",
      body: JSON.stringify({
        giftId: "rose",
        recipientId: creator.id,
        streamId,
        idempotencyKey: crypto.randomUUID(),
        bucket: "paid",
      }),
    });
    expect(paidGift.status).toBe(200);
    const afterPaid = await authJson("/api/creator/balance", creator.token);
    expect(afterPaid.body).toMatchObject({
      gbp: { pending_pence: 60, available_pence: 0 },
      earnings_by_source: { gifts_pence: 60 },
    });
    const platform = await getPool().query<{ available_pence: string }>(
      `SELECT available_pence::text FROM platform_wallet_gbp WHERE id = 1`,
    );
    expect(Number(platform.rows[0]?.available_pence ?? 0)).toBeGreaterThanOrEqual(40);

    await getPool().query(`UPDATE creator_earnings SET available_at = NOW() WHERE creator_id = $1`, [creator.id]);
    const { matureCreatorEarnings } = await import("./modules/gifts/settle.js");
    await withTransaction(async (client) => {
      await matureCreatorEarnings(client);
    });
    const matured = await authJson("/api/creator/balance", creator.token);
    expect(matured.body).toMatchObject({
      gbp: { pending_pence: 0, available_pence: 60, held_pence: 0, withdrawn_pence: 0 },
    });

    const noMethod = await authJson("/api/creator/withdraw-gbp", creator.token, {
      method: "POST",
      body: JSON.stringify({ amount_pence: 60, idempotency_key: "p45-no-method-key" }),
    });
    expect(noMethod.status).toBe(400);
    expect(noMethod.body.error).toBe("no_payout_method");

    const saveMethod = await authJson("/api/creator/payout-method", creator.token, {
      method: "POST",
      body: JSON.stringify({
        type: "bank",
        details: { account_name: "Creator", iban_or_account: "GB82WEST12345698765432" },
      }),
    });
    expect(saveMethod.status).toBe(200);
    const methods = await authJson("/api/creator/payout-methods", creator.token);
    const methodRows = (methods.body.methods as Array<{ details?: { iban_or_account?: string } }>) ?? [];
    expect(methodRows[0]?.details?.iban_or_account).toBe("••••5432");

    const zero = await authJson("/api/creator/withdraw-gbp", creator.token, {
      method: "POST",
      body: JSON.stringify({ amount_pence: 0, idempotency_key: "p45-zero-key-1" }),
    });
    expect(zero.status).toBe(400);
    const negative = await authJson("/api/creator/withdraw-gbp", creator.token, {
      method: "POST",
      body: JSON.stringify({ amount_pence: -1, idempotency_key: "p45-neg-key-1" }),
    });
    expect(negative.status).toBe(400);
    const malformed = await authJson("/api/creator/withdraw-gbp", creator.token, {
      method: "POST",
      body: JSON.stringify({ amount_pence: "60", idempotency_key: "p45-bad-key-1" }),
    });
    expect(malformed.status).toBe(400);
    const over = await authJson("/api/creator/withdraw-gbp", creator.token, {
      method: "POST",
      body: JSON.stringify({ amount_pence: 61, idempotency_key: "p45-over-key-1" }),
    });
    expect(over.status).toBe(400);
    expect(over.body.error).toBe("insufficient_available");

    await getPool().query(`UPDATE creator_wallet_gbp SET available_pence = 5000 WHERE user_id = $1`, [creator.id]);
    const firstKey = "p45-withdraw-same-key";
    const first = await authJson("/api/creator/withdraw-gbp", creator.token, {
      method: "POST",
      body: JSON.stringify({
        amount_pence: 5000,
        idempotency_key: firstKey,
        userId: other.id,
        accountId: "acct_forged",
        stripeAccountId: "acct_forged",
      }),
    });
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ ok: true, status: "pending", already_exists: false });
    const replay = await authJson("/api/creator/withdraw-gbp", creator.token, {
      method: "POST",
      body: JSON.stringify({ amount_pence: 5000, idempotency_key: firstKey }),
    });
    expect(replay.status).toBe(200);
    expect(replay.body).toMatchObject({ ok: true, already_exists: true, status: "pending" });
    const conflict = await authJson("/api/creator/withdraw-gbp", creator.token, {
      method: "POST",
      body: JSON.stringify({ amount_pence: 1000, idempotency_key: firstKey }),
    });
    expect(conflict.status).toBe(409);

    const reserved = await authJson("/api/creator/balance", creator.token);
    expect(reserved.body).toMatchObject({
      gbp: { available_pence: 0, held_pence: 5000, withdrawn_pence: 0 },
    });
    const history = await authJson("/api/creator/withdrawals-gbp", creator.token);
    const withdrawals = (history.body.withdrawals as Array<{ status?: string; amount_pence?: number }>) ?? [];
    expect(withdrawals).toHaveLength(1);
    expect(withdrawals[0]).toMatchObject({ status: "pending", amount_pence: 5000 });

    await getPool().query(`UPDATE creator_wallet_gbp SET available_pence = 5000 WHERE user_id = $1`, [creator.id]);
    const [left, right] = await Promise.all([
      authJson("/api/creator/withdraw-gbp", creator.token, {
        method: "POST",
        body: JSON.stringify({ amount_pence: 5000, idempotency_key: "p45-conc-a" }),
      }),
      authJson("/api/creator/withdraw-gbp", creator.token, {
        method: "POST",
        body: JSON.stringify({ amount_pence: 5000, idempotency_key: "p45-conc-b" }),
      }),
    ]);
    const statuses = [left.status, right.status].sort();
    expect(statuses).toEqual([200, 400]);
    const afterConcurrent = await getPool().query<{
      available_pence: string;
      held_pence: string;
      withdrawn_pence: string;
    }>(
      `SELECT available_pence::text, held_pence::text, withdrawn_pence::text FROM creator_wallet_gbp WHERE user_id = $1`,
      [creator.id],
    );
    expect(Number(afterConcurrent.rows[0]?.available_pence ?? -1)).toBe(0);
    expect(Number(afterConcurrent.rows[0]?.held_pence ?? 0)).toBeGreaterThanOrEqual(5000);
    expect(Number(afterConcurrent.rows[0]?.withdrawn_pence ?? -1)).toBe(0);

    const { rejectHeldWithdrawal } = await import("./modules/payouts/service.js");
    const pendingRow = await getPool().query<{ id: string }>(
      `SELECT id::text AS id FROM withdrawals_gbp WHERE user_id = $1 AND status = 'pending' ORDER BY created_at DESC LIMIT 1`,
      [creator.id],
    );
    await rejectHeldWithdrawal(pendingRow.rows[0].id, creator.id);
    const afterReject = await authJson("/api/creator/balance", creator.token);
    expect((afterReject.body.gbp as { available_pence?: number }).available_pence).toBeGreaterThan(0);
    const rejected = await getPool().query<{ status: string }>(
      `SELECT status FROM withdrawals_gbp WHERE id = $1`,
      [pendingRow.rows[0].id],
    );
    expect(rejected.rows[0]?.status).toBe("rejected");

    const isolated = await authJson("/api/creator/balance", other.token);
    expect(isolated.body).toMatchObject({
      gbp: { available_pence: 0, pending_pence: 0, held_pence: 0 },
    });
    expect((await authJson("/api/creator/withdrawals-gbp", other.token)).body).toEqual({ withdrawals: [] });

    const onboard = await authJson("/api/creator/payout-account/onboard", creator.token, {
      method: "POST",
      body: JSON.stringify({ accountId: "acct_forged", stripeAccountId: "acct_forged" }),
    });
    expect(onboard.status).toBe(503);
    const forgedAccount = await getPool().query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM payout_accounts WHERE user_id = $1 AND stripe_account_id = 'acct_forged'`,
      [creator.id],
    );
    expect(forgedAccount.rows[0]?.n).toBe(0);
    const connect = await authJson("/api/creator/payout-account", creator.token);
    expect(connect.status).toBe(200);
    expect(connect.body).toMatchObject({ payouts_enabled: false, ok: true });

    const wallet = await authJson("/api/wallet", sender.token);
    expect(wallet.status).toBe(200);
    expect(wallet.body).toMatchObject({
      user_id: sender.id,
    });
    expect(typeof wallet.body.coin_balance).toBe("number");
    expect(wallet.body.gbp).toBeUndefined();

    await getPool().query(
      `INSERT INTO processed_purchases (user_id, provider, product_id, provider_txn_id, coins, status, created_at)
       VALUES ($1, 'google', 'coins1000', $2, 10, 'credited', NOW() - INTERVAL '1 day')`,
      [sender.id, `p45-refund-${sender.id}`],
    );
    const { reverseIapPurchase } = await import("./modules/iap/reverse.js");
    const reversed = await reverseIapPurchase("google", `p45-refund-${sender.id}`);
    expect(reversed.reversed).toBe(true);
    const afterReverse = await authJson("/api/creator/balance", creator.token);
    const gbp = afterReverse.body.gbp as { reversed_pence?: number };
    expect((gbp.reversed_pence ?? 0) >= 60).toBe(true);
  }, 60_000);

  it("PAGE-046 report submit uses session reporter and rejects the retired path", async ({ skip }) => {
    if (!db || !base) {
      skip();
      return;
    }

    async function registerIsolated(prefix: string) {
      const username = `${prefix}${Math.random().toString(36).slice(2, 10)}`.slice(0, 12);
      const res = await fetch(`${base}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: `${username}@example.com`,
          username,
          password: "password12",
          ageConfirmed13Plus: true,
          consentVersion: "2026-07-21",
        }),
      });
      const body = (await res.json()) as { token?: string; user?: { id?: string } };
      expect(res.status).toBe(201);
      return { id: String(body.user?.id ?? ""), token: accessTokenFromLogin(body), username };
    }

    async function authJson(pathName: string, userToken: string, init: RequestInit = {}) {
      const res = await fetch(`${base}${pathName}`, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userToken}`,
          ...(init.headers as Record<string, string> | undefined),
        },
      });
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      return { status: res.status, body, cache: res.headers.get("cache-control") };
    }

    expect((await fetch(`${base}/api/report`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).status).toBe(401);
    expect((await fetch(`${base}/api/reports`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).status).toBe(404);

    const reporter = await registerIsolated("p46a");
    const other = await registerIsolated("p46b");
    const invalid = await authJson("/api/report", reporter.token, {
      method: "POST",
      body: JSON.stringify({
        targetKind: "user",
        targetId: other.id,
        reason: "spam",
      }),
    });
    expect(invalid.status).toBe(400);

    const forged = await authJson("/api/report", reporter.token, {
      method: "POST",
      body: JSON.stringify({
        targetType: "user",
        targetId: other.id,
        reason: "spam",
        details: "impersonation concern",
        reporter_id: other.id,
      }),
    });
    expect(forged.status).toBe(200);
    expect(forged.cache).toMatch(/no-store/);
    expect(forged.body).toMatchObject({ ok: true });
    expect(typeof forged.body.id).toBe("string");

    const stored = await getPool().query<{
      reporter_id: string;
      target_kind: string;
      target_id: string;
      reason: string;
      details: string;
      status: string;
    }>(
      `SELECT reporter_id::text AS reporter_id, target_kind, target_id, reason, details, status
       FROM reports WHERE id = $1`,
      [forged.body.id],
    );
    expect(stored.rows[0]).toMatchObject({
      reporter_id: reporter.id,
      target_kind: "user",
      target_id: other.id,
      reason: "spam",
      details: "impersonation concern",
      status: "open",
    });

    const support = await authJson("/api/report", reporter.token, {
      method: "POST",
      body: JSON.stringify({
        targetType: "support",
        targetId: "support_ticket",
        reason: "other",
        details: "",
      }),
    });
    expect(support.status).toBe(200);

    const isolated = await getPool().query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM reports WHERE reporter_id = $1`,
      [other.id],
    );
    expect(isolated.rows[0]?.n).toBe(0);
  });

  it("PAGE-047 engagement hub is flag-gated, session-owned, and unmerged from wallet/payout", async ({ skip }) => {
    if (!db || !base) {
      skip();
      return;
    }

    async function registerIsolated(prefix: string) {
      const username = `${prefix}${Math.random().toString(36).slice(2, 10)}`.slice(0, 12);
      const res = await fetch(`${base}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: `${username}@example.com`,
          username,
          password: "password12",
          ageConfirmed13Plus: true,
          consentVersion: "2026-07-21",
        }),
      });
      const body = (await res.json()) as { token?: string; user?: { id?: string } };
      expect(res.status).toBe(201);
      return { id: String(body.user?.id ?? ""), token: accessTokenFromLogin(body) };
    }

    async function authJson(pathName: string, userToken: string, init: RequestInit = {}) {
      const res = await fetch(`${base}${pathName}`, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userToken}`,
          ...(init.headers as Record<string, string> | undefined),
        },
      });
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      return { status: res.status, body, cache: res.headers.get("cache-control") };
    }

    const previous = process.env.ENGAGEMENT_HUB_ENABLED;
    delete process.env.ENGAGEMENT_HUB_ENABLED;
    delete process.env.VITE_ENGAGEMENT_HUB_ENABLED;
    expect((await fetch(`${base}/api/engagement/hub`)).status).toBe(401);
    const viewer = await registerIsolated("p47a");
    const other = await registerIsolated("p47b");
    expect((await authJson("/api/engagement/hub", viewer.token)).status).toBe(404);

    process.env.ENGAGEMENT_HUB_ENABLED = "true";
    const empty = await authJson("/api/engagement/hub", viewer.token);
    expect(empty.status).toBe(200);
    expect(empty.cache).toMatch(/no-store/);
    expect(empty.body).toMatchObject({
      hub: {
        promotional_coins: 0,
        battle_energy: 0,
        total_xp: 0,
        fan_level: 0,
        fan_tier: "Bronze Fan",
        starter_coin_balance: 50000,
      },
    });
    expect(empty.body.coin_balance).toBeUndefined();
    const hub = empty.body.hub as { daily_login?: { can_claim?: boolean }; missions_open?: number };
    expect(hub.daily_login?.can_claim).toBe(true);
    expect((hub.missions_open ?? -1) >= 0).toBe(true);

    await getPool().query(`UPDATE wallet_balances SET promo_coins = 9, paid_coins = 40 WHERE user_id = $1`, [viewer.id]);
    const level12 = await getPool().query<{ total_xp_required: string }>(
      `SELECT total_xp_required::text AS total_xp_required FROM xp_level_requirements WHERE level = 12`,
    );
    const xp12 = Number(level12.rows[0]?.total_xp_required ?? 0);
    expect(xp12).toBeGreaterThan(0);
    await getPool().query(`UPDATE user_engagement SET total_xp = $2, battle_energy = 8 WHERE user_id = $1`, [
      viewer.id,
      xp12,
    ]);
    const loaded = await authJson("/api/engagement/hub", viewer.token);
    expect(loaded.body).toMatchObject({
      hub: {
        promotional_coins: 9,
        battle_energy: 8,
        total_xp: xp12,
        fan_level: 12,
        fan_tier: "Silver Fan",
      },
    });

    const wallet = await authJson("/api/wallet", viewer.token);
    expect(wallet.status).toBe(200);
    expect(wallet.body).toMatchObject({
      user_id: viewer.id,
      promotional_balance: 9,
    });
    expect(wallet.body.total_xp).toBeUndefined();
    expect(wallet.body.battle_energy).toBeUndefined();
    expect(wallet.body.fan_tier).toBeUndefined();

    const isolated = await authJson("/api/engagement/hub", other.token);
    expect(isolated.body).toMatchObject({
      hub: {
        promotional_coins: 0,
        battle_energy: 0,
        total_xp: 0,
        fan_level: 0,
        fan_tier: "Bronze Fan",
      },
    });

    const payout = await authJson("/api/creator/balance", viewer.token);
    expect(payout.status).toBe(200);
    expect(payout.body).toMatchObject({
      gbp: { available_pence: 0, pending_pence: 0, held_pence: 0 },
    });

    if (previous == null) delete process.env.ENGAGEMENT_HUB_ENABLED;
    else process.env.ENGAGEMENT_HUB_ENABLED = previous;
  });

  it("PAGE-048 missions list, progress, claim once, and money isolation", async ({ skip }) => {
    if (!db || !base) {
      skip();
      return;
    }

    async function registerIsolated(prefix: string) {
      const username = `${prefix}${Math.random().toString(36).slice(2, 10)}`.slice(0, 12);
      const res = await fetch(`${base}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: `${username}@example.com`,
          username,
          password: "password12",
          ageConfirmed13Plus: true,
          consentVersion: "2026-07-21",
        }),
      });
      const body = (await res.json()) as { token?: string; user?: { id?: string } };
      expect(res.status).toBe(201);
      return { id: String(body.user?.id ?? ""), token: accessTokenFromLogin(body) };
    }

    async function authJson(pathName: string, userToken: string, init: RequestInit = {}) {
      const res = await fetch(`${base}${pathName}`, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userToken}`,
          ...(init.headers as Record<string, string> | undefined),
        },
      });
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      return { status: res.status, body, cache: res.headers.get("cache-control") };
    }

    const previous = process.env.ENGAGEMENT_HUB_ENABLED;
    delete process.env.ENGAGEMENT_HUB_ENABLED;
    delete process.env.VITE_ENGAGEMENT_HUB_ENABLED;
    expect((await fetch(`${base}/api/engagement/missions`)).status).toBe(401);
    const viewer = await registerIsolated("p48a");
    const other = await registerIsolated("p48b");
    const creator = await registerIsolated("p48c");
    expect((await authJson("/api/engagement/missions", viewer.token)).status).toBe(404);

    process.env.ENGAGEMENT_HUB_ENABLED = "true";
    const listed = await authJson("/api/engagement/missions", viewer.token);
    expect(listed.status).toBe(200);
    expect(listed.cache).toMatch(/no-store/);
    const missions = listed.body.missions as Array<Record<string, unknown>>;
    expect(Array.isArray(missions)).toBe(true);
    expect(missions.some((row) => row.id === "daily_like")).toBe(true);
    expect(missions.every((row) => row.claimed === false)).toBe(true);
    expect(listed.body.items).toBeUndefined();

    const incomplete = await authJson("/api/engagement/missions/daily_like/claim", viewer.token, { method: "POST" });
    expect(incomplete.status).toBe(400);
    const missing = await authJson("/api/engagement/missions/not-a-mission/claim", viewer.token, { method: "POST" });
    expect(missing.status).toBe(404);

    const video = await getPool().query<{ id: string }>(
      `INSERT INTO videos (user_id, bunny_path, caption, privacy) VALUES ($1, 'https://cdn.example/p48.mp4', 'p48', 'public') RETURNING id`,
      [creator.id],
    );
    const like = await authJson(`/api/videos/${video.rows[0].id}/like`, viewer.token, { method: "POST" });
    expect(like.status).toBe(200);
    await authJson(`/api/videos/${video.rows[0].id}/like`, viewer.token, { method: "POST" });
    const afterLike = await authJson("/api/engagement/missions", viewer.token);
    const liked = (afterLike.body.missions as Array<Record<string, unknown>>).find((row) => row.id === "daily_like");
    expect(liked).toMatchObject({ progress: 1, completed: false, claimed: false });

    const view = await authJson("/api/feed/track-view", viewer.token, {
      method: "POST",
      body: JSON.stringify({ videoId: video.rows[0].id, watchTime: 3 }),
    });
    expect(view.body.counted).toBe(true);
    await authJson("/api/feed/track-view", viewer.token, {
      method: "POST",
      body: JSON.stringify({ videoId: video.rows[0].id, watchTime: 3 }),
    });
    const afterWatch = await authJson("/api/engagement/missions", viewer.token);
    const watched = (afterWatch.body.missions as Array<Record<string, unknown>>).find((row) => row.id === "daily_watch");
    expect(watched).toMatchObject({ progress: 1, completed: false });

    await getPool().query(
      `INSERT INTO user_mission_progress (user_id, mission_id, period_key, progress, claimed)
       VALUES ($1, 'daily_like', $2, 5, FALSE)
       ON CONFLICT (user_id, mission_id, period_key) DO UPDATE SET progress = 5, claimed = FALSE`,
      [viewer.id, new Date().toISOString().slice(0, 10)],
    );
    await getPool().query(
      `UPDATE engagement_missions SET reward_xp = 6, reward_energy = 2 WHERE id = 'daily_like'`,
    );
    const walletBefore = await authJson("/api/wallet", viewer.token);
    const paidBefore = Number(walletBefore.body.coin_balance ?? 0);
    const promoBefore = Number(walletBefore.body.promotional_balance ?? 0);
    const starterBefore = Number(walletBefore.body.starter_balance ?? 0);

    const claimed = await authJson("/api/engagement/missions/daily_like/claim", viewer.token, {
      method: "POST",
      body: JSON.stringify({ userId: other.id }),
    });
    expect(claimed.status).toBe(200);
    expect(claimed.body).toMatchObject({ ok: true });

    const retry = await authJson("/api/engagement/missions/daily_like/claim", viewer.token, { method: "POST" });
    expect(retry.status).toBe(200);
    expect(retry.body).toMatchObject({ ok: true });

    const walletAfter = await authJson("/api/wallet", viewer.token);
    expect(walletAfter.body).toMatchObject({
      coin_balance: paidBefore,
      starter_balance: starterBefore,
      promotional_balance: promoBefore + 10,
    });
    const xp = await getPool().query<{ total_xp: string; battle_energy: string }>(
      `SELECT total_xp::text, battle_energy::text FROM user_engagement WHERE user_id = $1`,
      [viewer.id],
    );
    expect(Number(xp.rows[0]?.total_xp ?? 0)).toBe(6);
    expect(Number(xp.rows[0]?.battle_energy ?? 0)).toBe(2);

    const isolated = await authJson("/api/engagement/missions", other.token);
    const otherLike = (isolated.body.missions as Array<Record<string, unknown>>).find((row) => row.id === "daily_like");
    expect(otherLike).toMatchObject({ progress: 0, claimed: false });

    await getPool().query(
      `INSERT INTO user_mission_progress (user_id, mission_id, period_key, progress, claimed)
       VALUES ($1, 'daily_gift', $2, 1, FALSE)
       ON CONFLICT (user_id, mission_id, period_key) DO UPDATE SET progress = 1, claimed = FALSE`,
      [viewer.id, new Date().toISOString().slice(0, 10)],
    );
    const [firstGift, secondGift] = await Promise.all([
      authJson("/api/engagement/missions/daily_gift/claim", viewer.token, { method: "POST" }),
      authJson("/api/engagement/missions/daily_gift/claim", viewer.token, { method: "POST" }),
    ]);
    expect([firstGift.status, secondGift.status].every((status) => status === 200)).toBe(true);
    const walletGift = await authJson("/api/wallet", viewer.token);
    expect(walletGift.body.promotional_balance).toBe(promoBefore + 10 + 20);
    expect(walletGift.body.coin_balance).toBe(paidBefore);

    const hub = await authJson("/api/engagement/hub", viewer.token);
    expect(hub.body).toMatchObject({
      hub: {
        promotional_coins: promoBefore + 30,
        total_xp: 6,
        battle_energy: 2,
      },
    });

    const payout = await authJson("/api/creator/balance", viewer.token);
    expect(payout.body).toMatchObject({
      gbp: { available_pence: 0, pending_pence: 0, held_pence: 0 },
    });

    await getPool().query(`UPDATE engagement_missions SET reward_xp = 0, reward_energy = 0 WHERE id = 'daily_like'`);

    if (previous == null) delete process.env.ENGAGEMENT_HUB_ENABLED;
    else process.env.ENGAGEMENT_HUB_ENABLED = previous;
  });

  it("PAGE-049 fan level is flag-gated, XP-derived, and unmerged from wallet/payout", async ({ skip }) => {
    if (!db || !base) {
      skip();
      return;
    }

    async function registerIsolated(prefix: string) {
      const username = `${prefix}${Math.random().toString(36).slice(2, 10)}`.slice(0, 12);
      const res = await fetch(`${base}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: `${username}@example.com`,
          username,
          password: "password12",
          ageConfirmed13Plus: true,
          consentVersion: "2026-07-21",
        }),
      });
      const body = (await res.json()) as { token?: string; user?: { id?: string } };
      expect(res.status).toBe(201);
      return { id: String(body.user?.id ?? ""), token: accessTokenFromLogin(body) };
    }

    async function authJson(pathName: string, userToken: string, init: RequestInit = {}) {
      const res = await fetch(`${base}${pathName}`, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userToken}`,
          ...(init.headers as Record<string, string> | undefined),
        },
      });
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      return { status: res.status, body, cache: res.headers.get("cache-control") };
    }

    const previous = process.env.ENGAGEMENT_HUB_ENABLED;
    delete process.env.ENGAGEMENT_HUB_ENABLED;
    delete process.env.VITE_ENGAGEMENT_HUB_ENABLED;
    expect((await fetch(`${base}/api/engagement/fan-level`)).status).toBe(401);
    const viewer = await registerIsolated("p49a");
    const other = await registerIsolated("p49b");
    expect((await authJson("/api/engagement/fan-level", viewer.token)).status).toBe(404);
    expect((await authJson("/api/engagement/fan-level", viewer.token, { method: "POST" })).status).not.toBe(200);

    process.env.ENGAGEMENT_HUB_ENABLED = "true";
    const empty = await authJson("/api/engagement/fan-level", viewer.token);
    expect(empty.status).toBe(200);
    expect(empty.cache).toMatch(/no-store/);
    expect(empty.body).toMatchObject({
      fan_level: { level: 0, tier: "Bronze Fan", total_xp: 0 },
    });
    expect((empty.body.fan_level as { next_level_total_xp?: number | null }).next_level_total_xp).toBeGreaterThan(0);
    expect(empty.body.items).toBeUndefined();

    const curve = await getPool().query<{ level: number; total_xp_required: string }>(
      `SELECT level, total_xp_required::text AS total_xp_required
       FROM xp_level_requirements
       WHERE level IN (1, 10, 20, 300)
       ORDER BY level`,
    );
    const byLevel = Object.fromEntries(curve.rows.map((row) => [row.level, Number(row.total_xp_required)]));
    expect(byLevel[1]).toBeGreaterThan(0);

    await getPool().query(`UPDATE user_engagement SET total_xp = $2 WHERE user_id = $1`, [viewer.id, byLevel[1] - 1]);
    const below = await authJson("/api/engagement/fan-level", viewer.token);
    expect(below.body).toMatchObject({ fan_level: { level: 0, tier: "Bronze Fan", total_xp: byLevel[1] - 1 } });

    await getPool().query(`UPDATE user_engagement SET total_xp = $2 WHERE user_id = $1`, [viewer.id, byLevel[1]]);
    const exact = await authJson("/api/engagement/fan-level", viewer.token);
    expect(exact.body).toMatchObject({ fan_level: { level: 1, tier: "Bronze Fan", total_xp: byLevel[1] } });

    await getPool().query(`UPDATE user_engagement SET total_xp = $2 WHERE user_id = $1`, [viewer.id, byLevel[10]]);
    const silver = await authJson("/api/engagement/fan-level", viewer.token);
    expect(silver.body).toMatchObject({ fan_level: { level: 10, tier: "Silver Fan", total_xp: byLevel[10] } });
    const hub = await authJson("/api/engagement/hub", viewer.token);
    expect(hub.body).toMatchObject({
      hub: { total_xp: byLevel[10], fan_level: 10, fan_tier: "Silver Fan" },
    });

    await getPool().query(`UPDATE user_engagement SET total_xp = $2 WHERE user_id = $1`, [viewer.id, byLevel[20]]);
    const jump = await authJson("/api/engagement/fan-level", viewer.token);
    expect(jump.body).toMatchObject({ fan_level: { level: 20, tier: "Gold Fan", total_xp: byLevel[20] } });

    await getPool().query(`UPDATE user_engagement SET total_xp = $2 WHERE user_id = $1`, [viewer.id, byLevel[300]]);
    const max = await authJson("/api/engagement/fan-level", viewer.token);
    expect(max.body).toMatchObject({
      fan_level: { level: 300, tier: "Legend Fan", total_xp: byLevel[300], next_level_total_xp: null, xp_to_next_level: null },
    });

    await getPool().query(`UPDATE user_engagement SET total_xp = 0, battle_energy = 0 WHERE user_id = $1`, [viewer.id]);
    await getPool().query(
      `INSERT INTO user_mission_progress (user_id, mission_id, period_key, progress, claimed)
       VALUES ($1, 'daily_like', $2, 5, FALSE)
       ON CONFLICT (user_id, mission_id, period_key) DO UPDATE SET progress = 5, claimed = FALSE`,
      [viewer.id, new Date().toISOString().slice(0, 10)],
    );
    await getPool().query(`UPDATE engagement_missions SET reward_xp = 6, reward_energy = 2 WHERE id = 'daily_like'`);
    const walletBefore = await authJson("/api/wallet", viewer.token);
    const paidBefore = Number(walletBefore.body.coin_balance ?? 0);
    const claimed = await authJson("/api/engagement/missions/daily_like/claim", viewer.token, { method: "POST" });
    expect(claimed.status).toBe(200);
    const afterClaim = await authJson("/api/engagement/fan-level", viewer.token);
    expect(afterClaim.body).toMatchObject({ fan_level: { total_xp: 6, level: 0, tier: "Bronze Fan" } });
    const walletAfter = await authJson("/api/wallet", viewer.token);
    expect(walletAfter.body.coin_balance).toBe(paidBefore);
    const payout = await authJson("/api/creator/balance", viewer.token);
    expect(payout.body).toMatchObject({ gbp: { available_pence: 0, pending_pence: 0 } });

    const isolated = await authJson("/api/engagement/fan-level", other.token);
    expect(isolated.body).toMatchObject({ fan_level: { level: 0, total_xp: 0, tier: "Bronze Fan" } });

    await getPool().query(`UPDATE engagement_missions SET reward_xp = 0, reward_energy = 0 WHERE id = 'daily_like'`);
    if (previous == null) delete process.env.ENGAGEMENT_HUB_ENABLED;
    else process.env.ENGAGEMENT_HUB_ENABLED = previous;
  });

  it("PAGE-050 MVP board is flag-gated, gift-authored, and isolated from money", async ({ skip }) => {
    if (!db || !base) {
      skip();
      return;
    }

    async function registerIsolated(prefix: string) {
      const username = `${prefix}${Math.random().toString(36).slice(2, 10)}`.slice(0, 12);
      const res = await fetch(`${base}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: `${username}@example.com`,
          username,
          password: "password12",
          ageConfirmed13Plus: true,
          consentVersion: "2026-07-21",
        }),
      });
      const body = (await res.json()) as { token?: string; user?: { id?: string } };
      expect(res.status).toBe(201);
      return { id: String(body.user?.id ?? ""), token: accessTokenFromLogin(body) };
    }

    async function authJson(pathName: string, userToken: string, init: RequestInit = {}) {
      const res = await fetch(`${base}${pathName}`, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userToken}`,
          ...(init.headers as Record<string, string> | undefined),
        },
      });
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      return { status: res.status, body, cache: res.headers.get("cache-control") };
    }

    const previous = process.env.ENGAGEMENT_HUB_ENABLED;
    delete process.env.ENGAGEMENT_HUB_ENABLED;
    delete process.env.VITE_ENGAGEMENT_HUB_ENABLED;
    expect((await fetch(`${base}/api/engagement/mvp`)).status).toBe(401);
    const viewer = await registerIsolated("p50a");
    const other = await registerIsolated("p50b");
    const creator = await registerIsolated("p50c");
    expect((await authJson("/api/engagement/mvp", viewer.token)).status).toBe(404);
    expect((await authJson("/api/engagement/mvp", viewer.token, { method: "POST" })).status).not.toBe(200);

    process.env.ENGAGEMENT_HUB_ENABLED = "true";
    await getPool().query(`DELETE FROM mvp_scores`);
    const empty = await authJson("/api/engagement/mvp", viewer.token);
    expect(empty.status).toBe(200);
    expect(empty.cache).toMatch(/no-store/);
    expect(empty.body).toMatchObject({ period: "today", leaderboard: [], viewer_id: viewer.id });
    expect(empty.body.items).toBeUndefined();

    await getPool().query(
      `INSERT INTO mvp_scores (user_id, room_id, points, source, day_key)
       VALUES ($1, 'room-a', 9, 'paid_gift', CURRENT_DATE),
              ($2, 'room-a', 3, 'paid_gift', CURRENT_DATE - 3),
              ($2, 'room-a', 1, 'paid_gift', CURRENT_DATE - 20)`,
      [viewer.id, other.id],
    );
    const today = await authJson("/api/engagement/mvp?period=today", viewer.token);
    expect(today.body).toMatchObject({
      period: "today",
      viewer_id: viewer.id,
      leaderboard: [{ rank: 1, user_id: viewer.id, points: 9 }],
    });
    const week = await authJson("/api/engagement/mvp?period=week", viewer.token);
    const weekRows = week.body.leaderboard as Array<{ user_id: string; points: number }>;
    expect(weekRows.find((row) => row.user_id === viewer.id)?.points).toBe(9);
    expect(weekRows.find((row) => row.user_id === other.id)?.points).toBe(3);
    const all = await authJson("/api/engagement/mvp?period=all&userId=" + other.id, viewer.token);
    expect(all.body).toMatchObject({ period: "all", viewer_id: viewer.id });
    const allRows = all.body.leaderboard as Array<{ user_id: string; points: number }>;
    expect(allRows.find((row) => row.user_id === other.id)?.points).toBe(4);

    const stream = await getPool().query<{ id: string }>(
      `INSERT INTO live_streams (host_id, room_id, title) VALUES ($1, $2, 'p50') RETURNING id::text AS id`,
      [creator.id, `p50-${creator.id}`],
    );
    const streamId = stream.rows[0].id;
    const xpBefore = await authJson("/api/engagement/fan-level", viewer.token);
    const energyBefore = (await authJson("/api/engagement/hub", viewer.token)).body.hub as { battle_energy?: number };
    await getPool().query(`UPDATE wallet_balances SET promo_coins = promo_coins + 2, paid_coins = paid_coins + 2 WHERE user_id = $1`, [
      viewer.id,
    ]);
    await getPool().query(
      `INSERT INTO paid_coin_lots (
         user_id, provider, provider_txn_id, product_id, coins_original, coins_remaining, gross_pence, settlement_status
       ) VALUES ($1, 'google', $2, 'coins1000', 2, 2, 200, 'settled')`,
      [viewer.id, `p50-lot-${viewer.id}`],
    );
    const promoGift = await authJson("/api/gifts/send", viewer.token, {
      method: "POST",
      body: JSON.stringify({
        giftId: "rose",
        recipientId: creator.id,
        streamId,
        idempotencyKey: crypto.randomUUID(),
        bucket: "promo",
      }),
    });
    expect(promoGift.status).toBe(200);
    const afterPromo = await authJson("/api/engagement/mvp?period=today", viewer.token);
    expect((afterPromo.body.leaderboard as Array<{ points: number }>)[0]?.points).toBe(10);

    const starterGift = await authJson("/api/gifts/send", viewer.token, {
      method: "POST",
      body: JSON.stringify({
        giftId: "rose",
        recipientId: creator.id,
        streamId,
        idempotencyKey: crypto.randomUUID(),
        bucket: "starter",
      }),
    });
    expect(starterGift.status).toBe(200);
    const afterStarter = await authJson("/api/engagement/mvp?period=today", viewer.token);
    expect((afterStarter.body.leaderboard as Array<{ points: number }>)[0]?.points).toBe(10);

    const paidKey = crypto.randomUUID();
    const paidGift = await authJson("/api/gifts/send", viewer.token, {
      method: "POST",
      body: JSON.stringify({
        giftId: "rose",
        recipientId: creator.id,
        streamId,
        idempotencyKey: paidKey,
        bucket: "paid",
      }),
    });
    expect(paidGift.status).toBe(200);
    await authJson("/api/gifts/send", viewer.token, {
      method: "POST",
      body: JSON.stringify({
        giftId: "rose",
        recipientId: creator.id,
        streamId,
        idempotencyKey: paidKey,
        bucket: "paid",
      }),
    });
    const afterPaid = await authJson("/api/engagement/mvp?period=today", viewer.token);
    expect((afterPaid.body.leaderboard as Array<{ points: number }>)[0]?.points).toBe(11);

    const testGift = await authJson("/api/gifts/send", viewer.token, {
      method: "POST",
      body: JSON.stringify({
        giftId: "rose",
        recipientId: creator.id,
        streamId,
        idempotencyKey: crypto.randomUUID(),
        bucket: "test",
      }),
    });
    expect([200, 400, 503]).toContain(testGift.status);
    const afterTest = await authJson("/api/engagement/mvp?period=today", viewer.token);
    expect((afterTest.body.leaderboard as Array<{ points: number }>)[0]?.points).toBe(11);

    const xpAfter = await authJson("/api/engagement/fan-level", viewer.token);
    expect((xpAfter.body.fan_level as { total_xp?: number }).total_xp).toBe(
      ((xpBefore.body.fan_level as { total_xp?: number }).total_xp ?? 0) + 450,
    );
    const energyAfter = (await authJson("/api/engagement/hub", viewer.token)).body.hub as { battle_energy?: number };
    expect(energyAfter.battle_energy).toBe(energyBefore.battle_energy);
    const otherBoard = await authJson("/api/engagement/mvp?period=today", other.token);
    expect(otherBoard.body).toMatchObject({ viewer_id: other.id });
    expect((otherBoard.body.leaderboard as Array<{ user_id: string }>)[0]?.user_id).toBe(viewer.id);

    if (previous == null) delete process.env.ENGAGEMENT_HUB_ENABLED;
    else process.env.ENGAGEMENT_HUB_ENABLED = previous;
  });

  it("PAGE-051 achievements are flag-gated, server-authored, and isolated from money", async ({ skip }) => {
    if (!db || !base) {
      skip();
      return;
    }

    async function registerIsolated(prefix: string) {
      const username = `${prefix}${Math.random().toString(36).slice(2, 10)}`.slice(0, 12);
      const res = await fetch(`${base}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: `${username}@example.com`,
          username,
          password: "password12",
          ageConfirmed13Plus: true,
          consentVersion: "2026-07-21",
        }),
      });
      const body = (await res.json()) as { token?: string; user?: { id?: string } };
      expect(res.status).toBe(201);
      return { id: String(body.user?.id ?? ""), token: accessTokenFromLogin(body) };
    }

    async function authJson(pathName: string, userToken: string, init: RequestInit = {}) {
      const res = await fetch(`${base}${pathName}`, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userToken}`,
          ...(init.headers as Record<string, string> | undefined),
        },
      });
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      return { status: res.status, body, cache: res.headers.get("cache-control") };
    }

    const previous = process.env.ENGAGEMENT_HUB_ENABLED;
    delete process.env.ENGAGEMENT_HUB_ENABLED;
    delete process.env.VITE_ENGAGEMENT_HUB_ENABLED;
    expect((await fetch(`${base}/api/engagement/achievements`)).status).toBe(401);
    const viewer = await registerIsolated("p51a");
    const other = await registerIsolated("p51b");
    const creator = await registerIsolated("p51c");
    expect((await authJson("/api/engagement/achievements", viewer.token)).status).toBe(404);
    expect((await authJson("/api/engagement/achievements", viewer.token, { method: "POST" })).status).not.toBe(200);
    expect(
      (
        await authJson("/api/engagement/achievements/first_gift/unlock", viewer.token, {
          method: "POST",
          body: JSON.stringify({ unlocked: true, progress: 100, completed: true }),
        })
      ).status,
    ).not.toBe(200);

    process.env.ENGAGEMENT_HUB_ENABLED = "true";
    const listed = await authJson("/api/engagement/achievements?userId=" + other.id, viewer.token);
    expect(listed.status).toBe(200);
    expect(listed.cache).toMatch(/no-store/);
    expect(listed.body.items).toBeUndefined();
    const catalog = listed.body.achievements as Array<Record<string, unknown>>;
    expect(catalog.map((row) => row.id)).toEqual([
      "first_battle",
      "first_gift",
      "energy_master",
      "mvp_top10",
      "streak_7",
      "watch_100",
    ]);
    expect(catalog.some((row) => row.id === "likes_50" || row.id === "gifts_10")).toBe(false);
    expect(catalog.every((row) => row.progress === 0 && row.unlocked === false && row.claimed === false)).toBe(true);
    expect(catalog.find((row) => row.id === "first_gift")).toMatchObject({
      name: "First Gift",
      goal_count: 1,
      reward_xp: 50,
      reward_promo_coins: 100,
      rarity: "common",
    });

    const video = await getPool().query<{ id: string }>(
      `INSERT INTO videos (user_id, bunny_path, caption, privacy) VALUES ($1, 'https://cdn.example/p51.mp4', 'p51', 'public') RETURNING id`,
      [creator.id],
    );
    expect((await authJson(`/api/videos/${video.rows[0].id}/like`, viewer.token, { method: "POST" })).status).toBe(200);
    expect(
      (
        await authJson("/api/feed/track-view", viewer.token, {
          method: "POST",
          body: JSON.stringify({ videoId: video.rows[0].id, watchTime: 3 }),
        })
      ).body.counted,
    ).toBe(true);
    const afterSocial = await authJson("/api/engagement/achievements", viewer.token);
    expect(
      (afterSocial.body.achievements as Array<Record<string, unknown>>).find((row) => row.id === "first_gift"),
    ).toMatchObject({ progress: 0, unlocked: false });

    const stream = await getPool().query<{ id: string }>(
      `INSERT INTO live_streams (host_id, room_id, title) VALUES ($1, $2, 'p51') RETURNING id::text AS id`,
      [creator.id, `p51-${creator.id}`],
    );
    const streamId = stream.rows[0].id;
    await getPool().query(`UPDATE wallet_balances SET promo_coins = promo_coins + 3, paid_coins = paid_coins + 2 WHERE user_id = $1`, [
      viewer.id,
    ]);
    await getPool().query(
      `INSERT INTO paid_coin_lots (
         user_id, provider, provider_txn_id, product_id, coins_original, coins_remaining, gross_pence, settlement_status
       ) VALUES ($1, 'google', $2, 'coins1000', 2, 2, 200, 'settled')`,
      [viewer.id, `p51-lot-${viewer.id}`],
    );
    const walletBefore = await authJson("/api/wallet", viewer.token);
    const paidBefore = Number(walletBefore.body.coin_balance ?? 0);
    const promoBefore = Number(walletBefore.body.promotional_balance ?? 0);
    const starterBefore = Number(walletBefore.body.starter_balance ?? 0);
    const xpBefore = await authJson("/api/engagement/fan-level", viewer.token);
    const hubBefore = (await authJson("/api/engagement/hub", viewer.token)).body.hub as {
      battle_energy?: number;
      total_xp?: number;
    };

    const starterGift = await authJson("/api/gifts/send", viewer.token, {
      method: "POST",
      body: JSON.stringify({
        giftId: "rose",
        recipientId: creator.id,
        streamId,
        idempotencyKey: crypto.randomUUID(),
        bucket: "starter",
      }),
    });
    expect(starterGift.status).toBe(200);
    const afterStarter = await authJson("/api/engagement/achievements", viewer.token);
    expect(
      (afterStarter.body.achievements as Array<Record<string, unknown>>).find((row) => row.id === "first_gift"),
    ).toMatchObject({ progress: 0, unlocked: false, claimed: false });

    const testGift = await authJson("/api/gifts/send", viewer.token, {
      method: "POST",
      body: JSON.stringify({
        giftId: "rose",
        recipientId: creator.id,
        streamId,
        idempotencyKey: crypto.randomUUID(),
        bucket: "test",
      }),
    });
    expect([200, 400, 503]).toContain(testGift.status);
    expect(
      ((await authJson("/api/engagement/achievements", viewer.token)).body.achievements as Array<Record<string, unknown>>).find(
        (row) => row.id === "first_gift",
      ),
    ).toMatchObject({ progress: 0, unlocked: false });

    await Promise.all([
      bumpAchievement(viewer.id, "gifts_sent", 1),
      bumpAchievement(viewer.id, "gifts_sent", 1),
    ]);
    const afterBump = await authJson("/api/engagement/achievements", viewer.token);
    expect(afterBump.body.achievements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "first_gift",
          progress: 1,
          unlocked: true,
          claimed: true,
          reward_xp: 50,
          reward_promo_coins: 100,
        }),
      ]),
    );
    const walletAfterGiftAch = await authJson("/api/wallet", viewer.token);
    expect(walletAfterGiftAch.body).toMatchObject({
      coin_balance: paidBefore,
      starter_balance: starterBefore - (starterGift.status === 200 ? 1 : 0),
      promotional_balance: promoBefore + 100,
    });
    const xpAfterGift = await authJson("/api/engagement/fan-level", viewer.token);
    expect((xpAfterGift.body.fan_level as { total_xp?: number }).total_xp).toBe(
      ((xpBefore.body.fan_level as { total_xp?: number }).total_xp ?? 0) + 50,
    );

    const promoGift = await authJson("/api/gifts/send", viewer.token, {
      method: "POST",
      body: JSON.stringify({
        giftId: "rose",
        recipientId: creator.id,
        streamId,
        idempotencyKey: crypto.randomUUID(),
        bucket: "promo",
      }),
    });
    expect(promoGift.status).toBe(200);
    const afterPromo = await authJson("/api/engagement/achievements", viewer.token);
    const firstGift = (afterPromo.body.achievements as Array<Record<string, unknown>>).find((row) => row.id === "first_gift");
    const mvpTop = (afterPromo.body.achievements as Array<Record<string, unknown>>).find((row) => row.id === "mvp_top10");
    expect(firstGift).toMatchObject({ progress: 1, unlocked: true, claimed: true });
    expect(mvpTop).toMatchObject({ progress: 1, unlocked: true, claimed: true, reward_xp: 400, reward_promo_coins: 750 });
    const walletAfterMvp = await authJson("/api/wallet", viewer.token);
    expect(walletAfterMvp.body.coin_balance).toBe(paidBefore);
    expect(walletAfterMvp.body.promotional_balance).toBe(promoBefore + 100 - 1 + 750);

    const paidKey = crypto.randomUUID();
    const paidGift = await authJson("/api/gifts/send", viewer.token, {
      method: "POST",
      body: JSON.stringify({
        giftId: "rose",
        recipientId: creator.id,
        streamId,
        idempotencyKey: paidKey,
        bucket: "paid",
      }),
    });
    expect(paidGift.status).toBe(200);
    await authJson("/api/gifts/send", viewer.token, {
      method: "POST",
      body: JSON.stringify({
        giftId: "rose",
        recipientId: creator.id,
        streamId,
        idempotencyKey: paidKey,
        bucket: "paid",
      }),
    });
    const afterPaid = await authJson("/api/engagement/achievements", viewer.token);
    expect((afterPaid.body.achievements as Array<Record<string, unknown>>).find((row) => row.id === "first_gift")).toMatchObject({
      progress: 1,
      unlocked: true,
      claimed: true,
    });
    const xpAfter = await authJson("/api/engagement/fan-level", viewer.token);
    expect((xpAfter.body.fan_level as { total_xp?: number }).total_xp).toBe(
      ((xpBefore.body.fan_level as { total_xp?: number }).total_xp ?? 0) + 450,
    );
    const hubAfter = (await authJson("/api/engagement/hub", viewer.token)).body.hub as {
      battle_energy?: number;
      total_xp?: number;
    };
    expect(hubAfter.total_xp).toBe((xpAfter.body.fan_level as { total_xp?: number }).total_xp);
    expect(hubAfter.battle_energy).toBe(hubBefore.battle_energy);
    const walletFinal = await authJson("/api/wallet", viewer.token);
    expect(walletFinal.body.coin_balance).toBe(paidBefore - 1);

    const isolated = await authJson("/api/engagement/achievements", other.token);
    expect(
      (isolated.body.achievements as Array<Record<string, unknown>>).every(
        (row) => row.progress === 0 && row.unlocked === false && row.claimed === false,
      ),
    ).toBe(true);

    const payout = await authJson("/api/creator/balance", viewer.token);
    expect(payout.body).toMatchObject({
      gbp: { available_pence: 0, pending_pence: 0, held_pence: 0 },
    });

    await getPool().query(
      `INSERT INTO user_achievements (user_id, achievement_id, progress, unlocked, claimed)
       VALUES ($1, 'watch_100', -4, FALSE, FALSE)
       ON CONFLICT (user_id, achievement_id) DO UPDATE SET progress = -4`,
      [viewer.id],
    );
    const malformed = await authJson("/api/engagement/achievements", viewer.token);
    expect(malformed.status).toBe(503);

    if (previous == null) delete process.env.ENGAGEMENT_HUB_ENABLED;
    else process.env.ENGAGEMENT_HUB_ENABLED = previous;
  });

  it("PAGE-052 reward wallet is flag-gated, unmerged, and isolated from money mutation", async ({ skip }) => {
    if (!db || !base) {
      skip();
      return;
    }

    async function registerIsolated(prefix: string) {
      const username = `${prefix}${Math.random().toString(36).slice(2, 10)}`.slice(0, 12);
      const res = await fetch(`${base}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: `${username}@example.com`,
          username,
          password: "password12",
          ageConfirmed13Plus: true,
          consentVersion: "2026-07-21",
        }),
      });
      const body = (await res.json()) as { token?: string; user?: { id?: string } };
      expect(res.status).toBe(201);
      return { id: String(body.user?.id ?? ""), token: accessTokenFromLogin(body) };
    }

    async function authJson(pathName: string, userToken: string, init: RequestInit = {}) {
      const res = await fetch(`${base}${pathName}`, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userToken}`,
          ...(init.headers as Record<string, string> | undefined),
        },
      });
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      return { status: res.status, body, cache: res.headers.get("cache-control") };
    }

    const previous = process.env.ENGAGEMENT_HUB_ENABLED;
    delete process.env.ENGAGEMENT_HUB_ENABLED;
    delete process.env.VITE_ENGAGEMENT_HUB_ENABLED;
    expect((await fetch(`${base}/api/engagement/wallet`)).status).toBe(401);
    const viewer = await registerIsolated("p52a");
    const other = await registerIsolated("p52b");
    expect((await authJson("/api/engagement/wallet", viewer.token)).status).toBe(404);
    expect((await authJson("/api/engagement/wallet", viewer.token, { method: "POST" })).status).not.toBe(200);
    expect(
      (
        await authJson("/api/rewards/set-balance", viewer.token, {
          method: "POST",
          body: JSON.stringify({ purchasedCoins: 999, promotionalCoins: 999, totalXp: 999 }),
        })
      ).status,
    ).not.toBe(200);

    process.env.ENGAGEMENT_HUB_ENABLED = "true";
    const listed = await authJson("/api/engagement/wallet?userId=" + other.id, viewer.token);
    expect(listed.status).toBe(200);
    expect(listed.cache).toMatch(/no-store/);
    expect(listed.body.items).toBeUndefined();
    expect(listed.body.test_coins).toBeUndefined();
    expect(listed.body.testCoins).toBeUndefined();
    const zero = listed.body.wallet as Record<string, unknown>;
    expect(zero).toMatchObject({
      purchasedCoins: 0,
      promotionalCoins: 0,
      starterCoins: 50000,
      battleEnergy: 0,
      totalXp: 0,
      fanLevel: 0,
      totalGiftSpendable: 50000,
    });
    const page039 = await authJson("/api/wallet", viewer.token);
    expect(page039.body).toMatchObject({
      coin_balance: zero.purchasedCoins,
      starter_balance: zero.starterCoins,
      promotional_balance: zero.promotionalCoins,
    });

    await getPool().query(`UPDATE wallet_balances SET paid_coins = paid_coins + 7 WHERE user_id = $1`, [viewer.id]);
    const afterPaid = await authJson("/api/engagement/wallet", viewer.token);
    expect(afterPaid.body.wallet).toMatchObject({
      purchasedCoins: 7,
      starterCoins: 50000,
      promotionalCoins: 0,
      battleEnergy: 0,
      totalXp: 0,
      totalGiftSpendable: 50007,
    });
    expect((await authJson("/api/wallet", viewer.token)).body.coin_balance).toBe(7);

    await getPool().query(
      `INSERT INTO user_mission_progress (user_id, mission_id, period_key, progress, claimed)
       VALUES ($1, 'daily_like', $2, 5, FALSE)
       ON CONFLICT (user_id, mission_id, period_key) DO UPDATE SET progress = 5, claimed = FALSE`,
      [viewer.id, new Date().toISOString().slice(0, 10)],
    );
    await getPool().query(`UPDATE engagement_missions SET reward_xp = 6, reward_energy = 2 WHERE id = 'daily_like'`);
    const claimed = await authJson("/api/engagement/missions/daily_like/claim", viewer.token, { method: "POST" });
    expect(claimed.status).toBe(200);
    const afterMission = await authJson("/api/engagement/wallet", viewer.token);
    expect(afterMission.body.wallet).toMatchObject({
      purchasedCoins: 7,
      starterCoins: 50000,
      promotionalCoins: 10,
      battleEnergy: 2,
      totalXp: 6,
      totalGiftSpendable: 50017,
    });

    await bumpAchievement(viewer.id, "gifts_sent", 1);
    const afterAch = await authJson("/api/engagement/wallet", viewer.token);
    expect(afterAch.body.wallet).toMatchObject({
      purchasedCoins: 7,
      starterCoins: 50000,
      promotionalCoins: 110,
      battleEnergy: 2,
      totalXp: 56,
      totalGiftSpendable: 50117,
    });
    const fan = await authJson("/api/engagement/fan-level", viewer.token);
    expect((fan.body.fan_level as { total_xp?: number }).total_xp).toBe(56);
    const hub = await authJson("/api/engagement/hub", viewer.token);
    expect(hub.body).toMatchObject({
      hub: {
        promotional_coins: 110,
        battle_energy: 2,
        total_xp: 56,
        starter_coin_balance: 50000,
      },
    });
    expect((await authJson("/api/wallet", viewer.token)).body).toMatchObject({
      coin_balance: 7,
      starter_balance: 50000,
      promotional_balance: 110,
    });

    const isolated = await authJson("/api/engagement/wallet", other.token);
    expect(isolated.body.wallet).toMatchObject({
      purchasedCoins: 0,
      promotionalCoins: 0,
      starterCoins: 50000,
      battleEnergy: 0,
      totalXp: 0,
    });

    const payout = await authJson("/api/creator/balance", viewer.token);
    expect(payout.body).toMatchObject({
      gbp: { available_pence: 0, pending_pence: 0, held_pence: 0 },
    });

    await getPool().query(`UPDATE engagement_missions SET reward_xp = 0, reward_energy = 0 WHERE id = 'daily_like'`);

    if (previous == null) delete process.env.ENGAGEMENT_HUB_ENABLED;
    else process.env.ENGAGEMENT_HUB_ENABLED = previous;
  });

  it("PAGE-053 daily login is flag-gated, once-per-UTC-day, and isolated from money", async ({ skip }) => {
    if (!db || !base) {
      skip();
      return;
    }

    async function registerIsolated(prefix: string) {
      const username = `${prefix}${Math.random().toString(36).slice(2, 10)}`.slice(0, 12);
      const res = await fetch(`${base}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: `${username}@example.com`,
          username,
          password: "password12",
          ageConfirmed13Plus: true,
          consentVersion: "2026-07-21",
        }),
      });
      const body = (await res.json()) as { token?: string; user?: { id?: string } };
      expect(res.status).toBe(201);
      return { id: String(body.user?.id ?? ""), token: accessTokenFromLogin(body) };
    }

    async function authJson(pathName: string, userToken: string, init: RequestInit = {}) {
      const res = await fetch(`${base}${pathName}`, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userToken}`,
          ...(init.headers as Record<string, string> | undefined),
        },
      });
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      return { status: res.status, body, cache: res.headers.get("cache-control") };
    }

    const today = new Date().toISOString().slice(0, 10);
    const yesterdayDate = new Date(`${today}T00:00:00.000Z`);
    yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1);
    const yesterday = yesterdayDate.toISOString().slice(0, 10);
    const missedDate = new Date(`${today}T00:00:00.000Z`);
    missedDate.setUTCDate(missedDate.getUTCDate() - 2);
    const twoDaysAgo = missedDate.toISOString().slice(0, 10);

    const expectedDays = [
      { streak_day: 1, reward_xp: 100, reward_promo_coins: 0, reward_label: "100 XP" },
      { streak_day: 2, reward_xp: 200, reward_promo_coins: 0, reward_label: "200 XP" },
      { streak_day: 3, reward_xp: 0, reward_promo_coins: 0, reward_label: "Gift coupon" },
      { streak_day: 4, reward_xp: 0, reward_promo_coins: 500, reward_label: "500 Promotional Coins" },
      { streak_day: 5, reward_xp: 0, reward_promo_coins: 0, reward_label: "Temporary profile frame" },
      { streak_day: 6, reward_xp: 1000, reward_promo_coins: 0, reward_label: "1,000 XP" },
      { streak_day: 7, reward_xp: 500, reward_promo_coins: 1000, reward_label: "Mystery reward" },
    ];

    const previous = process.env.ENGAGEMENT_HUB_ENABLED;
    delete process.env.ENGAGEMENT_HUB_ENABLED;
    delete process.env.VITE_ENGAGEMENT_HUB_ENABLED;
    expect((await fetch(`${base}/api/engagement/daily-login`)).status).toBe(401);
    expect((await fetch(`${base}/api/engagement/daily-login/claim`, { method: "POST" })).status).toBe(401);
    const viewer = await registerIsolated("p53a");
    const other = await registerIsolated("p53b");
    const promoUser = await registerIsolated("p53c");
    const cycleUser = await registerIsolated("p53d");
    const missUser = await registerIsolated("p53e");
    const raceUser = await registerIsolated("p53f");
    expect((await authJson("/api/engagement/daily-login", viewer.token)).status).toBe(404);
    expect((await authJson("/api/engagement/daily-login/claim", viewer.token, { method: "POST" })).status).toBe(404);

    process.env.ENGAGEMENT_HUB_ENABLED = "true";
    await getPool().query(
      `UPDATE wallet_balances SET paid_coins = 11, promo_coins = 3 WHERE user_id = $1`,
      [viewer.id],
    );
    await getPool().query(
      `INSERT INTO user_engagement (user_id, battle_energy) VALUES ($1, 4)
       ON CONFLICT (user_id) DO UPDATE SET battle_energy = 4`,
      [viewer.id],
    );

    const listed = await authJson("/api/engagement/daily-login?userId=" + other.id, viewer.token);
    expect(listed.status).toBe(200);
    expect(listed.cache).toMatch(/no-store/);
    expect(listed.body.items).toBeUndefined();
    expect(listed.body.daily).toMatchObject({
      can_claim: true,
      streak_day: 1,
      claimed_today: false,
      next_reward: expectedDays[0],
      days: expectedDays,
    });

    const claimed = await authJson("/api/engagement/daily-login/claim", viewer.token, {
      method: "POST",
      body: JSON.stringify({
        userId: other.id,
        streak_day: 7,
        reward_xp: 9999,
        reward_promo_coins: 9999,
        claimDate: "2099-01-01",
      }),
    });
    expect(claimed.status).toBe(200);
    expect(claimed.body).toMatchObject({
      ok: true,
      daily: { can_claim: false, streak_day: 1, claimed_today: true, next_reward: null },
      reward: expectedDays[0],
    });
    expect(claimed.body.alreadyClaimed).not.toBe(true);

    const retry = await authJson("/api/engagement/daily-login/claim", viewer.token, { method: "POST" });
    expect(retry.status).toBe(200);
    expect(retry.body).toMatchObject({
      ok: true,
      alreadyClaimed: true,
      daily: { can_claim: false, streak_day: 1, claimed_today: true },
      reward: null,
    });

    const after = await authJson("/api/engagement/daily-login", viewer.token);
    expect(after.body.daily).toMatchObject({
      can_claim: false,
      streak_day: 1,
      claimed_today: true,
      next_reward: null,
      days: expectedDays,
    });
    const wallet = await authJson("/api/engagement/wallet", viewer.token);
    expect(wallet.body.wallet).toMatchObject({
      purchasedCoins: 11,
      starterCoins: 50000,
      promotionalCoins: 3,
      battleEnergy: 4,
      totalXp: 100,
    });
    expect((await authJson("/api/wallet", viewer.token)).body).toMatchObject({
      coin_balance: 11,
      starter_balance: 50000,
      promotional_balance: 3,
    });
    expect((await authJson("/api/engagement/fan-level", viewer.token)).body).toMatchObject({
      fan_level: { total_xp: 100 },
    });
    expect((await authJson("/api/engagement/hub", viewer.token)).body).toMatchObject({
      hub: {
        promotional_coins: 3,
        battle_energy: 4,
        total_xp: 100,
        starter_coin_balance: 50000,
        daily_login: { can_claim: false, streak_day: 1, claimed_today: true },
      },
    });
    expect((await authJson("/api/creator/balance", viewer.token)).body).toMatchObject({
      gbp: { available_pence: 0, pending_pence: 0, held_pence: 0 },
    });
    const testCoins = await getPool().query<{ test_coins: string }>(
      `SELECT test_coins::text AS test_coins FROM wallet_balances WHERE user_id = $1`,
      [viewer.id],
    );
    expect(Number(testCoins.rows[0]?.test_coins ?? 0)).toBe(0);
    const achievements = await authJson("/api/engagement/achievements", viewer.token);
    const streak = ((achievements.body.achievements as Array<Record<string, unknown>>) || []).find(
      (row) => row.id === "streak_7",
    );
    expect(streak).toMatchObject({ progress: 1, unlocked: false });

    const isolated = await authJson("/api/engagement/daily-login", other.token);
    expect(isolated.body.daily).toMatchObject({
      can_claim: true,
      streak_day: 1,
      claimed_today: false,
      next_reward: expectedDays[0],
    });

    await getPool().query(
      `INSERT INTO daily_login_claims (user_id, claim_date, streak_day, reward_xp, reward_promo_coins, reward_label)
       VALUES ($1, $2::date, 3, 0, 0, 'Gift coupon')`,
      [promoUser.id, yesterday],
    );
    const promoReady = await authJson("/api/engagement/daily-login", promoUser.token);
    expect(promoReady.body.daily).toMatchObject({
      can_claim: true,
      streak_day: 4,
      claimed_today: false,
      next_reward: expectedDays[3],
    });
    const promoClaim = await authJson("/api/engagement/daily-login/claim", promoUser.token, { method: "POST" });
    expect(promoClaim.status).toBe(200);
    expect(promoClaim.body).toMatchObject({
      ok: true,
      reward: expectedDays[3],
      daily: { streak_day: 4, claimed_today: true, can_claim: false },
    });
    expect((await authJson("/api/engagement/wallet", promoUser.token)).body.wallet).toMatchObject({
      purchasedCoins: 0,
      starterCoins: 50000,
      promotionalCoins: 500,
      battleEnergy: 0,
      totalXp: 0,
    });

    await getPool().query(
      `INSERT INTO daily_login_claims (user_id, claim_date, streak_day)
       VALUES ($1, $2::date, 7)`,
      [cycleUser.id, yesterday],
    );
    expect((await authJson("/api/engagement/daily-login", cycleUser.token)).body.daily).toMatchObject({
      can_claim: true,
      streak_day: 1,
      claimed_today: false,
      next_reward: expectedDays[0],
    });

    await getPool().query(
      `INSERT INTO daily_login_claims (user_id, claim_date, streak_day)
       VALUES ($1, $2::date, 3)`,
      [missUser.id, twoDaysAgo],
    );
    expect((await authJson("/api/engagement/daily-login", missUser.token)).body.daily).toMatchObject({
      can_claim: true,
      streak_day: 1,
      claimed_today: false,
    });

    const [firstRace, secondRace] = await Promise.all([
      authJson("/api/engagement/daily-login/claim", raceUser.token, { method: "POST" }),
      authJson("/api/engagement/daily-login/claim", raceUser.token, { method: "POST" }),
    ]);
    expect(firstRace.status).toBe(200);
    expect(secondRace.status).toBe(200);
    const raceWins = [firstRace.body, secondRace.body].filter((body) => body.alreadyClaimed !== true);
    expect(raceWins).toHaveLength(1);
    expect((await authJson("/api/engagement/wallet", raceUser.token)).body.wallet).toMatchObject({
      promotionalCoins: 0,
      totalXp: 100,
      purchasedCoins: 0,
      starterCoins: 50000,
    });

    try {
      await getPool().query(`DELETE FROM daily_reward_config WHERE streak_day = 3`);
      const malformed = await authJson("/api/engagement/daily-login", other.token);
      expect(malformed.status).toBe(503);
      const malformedClaim = await authJson("/api/engagement/daily-login/claim", other.token, { method: "POST" });
      expect(malformedClaim.status).toBe(503);
    } finally {
      await getPool().query(
        `INSERT INTO daily_reward_config (streak_day, reward_xp, reward_promo_coins, reward_label)
         VALUES (3, 0, 0, 'Gift coupon')
         ON CONFLICT (streak_day) DO NOTHING`,
      );
    }

    if (previous == null) delete process.env.ENGAGEMENT_HUB_ENABLED;
    else process.env.ENGAGEMENT_HUB_ENABLED = previous;
  }, 60_000);

  it("PAGE-054 collections inventory, chest open, stickers, and cards stay server-owned", async ({ skip }) => {
    if (!db || !base) {
      skip();
      return;
    }

    async function registerIsolated(prefix: string) {
      const username = `${prefix}${Math.random().toString(36).slice(2, 10)}`.slice(0, 12);
      const res = await fetch(`${base}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: `${username}@example.com`,
          username,
          password: "password12",
          ageConfirmed13Plus: true,
          consentVersion: "2026-07-21",
        }),
      });
      const body = (await res.json()) as { token?: string; user?: { id?: string } };
      expect(res.status).toBe(201);
      return { id: String(body.user?.id ?? ""), token: accessTokenFromLogin(body) };
    }

    async function authJson(pathName: string, userToken: string, init: RequestInit = {}) {
      const res = await fetch(`${base}${pathName}`, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userToken}`,
          ...(init.headers as Record<string, string> | undefined),
        },
      });
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      return { status: res.status, body, cache: res.headers.get("cache-control") };
    }

    const previous = process.env.ENGAGEMENT_HUB_ENABLED;
    delete process.env.ENGAGEMENT_HUB_ENABLED;
    delete process.env.VITE_ENGAGEMENT_HUB_ENABLED;
    expect((await fetch(`${base}/api/engagement/treasure`)).status).toBe(401);
    expect((await fetch(`${base}/api/engagement/treasure/spawn`, { method: "POST" })).status).toBe(401);
    expect((await fetch(`${base}/api/engagement/stickers`)).status).toBe(401);
    expect((await fetch(`${base}/api/engagement/creator-cards`)).status).toBe(401);
    const viewer = await registerIsolated("p54a");
    const other = await registerIsolated("p54b");
    const day5 = await registerIsolated("p54c");
    const missionUser = await registerIsolated("p54d");
    const race = await registerIsolated("p54e");
    expect((await authJson("/api/engagement/treasure", viewer.token)).status).toBe(404);
    expect((await authJson("/api/engagement/treasure/spawn", viewer.token, { method: "POST" })).status).toBe(404);
    expect((await authJson("/api/engagement/treasure/x/open", viewer.token, { method: "POST" })).status).toBe(404);
    expect((await authJson("/api/engagement/stickers", viewer.token)).status).toBe(404);
    expect((await authJson("/api/engagement/creator-cards", viewer.token)).status).toBe(404);

    process.env.ENGAGEMENT_HUB_ENABLED = "true";
    await getPool().query(
      `UPDATE wallet_balances SET paid_coins = 9, promo_coins = 2 WHERE user_id = $1`,
      [viewer.id],
    );

    expect((await authJson("/api/engagement/collections", viewer.token)).status).toBe(404);
    const emptyTreasure = await authJson("/api/engagement/treasure?userId=" + other.id, viewer.token);
    expect(emptyTreasure.status).toBe(200);
    expect(emptyTreasure.cache).toMatch(/no-store/);
    expect(Array.isArray(emptyTreasure.body.catalog)).toBe(true);
    expect((emptyTreasure.body.catalog as Array<{ id?: string }>).map((row) => row.id)).toEqual([
      "chest_common_watch",
      "chest_epic_streams",
      "chest_legendary_streak",
      "chest_mythic_event",
      "chest_rare_missions",
    ]);
    expect(emptyTreasure.body.chests).toEqual([]);
    expect(emptyTreasure.body.items).toBeUndefined();

    const emptyStickers = await authJson("/api/engagement/stickers", viewer.token);
    expect(emptyStickers.status).toBe(200);
    const sets = emptyStickers.body.sets as Array<Record<string, unknown>>;
    expect(sets).toHaveLength(5);
    expect(sets.every((set) => set.progress === 0 && set.complete === false)).toBe(true);

    const emptyCards = await authJson("/api/engagement/creator-cards", viewer.token);
    expect(emptyCards.status).toBe(200);
    expect(emptyCards.body.unlocked).toEqual([]);
    expect(Array.isArray(emptyCards.body.tiers)).toBe(true);

    const spawnDenied = await authJson("/api/engagement/treasure/spawn", viewer.token, {
      method: "POST",
      body: JSON.stringify({ chestDefId: "chest_common_watch", rarity: "mythic", reward_xp: 9999 }),
    });
    expect(spawnDenied.status).toBe(403);
    expect(spawnDenied.body).toMatchObject({ error: "SPAWN_SERVER_ONLY" });

    const firstSpawn = await spawnTreasureChest(viewer.id, "chest_common_watch", "it");
    const secondSpawn = await spawnTreasureChest(viewer.id, "chest_common_watch", "it");
    expect(firstSpawn).toMatchObject({ ok: true });
    expect(secondSpawn).toMatchObject({ ok: false, error: "COOLDOWN" });
    const chestId = firstSpawn.ok ? firstSpawn.chest_id : "";
    expect(chestId).toBeTruthy();

    const listed = await authJson("/api/engagement/treasure", viewer.token);
    expect((listed.body.chests as Array<{ id?: string; status?: string }>)[0]).toMatchObject({
      id: chestId,
      chest_def_id: "chest_common_watch",
      status: "found",
    });

    const missing = await authJson("/api/engagement/treasure/not-a-chest/open", viewer.token, { method: "POST" });
    expect(missing.status).toBe(404);
    const foreign = await spawnTreasureChest(other.id, "chest_common_watch", "it");
    expect(foreign.ok).toBe(true);
    const stolen = await authJson(
      `/api/engagement/treasure/${foreign.ok ? foreign.chest_id : "x"}/open`,
      viewer.token,
      { method: "POST" },
    );
    expect(stolen.status).toBe(404);

    const opened = await authJson(`/api/engagement/treasure/${chestId}/open`, viewer.token, {
      method: "POST",
      body: JSON.stringify({
        reward_xp: 9999,
        reward_promo_coins: 9999,
        rarity: "mythic",
        desiredReward: "paid",
      }),
    });
    expect(opened.status).toBe(200);
    expect(opened.body).toMatchObject({
      ok: true,
      reward: {
        reward_xp: 50,
        reward_promo_coins: 25,
        reward_energy: 10,
        reward_label: "50 XP + 25 Promo",
        title: "Watch Chest",
        rarity: "common",
      },
    });
    expect(opened.body.alreadyOpened).toBeUndefined();

    const retry = await authJson(`/api/engagement/treasure/${chestId}/open`, viewer.token, { method: "POST" });
    expect(retry.status).toBe(200);
    expect(retry.body).toMatchObject({
      ok: true,
      alreadyOpened: true,
      reward: { reward_xp: 50, reward_promo_coins: 25, reward_energy: 10 },
    });

    const wallet = await authJson("/api/engagement/wallet", viewer.token);
    expect(wallet.body.wallet).toMatchObject({
      purchasedCoins: 9,
      starterCoins: 50000,
      promotionalCoins: 27,
      battleEnergy: 10,
      totalXp: 50,
    });
    const paidLots = await getPool().query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM paid_coin_lots WHERE user_id = $1`,
      [viewer.id],
    );
    expect(paidLots.rows[0]?.n).toBe(0);
    const testCoins = await getPool().query<{ test_coins: string }>(
      `SELECT test_coins::text AS test_coins FROM wallet_balances WHERE user_id = $1`,
      [viewer.id],
    );
    expect(Number(testCoins.rows[0]?.test_coins ?? 0)).toBe(0);
    expect((await authJson("/api/creator/balance", viewer.token)).body).toMatchObject({
      gbp: { available_pence: 0, pending_pence: 0, held_pence: 0 },
    });
    const persisted = await authJson("/api/engagement/treasure", viewer.token);
    expect((persisted.body.chests as Array<{ status?: string; opened_at?: string | null }>)[0]).toMatchObject({
      id: chestId,
      status: "opened",
    });
    expect((persisted.body.chests as Array<{ opened_at?: string | null }>)[0]?.opened_at).toBeTruthy();

    const raceChest = await spawnTreasureChest(race.id, "chest_rare_missions", "it");
    expect(raceChest.ok).toBe(true);
    const [firstRace, secondRace] = await Promise.all([
      authJson(`/api/engagement/treasure/${raceChest.ok ? raceChest.chest_id : "x"}/open`, race.token, {
        method: "POST",
      }),
      authJson(`/api/engagement/treasure/${raceChest.ok ? raceChest.chest_id : "x"}/open`, race.token, {
        method: "POST",
      }),
    ]);
    expect(firstRace.status).toBe(200);
    expect(secondRace.status).toBe(200);
    const raceWins = [firstRace.body, secondRace.body].filter((body) => body.alreadyOpened !== true);
    expect(raceWins).toHaveLength(1);
    expect((await authJson("/api/engagement/wallet", race.token)).body.wallet).toMatchObject({
      promotionalCoins: 75,
      totalXp: 100,
      battleEnergy: 20,
      purchasedCoins: 0,
      starterCoins: 50000,
    });

    await grantStickerForUser(viewer.id, "animals_fox");
    const afterFox = await authJson("/api/engagement/stickers", viewer.token);
    const animals = ((afterFox.body.sets as Array<Record<string, unknown>>) || []).find((set) => set.id === "animals");
    expect(animals).toMatchObject({ progress: 1, total: 4, complete: false });
    await grantStickerForUser(viewer.id, "animals_wolf");
    await grantStickerForUser(viewer.id, "animals_panda");
    const completed = await grantStickerForUser(viewer.id, "animals_tiger");
    expect(completed).toMatchObject({ ok: true, set_completed: true });
    const again = await grantStickerForUser(viewer.id, "animals_tiger");
    expect(again).toMatchObject({ ok: true, set_completed: false });
    const afterSet = await authJson("/api/engagement/stickers", viewer.token);
    expect(((afterSet.body.sets as Array<Record<string, unknown>>) || []).find((set) => set.id === "animals")).toMatchObject({
      progress: 4,
      complete: true,
    });
    const tiger = (
      (((afterSet.body.sets as Array<{ id?: string; stickers?: Array<{ id?: string; owned?: number }> }>) || []).find(
        (set) => set.id === "animals",
      )?.stickers || [])
    ).find((item) => item.id === "animals_tiger");
    expect(tiger?.owned).toBe(2);
    expect((await authJson("/api/engagement/wallet", viewer.token)).body.wallet).toMatchObject({
      promotionalCoins: 277,
      totalXp: 150,
      purchasedCoins: 9,
      starterCoins: 50000,
    });

    await recordCreatorWatchProgress(viewer.id, other.id, 5);
    const bronze = await authJson("/api/engagement/creator-cards", viewer.token);
    expect(bronze.body.unlocked).toEqual([
      expect.objectContaining({ creator_id: other.id, tier: "bronze" }),
    ]);
    await recordCreatorGiftProgress(viewer.id, other.id, 1);
    await recordCreatorWatchProgress(viewer.id, other.id, 25);
    const silver = await authJson(`/api/engagement/creator-cards?creatorId=${other.id}`, viewer.token);
    const tiers = (silver.body.unlocked as Array<{ tier?: string }>).map((row) => row.tier).sort();
    expect(tiers).toEqual(["bronze", "silver"]);

    const isolated = await authJson("/api/engagement/treasure", other.token);
    expect((isolated.body.chests as Array<{ id?: string }>).some((row) => row.id === chestId)).toBe(false);
    const isolatedStickers = await authJson("/api/engagement/stickers", other.token);
    expect(
      ((isolatedStickers.body.sets as Array<Record<string, unknown>>) || []).every((set) => set.progress === 0),
    ).toBe(true);
    const isolatedCards = await authJson("/api/engagement/creator-cards", other.token);
    expect(isolatedCards.body.unlocked).toEqual([]);

    const today = new Date().toISOString().slice(0, 10);
    const yesterdayDate = new Date(`${today}T00:00:00.000Z`);
    yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1);
    const yesterday = yesterdayDate.toISOString().slice(0, 10);
    await getPool().query(
      `INSERT INTO daily_login_claims (user_id, claim_date, streak_day, reward_xp, reward_promo_coins, reward_label)
       VALUES ($1, $2::date, 4, 0, 500, '500 Promotional Coins')`,
      [day5.id, yesterday],
    );
    const day5Claim = await authJson("/api/engagement/daily-login/claim", day5.token, { method: "POST" });
    expect(day5Claim.status).toBe(200);
    const day5Chests = await authJson("/api/engagement/treasure", day5.token);
    expect(
      ((day5Chests.body.chests as Array<{ chest_def_id?: string; status?: string }>) || []).some(
        (row) => row.chest_def_id === "chest_rare_missions" && row.status === "found",
      ),
    ).toBe(true);

    await getPool().query(
      `INSERT INTO user_mission_progress (user_id, mission_id, period_key, progress, claimed)
       VALUES ($1, 'daily_like', $2, 5, FALSE)
       ON CONFLICT (user_id, mission_id, period_key) DO UPDATE SET progress = 5, claimed = FALSE`,
      [missionUser.id, today],
    );
    const missionClaim = await authJson("/api/engagement/missions/daily_like/claim", missionUser.token, {
      method: "POST",
    });
    expect(missionClaim.status).toBe(200);
    const missionChests = await authJson("/api/engagement/treasure", missionUser.token);
    expect(
      ((missionChests.body.chests as Array<{ chest_def_id?: string; status?: string }>) || []).some(
        (row) => row.chest_def_id === "chest_rare_missions" && row.status === "found",
      ),
    ).toBe(true);

    try {
      await getPool().query(`UPDATE treasure_chest_defs SET title = '' WHERE id = 'chest_common_watch'`);
      const malformed = await authJson("/api/engagement/treasure", other.token);
      expect(malformed.status).toBe(503);
    } finally {
      await getPool().query(`UPDATE treasure_chest_defs SET title = 'Watch Chest' WHERE id = 'chest_common_watch'`);
    }

    if (previous == null) delete process.env.ENGAGEMENT_HUB_ENABLED;
    else process.env.ENGAGEMENT_HUB_ENABLED = previous;
  }, 60_000);

  it("PAGE-056 Rising Stars challenge entry, vote, team, and live attach stay server-owned", async ({ skip }) => {
    if (!db || !base) {
      skip();
      return;
    }

    async function registerIsolated(prefix: string) {
      const username = `${prefix}${Math.random().toString(36).slice(2, 10)}`.slice(0, 12);
      const res = await fetch(`${base}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: `${username}@example.com`,
          username,
          password: "password12",
          ageConfirmed13Plus: true,
          consentVersion: "2026-07-21",
        }),
      });
      const body = (await res.json()) as { token?: string; user?: { id?: string } };
      expect(res.status).toBe(201);
      return { id: String(body.user?.id ?? ""), token: accessTokenFromLogin(body) };
    }

    async function authJson(pathName: string, userToken: string, init: RequestInit = {}) {
      const res = await fetch(`${base}${pathName}`, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userToken}`,
          ...(init.headers as Record<string, string> | undefined),
        },
      });
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      return { status: res.status, body };
    }

    const creator = await registerIsolated("p56a");
    const voter = await registerIsolated("p56b");
    const other = await registerIsolated("p56c");
    const season = await getPool().query<{ id: string }>(
      `SELECT id FROM rs_seasons WHERE status = 'active' LIMIT 1`,
    );
    const seasonId = season.rows[0]?.id;
    expect(seasonId).toBeTruthy();
    const category = await getPool().query<{ id: string }>(
      `SELECT id FROM rs_categories WHERE season_id = $1 ORDER BY sort_order ASC LIMIT 1`,
      [seasonId],
    );
    const categoryId = category.rows[0]?.id;
    expect(categoryId).toBeTruthy();

    const open = await getPool().query<{ id: string }>(
      `INSERT INTO rs_challenges
         (season_id, category_id, week_index, title, description, sound_track_id, status, opens_at, closes_at, leaderboard_frozen)
       VALUES ($1, $2, 1, 'IT Open', 'Use the sound', 'track-rs', 'open', NOW() - INTERVAL '1 day', NOW() + INTERVAL '7 days', FALSE)
       RETURNING id`,
      [seasonId, categoryId],
    );
    const scheduled = await getPool().query<{ id: string }>(
      `INSERT INTO rs_challenges
         (season_id, category_id, week_index, title, sound_track_id, status, opens_at, closes_at)
       VALUES ($1, $2, 2, 'IT Upcoming', 'track-rs', 'scheduled', NOW() + INTERVAL '2 days', NOW() + INTERVAL '9 days')
       RETURNING id`,
      [seasonId, categoryId],
    );
    const closed = await getPool().query<{ id: string }>(
      `INSERT INTO rs_challenges
         (season_id, category_id, week_index, title, sound_track_id, status, opens_at, closes_at)
       VALUES ($1, $2, 3, 'IT Closed', 'track-rs', 'closed', NOW() - INTERVAL '10 days', NOW() - INTERVAL '1 day')
       RETURNING id`,
      [seasonId, categoryId],
    );
    const frozen = await getPool().query<{ id: string }>(
      `INSERT INTO rs_challenges
         (season_id, category_id, week_index, title, sound_track_id, status, opens_at, closes_at, leaderboard_frozen)
       VALUES ($1, $2, 4, 'IT Frozen', 'track-rs', 'open', NOW() - INTERVAL '1 day', NOW() + INTERVAL '7 days', TRUE)
       RETURNING id`,
      [seasonId, categoryId],
    );
    const openId = open.rows[0].id;
    const scheduledId = scheduled.rows[0].id;
    const closedId = closed.rows[0].id;
    const frozenId = frozen.rows[0].id;

    const matching = await getPool().query<{ id: string }>(
      `INSERT INTO videos (user_id, bunny_path, caption, privacy, sound_id)
       VALUES ($1, 'https://cdn.example/p56.mp4', 'clip', 'public', 'track-rs')
       RETURNING id`,
      [creator.id],
    );
    const mismatch = await getPool().query<{ id: string }>(
      `INSERT INTO videos (user_id, bunny_path, caption, privacy, sound_id)
       VALUES ($1, 'https://cdn.example/p56b.mp4', 'wrong', 'public', 'other-track')
       RETURNING id`,
      [creator.id],
    );
    const foreignVideo = await getPool().query<{ id: string }>(
      `INSERT INTO videos (user_id, bunny_path, caption, privacy, sound_id)
       VALUES ($1, 'https://cdn.example/p56c.mp4', 'theirs', 'public', 'track-rs')
       RETURNING id`,
      [voter.id],
    );
    const videoId = matching.rows[0].id;

    const publicDetail = await fetch(`${base}/api/rising-stars/challenges/${openId}`);
    expect(publicDetail.status).toBe(200);
    const publicBody = (await publicDetail.json()) as {
      challenge?: { id?: string; status?: string };
      voted_today?: boolean;
      my_entry?: unknown;
    };
    expect(publicBody.challenge?.id).toBe(openId);
    expect(publicBody.challenge?.status).toBe("open");
    expect(publicBody.voted_today).toBe(false);
    expect(publicBody.my_entry).toBeNull();

    expect((await fetch(`${base}/api/rising-stars/challenges/not-a-uuid`)).status).toBe(400);
    expect((await fetch(`${base}/api/rising-stars/challenges/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`)).status).toBe(404);
    expect((await fetch(`${base}/api/rising-stars/challenges/${openId}/enter`, { method: "POST" })).status).toBe(401);

    expect(
      (
        await authJson(`/api/rising-stars/challenges/${scheduledId}/enter`, creator.token, {
          method: "POST",
          body: JSON.stringify({ videoId, userId: voter.id, score: 100000, rank: 1 }),
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await authJson(`/api/rising-stars/challenges/${closedId}/enter`, creator.token, {
          method: "POST",
          body: JSON.stringify({ videoId }),
        })
      ).body,
    ).toMatchObject({ error: "conflict", message: "CHALLENGE_CLOSED" });
    expect(
      (
        await authJson(`/api/rising-stars/challenges/${frozenId}/enter`, creator.token, {
          method: "POST",
          body: JSON.stringify({ videoId }),
        })
      ).body,
    ).toMatchObject({ message: "LEADERBOARD_FROZEN" });
    expect(
      (
        await authJson(`/api/rising-stars/challenges/${openId}/enter`, creator.token, {
          method: "POST",
          body: JSON.stringify({ videoId: mismatch.rows[0].id }),
        })
      ).body,
    ).toMatchObject({ message: "SOUND_MISMATCH" });
    expect(
      (
        await authJson(`/api/rising-stars/challenges/${openId}/enter`, creator.token, {
          method: "POST",
          body: JSON.stringify({ videoId: foreignVideo.rows[0].id }),
        })
      ).body,
    ).toMatchObject({ message: "VIDEO_NOT_OWNED" });

    const firstEnter = await authJson(`/api/rising-stars/challenges/${openId}/enter`, creator.token, {
      method: "POST",
      body: JSON.stringify({ videoId, userId: voter.id, score: 100000 }),
    });
    expect(firstEnter.status).toBe(201);
    const entryId = String((firstEnter.body.entry as { id?: string; creator_user_id?: string })?.id ?? "");
    expect(entryId).toBeTruthy();
    expect((firstEnter.body.entry as { creator_user_id?: string }).creator_user_id).toBe(creator.id);
    const [retryEnter, concurrentEnter] = await Promise.all([
      authJson(`/api/rising-stars/challenges/${openId}/enter`, creator.token, {
        method: "POST",
        body: JSON.stringify({ videoId }),
      }),
      authJson(`/api/rising-stars/challenges/${openId}/enter`, creator.token, {
        method: "POST",
        body: JSON.stringify({ videoId }),
      }),
    ]);
    expect(retryEnter.status).toBe(201);
    expect(concurrentEnter.status).toBe(201);
    expect((retryEnter.body.entry as { id?: string }).id).toBe(entryId);
    const entryCount = await getPool().query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM rs_entries WHERE challenge_id = $1 AND user_id = $2`,
      [openId, creator.id],
    );
    expect(entryCount.rows[0]?.n).toBe(1);

    const selfVote = await authJson(`/api/rising-stars/entries/${entryId}/vote`, creator.token, {
      method: "POST",
      body: JSON.stringify({ score: 50 }),
    });
    expect(selfVote.body).toMatchObject({ message: "CANNOT_VOTE_SELF" });
    const vote = await authJson(`/api/rising-stars/entries/${entryId}/vote`, voter.token, { method: "POST" });
    expect(vote.status).toBe(200);
    expect(vote.body).toMatchObject({ ok: true, entry_id: entryId, vote_count: 1 });
    const voteAgain = await authJson(`/api/rising-stars/entries/${entryId}/vote`, voter.token, { method: "POST" });
    expect(voteAgain.body).toMatchObject({ message: "ALREADY_VOTED_TODAY" });
    const board = await fetch(`${base}/api/rising-stars/challenges/${openId}/leaderboard`);
    const boardBody = (await board.json()) as { leaderboard: Array<{ rank: number; vote_count: number; entry_id: string }> };
    expect(board.status).toBe(200);
    expect(boardBody.leaderboard[0]).toMatchObject({ rank: 1, entry_id: entryId, vote_count: 1 });

    const team = await authJson("/api/rising-stars/teams", creator.token, {
      method: "POST",
      body: JSON.stringify({
        seasonId,
        name: "IT Crew",
        slug: `it-crew-${Date.now().toString(36)}`,
      }),
    });
    expect(team.status).toBe(201);
    const teamId = String((team.body.team as { id?: string })?.id ?? "");
    const join = await authJson(`/api/rising-stars/teams/${teamId}/join`, voter.token, { method: "POST" });
    expect(join.status).toBe(200);
    const joinAgain = await authJson(`/api/rising-stars/teams/${teamId}/join`, voter.token, { method: "POST" });
    expect(joinAgain.status).toBe(200);
    const members = await getPool().query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM rs_team_members WHERE team_id = $1 AND user_id = $2`,
      [teamId, voter.id],
    );
    expect(members.rows[0]?.n).toBe(1);

    await getPool().query(
      `INSERT INTO live_streams (host_id, room_id, title, status) VALUES ($1, $2, 'RS LIVE', 'live')`,
      [creator.id, creator.id],
    );
    const stolenLive = await authJson(`/api/rising-stars/challenges/${openId}/live/attach`, voter.token, {
      method: "POST",
      body: JSON.stringify({ phase: "qualifier", roomId: creator.id }),
    });
    expect(stolenLive.body).toMatchObject({ message: "ROOM_NOT_OWNED" });
    const uuidAsRoom = await authJson(`/api/rising-stars/challenges/${openId}/live/attach`, creator.token, {
      method: "POST",
      body: JSON.stringify({ phase: "qualifier", roomId: other.id }),
    });
    expect([403, 404]).toContain(uuidAsRoom.status);
    const attach = await authJson(`/api/rising-stars/challenges/${openId}/live/attach`, creator.token, {
      method: "POST",
      body: JSON.stringify({ phase: "qualifier", roomId: creator.id }),
    });
    expect(attach.status).toBe(200);
    expect((attach.body.challenge as { live_qualifier_room_id?: string }).live_qualifier_room_id).toBe(creator.id);
    await getPool().query(`UPDATE live_streams SET status = 'ended', ended_at = NOW() WHERE host_id = $1`, [creator.id]);
    const liveAfterEnd = await fetch(`${base}/api/rising-stars/challenges/${openId}/live`);
    const liveBody = (await liveAfterEnd.json()) as { live?: { qualifier_room_id?: string; status?: string } };
    expect(liveBody.live?.qualifier_room_id).toBe(creator.id);
    expect(liveBody.live?.status).toBe("open");

    const withdraw = await authJson(`/api/rising-stars/entries/${entryId}`, creator.token, { method: "DELETE" });
    expect(withdraw.status).toBe(200);
    const withdrawAgain = await authJson(`/api/rising-stars/entries/${entryId}`, creator.token, { method: "DELETE" });
    expect(withdrawAgain.body).toMatchObject({ message: "WITHDRAW_DENIED" });
    const afterWithdraw = await authJson(`/api/rising-stars/challenges/${openId}`, creator.token);
    expect((afterWithdraw.body.my_entry as { status?: string } | null)?.status).toBe("withdrawn");

    const wallet = await authJson("/api/wallet", creator.token);
    expect(wallet.body).toMatchObject({
      coin_balance: 0,
      starter_balance: 50000,
      promotional_balance: 0,
    });
    expect((await authJson("/api/creator/balance", creator.token)).body).toMatchObject({
      gbp: { available_pence: 0, pending_pence: 0, held_pence: 0 },
    });
  }, 60_000);

  it("PAGE-070 admin dashboard is gated by users.is_admin and returns server aggregates only", async ({ skip }) => {
    if (!db || !base) {
      skip();
      return;
    }

    async function registerIsolated(prefix: string) {
      const username = `${prefix}${Math.random().toString(36).slice(2, 10)}`.slice(0, 12);
      const res = await fetch(`${base}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: `${username}@example.com`,
          username,
          password: "password12",
          ageConfirmed13Plus: true,
          consentVersion: "2026-07-21",
        }),
      });
      const body = (await res.json()) as { token?: string; user?: { id?: string; isAdmin?: boolean } };
      expect(res.status).toBe(201);
      return {
        id: String(body.user?.id ?? ""),
        token: accessTokenFromLogin(body),
        isAdmin: body.user?.isAdmin === true,
      };
    }

    async function authJson(pathName: string, userToken: string | null, init: RequestInit = {}) {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(init.headers as Record<string, string> | undefined),
      };
      if (userToken) headers.Authorization = `Bearer ${userToken}`;
      const res = await fetch(`${base}${pathName}`, { ...init, headers });
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      return { status: res.status, body };
    }

    function assertNoAdminMetrics(body: Record<string, unknown>) {
      expect(body).not.toHaveProperty("dailyActiveUsers");
      expect(body).not.toHaveProperty("totalUsers");
      expect(body).not.toHaveProperty("totalVideos");
      expect(body).not.toHaveProperty("liveRooms");
      expect(body).not.toHaveProperty("totalRevenueMinor");
      expect(body).not.toHaveProperty("pendingReports");
      expect(body).not.toHaveProperty("dau");
      expect(JSON.stringify(body)).not.toMatch(/DATABASE_URL|VALKEY|LIVEKIT_API_SECRET|STRIPE_SECRET|BEGIN RSA PRIVATE KEY/);
    }

    const loggedOutDashboard = await authJson("/api/admin/dashboard", null);
    expect(loggedOutDashboard.status).toBe(401);
    expect(loggedOutDashboard.body).toMatchObject({ error: "unauthenticated" });
    assertNoAdminMetrics(loggedOutDashboard.body);

    const loggedOutDau = await authJson("/api/admin/stats/dau", null);
    expect(loggedOutDau.status).toBe(401);
    expect(loggedOutDau.body).toMatchObject({ error: "unauthenticated" });
    assertNoAdminMetrics(loggedOutDau.body);

    const accountA = await registerIsolated("a70");
    expect(accountA.isAdmin).toBe(false);
    const aDenied = await authJson("/api/admin/dashboard", accountA.token);
    expect(aDenied.status).toBe(403);
    expect(aDenied.body).toMatchObject({ error: "forbidden" });
    assertNoAdminMetrics(aDenied.body);
    const aDauDenied = await authJson("/api/admin/stats/dau", accountA.token);
    expect(aDauDenied.status).toBe(403);
    expect(aDauDenied.body).toMatchObject({ error: "forbidden" });
    assertNoAdminMetrics(aDauDenied.body);

    await getPool().query(`UPDATE users SET is_admin = true WHERE id = $1`, [accountA.id]);
    const aAllowed = await authJson("/api/admin/dashboard", accountA.token);
    expect(aAllowed.status).toBe(200);
    expect(Number.isFinite(aAllowed.body.dailyActiveUsers)).toBe(true);
    expect(Number.isFinite(aAllowed.body.totalUsers)).toBe(true);
    expect(Number.isFinite(aAllowed.body.totalVideos)).toBe(true);
    expect(Number.isFinite(aAllowed.body.liveRooms)).toBe(true);
    expect(Number.isFinite(aAllowed.body.totalRevenueMinor)).toBe(true);
    expect(Number.isFinite(aAllowed.body.pendingReports)).toBe(true);
    expect(aAllowed.body.dailyActiveUsers).toBeGreaterThanOrEqual(1);
    expect(aAllowed.body.totalUsers).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(aAllowed.body)).not.toMatch(/DATABASE_URL|VALKEY|LIVEKIT_API_SECRET|STRIPE_SECRET|password_hash/);

    const aDau = await authJson("/api/admin/stats/dau", accountA.token);
    expect(aDau.status).toBe(200);
    expect(Number.isFinite(aDau.body.dau)).toBe(true);
    expect(aDau.body.dau).toBe(aAllowed.body.dailyActiveUsers);

    const missingStats = await authJson("/api/admin/stats", accountA.token);
    expect(missingStats.status).toBe(404);

    const accountB = await registerIsolated("b70");
    expect(accountB.isAdmin).toBe(false);
    const bDenied = await authJson("/api/admin/dashboard", accountB.token);
    expect(bDenied.status).toBe(403);
    assertNoAdminMetrics(bDenied.body);

    await getPool().query(`UPDATE users SET is_admin = false WHERE id = $1`, [accountA.id]);
    const revoked = await authJson("/api/admin/dashboard", accountA.token);
    expect(revoked.status).toBe(403);
    expect(revoked.body).toMatchObject({ error: "forbidden" });
    assertNoAdminMetrics(revoked.body);
  }, 60_000);

  it("PAGE-071 admin users list, ban, and unban are gated by users.is_admin", async ({ skip }) => {
    if (!db || !base) {
      skip();
      return;
    }

    async function registerIsolated(prefix: string) {
      const username = `${prefix}${Math.random().toString(36).slice(2, 10)}`.slice(0, 12);
      const res = await fetch(`${base}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: `${username}@example.com`,
          username,
          password: "password12",
          ageConfirmed13Plus: true,
          consentVersion: "2026-07-21",
        }),
      });
      const body = (await res.json()) as { token?: string; user?: { id?: string; username?: string; isAdmin?: boolean } };
      expect(res.status).toBe(201);
      return {
        id: String(body.user?.id ?? ""),
        username: String(body.user?.username ?? username),
        token: accessTokenFromLogin(body),
        email: `${username}@example.com`,
        isAdmin: body.user?.isAdmin === true,
      };
    }

    async function authJson(pathName: string, userToken: string | null, init: RequestInit = {}) {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(init.headers as Record<string, string> | undefined),
      };
      if (userToken) headers.Authorization = `Bearer ${userToken}`;
      const res = await fetch(`${base}${pathName}`, { ...init, headers });
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      return { status: res.status, body };
    }

    function assertNoUserList(body: Record<string, unknown>) {
      expect(body).not.toHaveProperty("users");
      expect(JSON.stringify(body)).not.toMatch(/password_hash|DATABASE_URL|STRIPE_SECRET|BEGIN RSA PRIVATE KEY/);
    }

    const admin = await registerIsolated("a71");
    const target = await registerIsolated("b71");
    const attacker = await registerIsolated("c71");
    expect(admin.isAdmin).toBe(false);
    expect(target.isAdmin).toBe(false);

    const loggedOutList = await authJson("/api/admin/users", null);
    expect(loggedOutList.status).toBe(401);
    assertNoUserList(loggedOutList.body);
    const loggedOutBan = await authJson(`/api/admin/users/${target.id}/ban`, null, {
      method: "POST",
      body: JSON.stringify({ reason: "Banned by admin" }),
    });
    expect(loggedOutBan.status).toBe(401);
    const loggedOutUnban = await authJson(`/api/admin/users/${target.id}/ban`, null, { method: "DELETE" });
    expect(loggedOutUnban.status).toBe(401);

    const attackerList = await authJson("/api/admin/users", attacker.token);
    expect(attackerList.status).toBe(403);
    assertNoUserList(attackerList.body);
    const attackerBan = await authJson(`/api/admin/users/${target.id}/ban`, attacker.token, {
      method: "POST",
      body: JSON.stringify({ reason: "Banned by admin" }),
    });
    expect(attackerBan.status).toBe(403);
    const attackerUnban = await authJson(`/api/admin/users/${target.id}/ban`, attacker.token, { method: "DELETE" });
    expect(attackerUnban.status).toBe(403);

    const before = await getPool().query<{ banned_until: Date | null }>(
      `SELECT banned_until FROM users WHERE id = $1`,
      [target.id],
    );
    expect(before.rows[0]?.banned_until).toBeNull();

    await getPool().query(`UPDATE users SET is_admin = true WHERE id = $1`, [admin.id]);
    const listed = await authJson("/api/admin/users", admin.token);
    expect(listed.status).toBe(200);
    const users = listed.body.users as Array<Record<string, unknown>>;
    expect(Array.isArray(users)).toBe(true);
    const targetRow = users.find((row) => row.id === target.id);
    expect(targetRow).toMatchObject({
      id: target.id,
      username: target.username,
      email: target.email,
      is_banned: false,
    });
    expect(targetRow).not.toHaveProperty("password_hash");
    expect(targetRow).not.toHaveProperty("isAdmin");
    expect(JSON.stringify(listed.body)).not.toMatch(/password_hash|DATABASE_URL|STRIPE_SECRET/);

    const searched = await authJson(`/api/admin/users?q=${encodeURIComponent(target.username)}`, admin.token);
    expect(searched.status).toBe(200);
    const searchedUsers = searched.body.users as Array<{ id?: string }>;
    expect(searchedUsers.some((row) => row.id === target.id)).toBe(true);
    const emptySearch = await authJson("/api/admin/users?q=zzznotfound071", admin.token);
    expect(emptySearch.status).toBe(200);
    expect(emptySearch.body.users).toEqual([]);

    const banned = await authJson(`/api/admin/users/${target.id}/ban`, admin.token, {
      method: "POST",
      body: JSON.stringify({ reason: "Banned by admin" }),
    });
    expect(banned.status).toBe(200);
    expect(banned.body).toMatchObject({ ok: true, userId: target.id, is_banned: true });
    expect(typeof banned.body.banned_until).toBe("string");
    const storedBan = await getPool().query<{ banned_until: Date | null }>(
      `SELECT banned_until FROM users WHERE id = $1`,
      [target.id],
    );
    expect(storedBan.rows[0]?.banned_until).toBeTruthy();
    const bannedAgain = await authJson(`/api/admin/users/${target.id}/ban`, admin.token, {
      method: "POST",
      body: JSON.stringify({ reason: "Banned by admin" }),
    });
    expect(bannedAgain.status).toBe(200);
    expect(bannedAgain.body).toMatchObject({ ok: true, is_banned: true });

    const staleSession = await authJson("/api/auth/me", target.token);
    expect(staleSession.status).toBe(401);
    const bannedLogin = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: target.email, password: "password12" }),
    });
    const bannedLoginBody = (await bannedLogin.json()) as Record<string, unknown>;
    expect(bannedLogin.status).toBe(403);
    expect(bannedLoginBody).toMatchObject({ error: "Account suspended." });

    const missing = await authJson("/api/admin/users/not-a-uuid/ban", admin.token, {
      method: "POST",
      body: JSON.stringify({ reason: "Banned by admin" }),
    });
    expect(missing.status).toBe(400);
    const unknown = await authJson("/api/admin/users/ffffffff-ffff-4fff-8fff-ffffffffffff/ban", admin.token, {
      method: "POST",
      body: JSON.stringify({ reason: "Banned by admin" }),
    });
    expect(unknown.status).toBe(404);

    const unbanned = await authJson(`/api/admin/users/${target.id}/ban`, admin.token, { method: "DELETE" });
    expect(unbanned.status).toBe(200);
    expect(unbanned.body).toMatchObject({ ok: true, userId: target.id, is_banned: false });
    const storedUnban = await getPool().query<{ banned_until: Date | null }>(
      `SELECT banned_until FROM users WHERE id = $1`,
      [target.id],
    );
    expect(storedUnban.rows[0]?.banned_until).toBeNull();
    const unbannedAgain = await authJson(`/api/admin/users/${target.id}/ban`, admin.token, { method: "DELETE" });
    expect(unbannedAgain.status).toBe(200);
    expect(unbannedAgain.body).toMatchObject({ ok: true, is_banned: false });

    const recovered = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: target.email, password: "password12" }),
    });
    expect(recovered.status).toBe(200);

    await getPool().query(`UPDATE users SET is_admin = false WHERE id = $1`, [admin.id]);
    const revoked = await authJson("/api/admin/users", admin.token);
    expect(revoked.status).toBe(403);
    assertNoUserList(revoked.body);
    const revokedBan = await authJson(`/api/admin/users/${target.id}/ban`, admin.token, {
      method: "POST",
      body: JSON.stringify({ reason: "Banned by admin" }),
    });
    expect(revokedBan.status).toBe(403);
  }, 60_000);

  it("PAGE-072 admin reports list, status, and warning are gated by users.is_admin", async ({ skip }) => {
    if (!db || !base) {
      skip();
      return;
    }

    async function registerIsolated(prefix: string) {
      const username = `${prefix}${Math.random().toString(36).slice(2, 10)}`.slice(0, 12);
      const res = await fetch(`${base}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: `${username}@example.com`,
          username,
          password: "password12",
          ageConfirmed13Plus: true,
          consentVersion: "2026-07-21",
        }),
      });
      const body = (await res.json()) as { token?: string; user?: { id?: string; username?: string; isAdmin?: boolean } };
      expect(res.status).toBe(201);
      return {
        id: String(body.user?.id ?? ""),
        username: String(body.user?.username ?? username),
        token: accessTokenFromLogin(body),
        email: `${username}@example.com`,
        isAdmin: body.user?.isAdmin === true,
      };
    }

    async function authJson(pathName: string, userToken: string | null, init: RequestInit = {}) {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(init.headers as Record<string, string> | undefined),
      };
      if (userToken) headers.Authorization = `Bearer ${userToken}`;
      const res = await fetch(`${base}${pathName}`, { ...init, headers });
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      return { status: res.status, body };
    }

    function assertNoReports(body: Record<string, unknown>) {
      expect(body).not.toHaveProperty("reports");
      expect(body).not.toHaveProperty("report");
      expect(JSON.stringify(body)).not.toMatch(/password_hash|DATABASE_URL|STRIPE_SECRET|BEGIN RSA PRIVATE KEY/);
    }

    const admin = await registerIsolated("a72");
    const reporter = await registerIsolated("b72");
    const target = await registerIsolated("c72");
    const attacker = await registerIsolated("d72");
    expect(admin.isAdmin).toBe(false);

    const created = await authJson("/api/report", reporter.token, {
      method: "POST",
      body: JSON.stringify({
        targetType: "user",
        targetId: target.id,
        reason: "spam",
        details: "too many links",
      }),
    });
    expect(created.status).toBe(200);
    const reportId = String(created.body.id ?? "");
    expect(reportId).toMatch(/^[0-9a-f-]{36}$/i);

    const video = await getPool().query<{ id: string }>(
      `INSERT INTO videos (user_id, bunny_path, caption, privacy)
       VALUES ($1, 'https://cdn.example/p72.mp4', 'clip', 'public')
       RETURNING id::text AS id`,
      [target.id],
    );
    const videoReport = await authJson("/api/report", reporter.token, {
      method: "POST",
      body: JSON.stringify({
        targetType: "video",
        targetId: video.rows[0]?.id,
        reason: "nudity",
        details: "reported clip",
      }),
    });
    expect(videoReport.status).toBe(200);
    const videoReportId = String(videoReport.body.id ?? "");

    const loggedOutList = await authJson("/api/admin/reports", null);
    expect(loggedOutList.status).toBe(401);
    assertNoReports(loggedOutList.body);
    const loggedOutPatch = await authJson(`/api/admin/reports/${reportId}`, null, {
      method: "PATCH",
      body: JSON.stringify({ status: "actioned", action: "warned" }),
    });
    expect(loggedOutPatch.status).toBe(401);

    for (const actor of [attacker, reporter, target]) {
      const list = await authJson("/api/admin/reports?status=pending", actor.token);
      expect(list.status).toBe(403);
      assertNoReports(list.body);
      const patch = await authJson(`/api/admin/reports/${reportId}`, actor.token, {
        method: "PATCH",
        body: JSON.stringify({ status: "actioned", action: "warned" }),
      });
      expect(patch.status).toBe(403);
      assertNoReports(patch.body);
    }

    const before = await getPool().query<{ status: string }>(`SELECT status FROM reports WHERE id = $1`, [reportId]);
    expect(before.rows[0]?.status).toBe("open");

    await getPool().query(`UPDATE users SET is_admin = true WHERE id = $1`, [admin.id]);
    const listed = await authJson("/api/admin/reports?status=pending", admin.token);
    expect(listed.status).toBe(200);
    const pending = listed.body.reports as Array<Record<string, unknown>>;
    expect(Array.isArray(pending)).toBe(true);
    const userRow = pending.find((row) => row.id === reportId);
    expect(userRow).toMatchObject({
      id: reportId,
      reporter_id: reporter.id,
      target_type: "user",
      target_id: target.id,
      reason: "spam",
      details: "too many links",
      status: "open",
    });
    expect(userRow).not.toHaveProperty("password_hash");
    expect((userRow?.reporter as { username?: string } | undefined)?.username).toBe(reporter.username);

    const dashBefore = await authJson("/api/admin/dashboard", admin.token);
    expect(dashBefore.status).toBe(200);
    const pendingBefore = Number(dashBefore.body.pendingReports);
    expect(pendingBefore).toBeGreaterThanOrEqual(2);

    const warned = await authJson(`/api/admin/reports/${reportId}`, admin.token, {
      method: "PATCH",
      body: JSON.stringify({ status: "actioned", action: "warned", admin_note: "Outcome: warned" }),
    });
    expect(warned.status).toBe(200);
    expect(warned.body).toMatchObject({
      report: { id: reportId, status: "actioned", target_type: "user", target_id: target.id },
    });
    const storedWarn = await getPool().query<{ status: string; reviewed_by: string | null }>(
      `SELECT status, reviewed_by::text AS reviewed_by FROM reports WHERE id = $1`,
      [reportId],
    );
    expect(storedWarn.rows[0]).toMatchObject({ status: "actioned", reviewed_by: admin.id });
    const notices = await getPool().query<{ kind: string; payload: Record<string, unknown> }>(
      `SELECT kind, payload FROM notifications WHERE user_id = $1 ORDER BY created_at DESC`,
      [target.id],
    );
    expect(notices.rows[0]?.kind).toBe("system");
    expect(notices.rows[0]?.payload).toMatchObject({
      title: "Content warning",
      body: "Your content was reviewed by moderators and may violate our community guidelines. Repeated violations can lead to a ban.",
    });
    const stillUnbanned = await getPool().query<{ banned_until: Date | null }>(
      `SELECT banned_until FROM users WHERE id = $1`,
      [target.id],
    );
    expect(stillUnbanned.rows[0]?.banned_until).toBeNull();

    const warnedAgain = await authJson(`/api/admin/reports/${reportId}`, admin.token, {
      method: "PATCH",
      body: JSON.stringify({ status: "actioned", action: "warned" }),
    });
    expect(warnedAgain.status).toBe(200);
    const noticeCount = await getPool().query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM notifications WHERE user_id = $1 AND kind = 'system'`,
      [target.id],
    );
    expect(noticeCount.rows[0]?.n).toBe(1);

    const pendingAfter = await authJson("/api/admin/reports?status=pending", admin.token);
    expect(pendingAfter.status).toBe(200);
    const pendingRows = pendingAfter.body.reports as Array<{ id?: string }>;
    expect(pendingRows.some((row) => row.id === reportId)).toBe(false);
    expect(pendingRows.some((row) => row.id === videoReportId)).toBe(true);
    const allRows = await authJson("/api/admin/reports", admin.token);
    expect((allRows.body.reports as Array<{ id?: string }>).some((row) => row.id === reportId)).toBe(true);

    const removed = await authJson(`/api/admin/reports/${videoReportId}`, admin.token, {
      method: "PATCH",
      body: JSON.stringify({ status: "actioned", action: "removed" }),
    });
    expect(removed.status).toBe(200);
    const deletedVideo = await getPool().query<{ deleted_at: Date | null }>(
      `SELECT deleted_at FROM videos WHERE id = $1`,
      [video.rows[0]?.id],
    );
    expect(deletedVideo.rows[0]?.deleted_at).toBeTruthy();

    const dashAfter = await authJson("/api/admin/dashboard", admin.token);
    expect(Number(dashAfter.body.pendingReports)).toBe(pendingBefore - 2);

    const missing = await authJson("/api/admin/reports/not-a-uuid", admin.token, {
      method: "PATCH",
      body: JSON.stringify({ status: "actioned", action: "no_action" }),
    });
    expect(missing.status).toBe(400);
    const unknown = await authJson("/api/admin/reports/ffffffff-ffff-4fff-8fff-ffffffffffff", admin.token, {
      method: "PATCH",
      body: JSON.stringify({ status: "actioned", action: "no_action" }),
    });
    expect(unknown.status).toBe(404);
    const badStatus = await authJson(`/api/admin/reports/${reportId}`, admin.token, {
      method: "PATCH",
      body: JSON.stringify({ status: "resolved", action: "warned" }),
    });
    expect(badStatus.status).toBe(400);

    await getPool().query(`UPDATE users SET is_admin = false WHERE id = $1`, [admin.id]);
    const revoked = await authJson("/api/admin/reports", admin.token);
    expect(revoked.status).toBe(403);
    assertNoReports(revoked.body);
    const revokedPatch = await authJson(`/api/admin/reports/${reportId}`, admin.token, {
      method: "PATCH",
      body: JSON.stringify({ status: "actioned", action: "warned" }),
    });
    expect(revokedPatch.status).toBe(403);
  }, 60_000);

  it("PAGE-073 admin economy and gift catalog PATCH are gated by users.is_admin", async ({ skip }) => {
    if (!db || !base) {
      skip();
      return;
    }

    async function registerIsolated(prefix: string) {
      const username = `${prefix}${Math.random().toString(36).slice(2, 10)}`.slice(0, 12);
      const res = await fetch(`${base}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: `${username}@example.com`,
          username,
          password: "password12",
          ageConfirmed13Plus: true,
          consentVersion: "2026-07-21",
        }),
      });
      const body = (await res.json()) as { token?: string; user?: { id?: string; isAdmin?: boolean } };
      expect(res.status).toBe(201);
      return {
        id: String(body.user?.id ?? ""),
        token: accessTokenFromLogin(body),
        isAdmin: body.user?.isAdmin === true,
      };
    }

    async function authJson(pathName: string, userToken: string | null, init: RequestInit = {}) {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(init.headers as Record<string, string> | undefined),
      };
      if (userToken) headers.Authorization = `Bearer ${userToken}`;
      const res = await fetch(`${base}${pathName}`, { ...init, headers });
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      return { status: res.status, body };
    }

    function assertNoEconomy(body: Record<string, unknown>) {
      expect(body).not.toHaveProperty("gifts");
      expect(body).not.toHaveProperty("packages");
      expect(body).not.toHaveProperty("boosters");
      expect(body).not.toHaveProperty("gift");
      expect(body).not.toHaveProperty("paid");
      expect(body).not.toHaveProperty("promo");
      expect(body).not.toHaveProperty("starter");
      expect(JSON.stringify(body)).not.toMatch(/DATABASE_URL|VALKEY|LIVEKIT_API_SECRET|STRIPE_SECRET|BEGIN RSA PRIVATE KEY/);
    }

    const original = await getPool().query<{ coin_cost: number }>(
      `SELECT coin_cost FROM gifts WHERE id = 'rose'`,
    );
    const originalCost = original.rows[0]?.coin_cost;
    expect(originalCost).toBeGreaterThan(0);
    const nextCost = originalCost === 2 ? 3 : 2;

    const loggedOutList = await authJson("/api/admin/economy", null);
    expect(loggedOutList.status).toBe(401);
    assertNoEconomy(loggedOutList.body);
    const loggedOutPatch = await authJson("/api/admin/gifts/catalog/rose", null, {
      method: "PATCH",
      body: JSON.stringify({ coin_cost: nextCost }),
    });
    expect(loggedOutPatch.status).toBe(401);
    assertNoEconomy(loggedOutPatch.body);

    const attacker = await registerIsolated("b73");
    expect(attacker.isAdmin).toBe(false);
    const attackerList = await authJson("/api/admin/economy", attacker.token);
    expect(attackerList.status).toBe(403);
    assertNoEconomy(attackerList.body);
    const attackerPatch = await authJson("/api/admin/gifts/catalog/rose", attacker.token, {
      method: "PATCH",
      body: JSON.stringify({ coin_cost: nextCost }),
    });
    expect(attackerPatch.status).toBe(403);
    assertNoEconomy(attackerPatch.body);
    const untouched = await getPool().query<{ coin_cost: number }>(`SELECT coin_cost FROM gifts WHERE id = 'rose'`);
    expect(untouched.rows[0]?.coin_cost).toBe(originalCost);

    const admin = await registerIsolated("a73");
    await getPool().query(`UPDATE users SET is_admin = true WHERE id = $1`, [admin.id]);

    try {
      const listed = await authJson("/api/admin/economy", admin.token);
      expect(listed.status).toBe(200);
      expect(Array.isArray(listed.body.gifts)).toBe(true);
      expect(Array.isArray(listed.body.packages)).toBe(true);
      expect(listed.body.boosters).toEqual([]);
      expect(listed.body).not.toHaveProperty("paid");
      expect(listed.body).not.toHaveProperty("rows");
      const rose = (listed.body.gifts as Array<{ id?: string; coin_cost?: number; is_active?: boolean }>).find(
        (gift) => gift.id === "rose",
      );
      expect(rose?.coin_cost).toBe(originalCost);
      expect(rose?.is_active).toBe(true);

      const patched = await authJson("/api/admin/gifts/catalog/rose", admin.token, {
        method: "PATCH",
        body: JSON.stringify({ coin_cost: nextCost, is_admin: true, updatedBy: attacker.id }),
      });
      expect(patched.status).toBe(200);
      expect(patched.body).toMatchObject({ gift: { id: "rose", coin_cost: nextCost, is_active: true } });
      const persisted = await getPool().query<{ coin_cost: number }>(`SELECT coin_cost FROM gifts WHERE id = 'rose'`);
      expect(persisted.rows[0]?.coin_cost).toBe(nextCost);

      const publicCatalog = await fetch(`${base}/api/gifts`);
      const publicBody = (await publicCatalog.json()) as { gifts?: Array<{ id?: string; coinCost?: number }> };
      expect(publicCatalog.status).toBe(200);
      expect(publicBody.gifts?.find((gift) => gift.id === "rose")?.coinCost).toBe(nextCost);

      const again = await authJson("/api/admin/gifts/catalog/rose", admin.token, {
        method: "PATCH",
        body: JSON.stringify({ coin_cost: nextCost }),
      });
      expect(again.status).toBe(200);
      expect(again.body).toMatchObject({ gift: { id: "rose", coin_cost: nextCost } });

      const invalid = await authJson("/api/admin/gifts/catalog/rose", admin.token, {
        method: "PATCH",
        body: JSON.stringify({ coin_cost: 0 }),
      });
      expect(invalid.status).toBe(400);
      const decimal = await authJson("/api/admin/gifts/catalog/rose", admin.token, {
        method: "PATCH",
        body: JSON.stringify({ coin_cost: 1.5 }),
      });
      expect(decimal.status).toBe(400);
      const overflow = await authJson("/api/admin/gifts/catalog/rose", admin.token, {
        method: "PATCH",
        body: JSON.stringify({ coin_cost: 10_000_001 }),
      });
      expect(overflow.status).toBe(400);
      const unknown = await authJson("/api/admin/gifts/catalog/not-a-real-gift-073", admin.token, {
        method: "PATCH",
        body: JSON.stringify({ coin_cost: 4 }),
      });
      expect(unknown.status).toBe(404);
      const empty = await authJson("/api/admin/gifts/catalog/rose", admin.token, {
        method: "PATCH",
        body: JSON.stringify({ is_admin: true }),
      });
      expect(empty.status).toBe(400);

      const restored = await authJson("/api/admin/gifts/catalog/rose", admin.token, {
        method: "PATCH",
        body: JSON.stringify({ coin_cost: originalCost }),
      });
      expect(restored.status).toBe(200);
      expect(restored.body).toMatchObject({ gift: { id: "rose", coin_cost: originalCost } });
      const restoredPublic = await fetch(`${base}/api/gifts`);
      const restoredBody = (await restoredPublic.json()) as { gifts?: Array<{ id?: string; coinCost?: number }> };
      expect(restoredBody.gifts?.find((gift) => gift.id === "rose")?.coinCost).toBe(originalCost);

      await getPool().query(`UPDATE users SET is_admin = false WHERE id = $1`, [admin.id]);
      const revoked = await authJson("/api/admin/economy", admin.token);
      expect(revoked.status).toBe(403);
      assertNoEconomy(revoked.body);
      const revokedPatch = await authJson("/api/admin/gifts/catalog/rose", admin.token, {
        method: "PATCH",
        body: JSON.stringify({ coin_cost: nextCost }),
      });
      expect(revokedPatch.status).toBe(403);
      assertNoEconomy(revokedPatch.body);
    } finally {
      await getPool().query(`UPDATE gifts SET coin_cost = $1 WHERE id = 'rose'`, [originalCost]);
    }
  }, 60_000);

  it("PAGE-074 admin monetisation config is gated by users.is_admin", async ({ skip }) => {
    if (!db || !base) {
      skip();
      return;
    }

    async function registerIsolated(prefix: string) {
      const username = `${prefix}${Math.random().toString(36).slice(2, 10)}`.slice(0, 12);
      const res = await fetch(`${base}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: `${username}@example.com`,
          username,
          password: "password12",
          ageConfirmed13Plus: true,
          consentVersion: "2026-07-21",
        }),
      });
      const body = (await res.json()) as { token?: string; user?: { id?: string; isAdmin?: boolean } };
      expect(res.status).toBe(201);
      return {
        id: String(body.user?.id ?? ""),
        token: accessTokenFromLogin(body),
        isAdmin: body.user?.isAdmin === true,
      };
    }

    async function authJson(pathName: string, userToken: string | null, init: RequestInit = {}) {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(init.headers as Record<string, string> | undefined),
      };
      if (userToken) headers.Authorization = `Bearer ${userToken}`;
      const res = await fetch(`${base}${pathName}`, { ...init, headers });
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      return { status: res.status, body, cache: res.headers.get("cache-control") };
    }

    function assertNoMonetisation(body: Record<string, unknown>) {
      expect(body).not.toHaveProperty("config");
      expect(body).not.toHaveProperty("dashboard");
      expect(body).not.toHaveProperty("report");
      expect(body).not.toHaveProperty("withdrawals");
      expect(body).not.toHaveProperty("giftCreatorPct");
      expect(JSON.stringify(body)).not.toMatch(/DATABASE_URL|VALKEY|LIVEKIT_API_SECRET|STRIPE_SECRET|BEGIN RSA PRIVATE KEY/);
    }

    const original = await getPool().query<{
      gift_creator_pct: number;
      gift_platform_pct: number;
      gift_settlement_hours: number;
    }>(
      `SELECT gift_creator_pct, gift_platform_pct, gift_settlement_hours
         FROM monetisation_config
        WHERE id = 1`,
    );
    const originalRow = original.rows[0];
    expect(originalRow).toBeTruthy();
    const originalHours = Number(originalRow.gift_settlement_hours);
    const originalCreator = Number(originalRow.gift_creator_pct);
    const originalPlatform = Number(originalRow.gift_platform_pct);
    expect(originalCreator + originalPlatform).toBe(100);
    const nextHours = originalHours === 73 ? 74 : 73;

    const loggedOutList = await authJson("/api/admin/monetisation", null);
    expect(loggedOutList.status).toBe(401);
    assertNoMonetisation(loggedOutList.body);
    const loggedOutPatch = await authJson("/api/admin/monetisation/config", null, {
      method: "PATCH",
      body: JSON.stringify({ field: "giftSettlementHours", value: nextHours }),
    });
    expect(loggedOutPatch.status).toBe(401);
    assertNoMonetisation(loggedOutPatch.body);

    const attacker = await registerIsolated("b74");
    expect(attacker.isAdmin).toBe(false);
    const attackerList = await authJson("/api/admin/monetisation", attacker.token);
    expect(attackerList.status).toBe(403);
    assertNoMonetisation(attackerList.body);
    const attackerPatch = await authJson("/api/admin/monetisation/config", attacker.token, {
      method: "PATCH",
      body: JSON.stringify({ field: "giftSettlementHours", value: nextHours, updatedBy: attacker.id }),
    });
    expect(attackerPatch.status).toBe(403);
    assertNoMonetisation(attackerPatch.body);
    const untouched = await getPool().query<{ gift_settlement_hours: number }>(
      `SELECT gift_settlement_hours FROM monetisation_config WHERE id = 1`,
    );
    expect(Number(untouched.rows[0]?.gift_settlement_hours)).toBe(originalHours);

    const invented = [
      "/api/admin/monetisation/reconciliation/run",
      "/api/admin/monetisation/settlements/reverse",
      "/api/admin/monetisation/foryou-sweep",
      "/api/admin/monetisation/financial-reports/import",
    ];
    for (const pathName of invented) {
      const blocked = await authJson(pathName, attacker.token, { method: "POST", body: JSON.stringify({}) });
      expect(blocked.status).toBeGreaterThanOrEqual(400);
      expect(blocked.status).not.toBe(200);
    }

    const admin = await registerIsolated("a74");
    await getPool().query(`UPDATE users SET is_admin = true WHERE id = $1`, [admin.id]);

    try {
      const listed = await authJson("/api/admin/monetisation", admin.token);
      expect(listed.status).toBe(200);
      expect(listed.cache).toMatch(/no-store/);
      expect(listed.body).toMatchObject({
        config: {
          giftCreatorPct: originalCreator,
          giftPlatformPct: originalPlatform,
          giftSettlementHours: originalHours,
        },
      });
      expect(listed.body.dashboard).toBeTruthy();
      expect(listed.body.report).toBeTruthy();
      expect(Array.isArray(listed.body.withdrawals)).toBe(true);
      expect(JSON.stringify(listed.body)).not.toMatch(/STRIPE_SECRET|BEGIN RSA PRIVATE KEY|DATABASE_URL/);

      const patched = await authJson("/api/admin/monetisation/config", admin.token, {
        method: "PATCH",
        body: JSON.stringify({
          field: "giftSettlementHours",
          value: nextHours,
          reason: "PAGE-074 IT",
          updatedBy: attacker.id,
          giftCreatorPct: 1,
        }),
      });
      expect(patched.status).toBe(200);
      expect(patched.body).toMatchObject({
        ok: true,
        config: {
          giftCreatorPct: originalCreator,
          giftPlatformPct: originalPlatform,
          giftSettlementHours: nextHours,
        },
      });
      const persistedHours = await getPool().query<{ gift_settlement_hours: number }>(
        `SELECT gift_settlement_hours FROM monetisation_config WHERE id = 1`,
      );
      expect(Number(persistedHours.rows[0]?.gift_settlement_hours)).toBe(nextHours);

      const nextCreator = originalCreator === 61 ? 62 : 61;
      const split = await authJson("/api/admin/monetisation/config", admin.token, {
        method: "PATCH",
        body: JSON.stringify({ field: "giftCreatorPct", value: nextCreator }),
      });
      expect(split.status).toBe(200);
      expect(split.body).toMatchObject({
        ok: true,
        config: { giftCreatorPct: nextCreator, giftPlatformPct: 100 - nextCreator },
      });
      const persistedSplit = await getPool().query<{ gift_creator_pct: number; gift_platform_pct: number }>(
        `SELECT gift_creator_pct, gift_platform_pct FROM monetisation_config WHERE id = 1`,
      );
      expect(Number(persistedSplit.rows[0]?.gift_creator_pct)).toBe(nextCreator);
      expect(Number(persistedSplit.rows[0]?.gift_platform_pct)).toBe(100 - nextCreator);

      const invalidPct = await authJson("/api/admin/monetisation/config", admin.token, {
        method: "PATCH",
        body: JSON.stringify({ field: "giftCreatorPct", value: 101 }),
      });
      expect(invalidPct.status).toBe(400);
      const decimal = await authJson("/api/admin/monetisation/config", admin.token, {
        method: "PATCH",
        body: JSON.stringify({ field: "giftSettlementHours", value: 72.5 }),
      });
      expect(decimal.status).toBe(400);
      const asString = await authJson("/api/admin/monetisation/config", admin.token, {
        method: "PATCH",
        body: JSON.stringify({ field: "giftSettlementHours", value: "73" }),
      });
      expect(asString.status).toBe(400);
      const unknown = await authJson("/api/admin/monetisation/config", admin.token, {
        method: "PATCH",
        body: JSON.stringify({ field: "withdrawMinPence", value: 1000 }),
      });
      expect(unknown.status).toBe(400);
      const empty = await authJson("/api/admin/monetisation/config", admin.token, {
        method: "PATCH",
        body: JSON.stringify({ is_admin: true }),
      });
      expect(empty.status).toBe(400);

      const economyStill = await authJson("/api/admin/economy", admin.token);
      expect(economyStill.status).toBe(200);
      expect(Array.isArray(economyStill.body.gifts)).toBe(true);

      await getPool().query(`UPDATE users SET is_admin = false WHERE id = $1`, [admin.id]);
      const revoked = await authJson("/api/admin/monetisation", admin.token);
      expect(revoked.status).toBe(403);
      assertNoMonetisation(revoked.body);
      const revokedPatch = await authJson("/api/admin/monetisation/config", admin.token, {
        method: "PATCH",
        body: JSON.stringify({ field: "giftSettlementHours", value: nextHours }),
      });
      expect(revokedPatch.status).toBe(403);
      assertNoMonetisation(revokedPatch.body);
    } finally {
      await getPool().query(
        `UPDATE monetisation_config
            SET gift_creator_pct = $1,
                gift_platform_pct = $2,
                gift_settlement_hours = $3
          WHERE id = 1`,
        [originalCreator, originalPlatform, originalHours],
      );
    }
  }, 60_000);

  it("PAGE-075 admin IAP and Shop purchases are gated by users.is_admin", async ({ skip }) => {
    if (!db || !base) {
      skip();
      return;
    }

    async function registerIsolated(prefix: string) {
      const username = `${prefix}${Math.random().toString(36).slice(2, 10)}`.slice(0, 12);
      const res = await fetch(`${base}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: `${username}@example.com`,
          username,
          password: "password12",
          ageConfirmed13Plus: true,
          consentVersion: "2026-07-21",
        }),
      });
      const body = (await res.json()) as { token?: string; user?: { id?: string; isAdmin?: boolean } };
      expect(res.status).toBe(201);
      return {
        id: String(body.user?.id ?? ""),
        token: accessTokenFromLogin(body),
        isAdmin: body.user?.isAdmin === true,
      };
    }

    async function authJson(pathName: string, userToken: string | null, init: RequestInit = {}) {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(init.headers as Record<string, string> | undefined),
      };
      if (userToken) headers.Authorization = `Bearer ${userToken}`;
      const res = await fetch(`${base}${pathName}`, { ...init, headers });
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      return { status: res.status, body, cache: res.headers.get("cache-control") };
    }

    function assertNoPurchases(body: Record<string, unknown>) {
      expect(body).not.toHaveProperty("data");
      expect(body).not.toHaveProperty("source");
      expect(body).not.toHaveProperty("rows");
      expect(JSON.stringify(body)).not.toMatch(
        /raw_payload|purchaseToken|DATABASE_URL|VALKEY|LIVEKIT_API_SECRET|STRIPE_SECRET|BEGIN RSA PRIVATE KEY|client_secret/,
      );
    }

    const buyer = await registerIsolated("p75");
    const appleTxn = `apple-075-${Date.now()}`;
    const googleTxn = `google-075-${Date.now()}`;
    const sessionId = `cs_test_075_${Date.now()}`;
    const item = await getPool().query<{ id: string }>(
      `INSERT INTO shop_items (seller_id, title, description, price_pence)
       VALUES ($1, $2, '', 1999)
       RETURNING id::text AS id`,
      [buyer.id, "PAGE-075 fixture"],
    );
    const itemId = item.rows[0]?.id;
    expect(itemId).toBeTruthy();
    const apple = await getPool().query<{ id: string }>(
      `INSERT INTO processed_purchases (user_id, provider, product_id, provider_txn_id, coins, status, raw_payload)
       VALUES ($1, 'apple', 'coins100', $2, 100, 'credited', '{"receipt":"do-not-leak"}'::jsonb)
       RETURNING id::text AS id`,
      [buyer.id, appleTxn],
    );
    const google = await getPool().query<{ id: string }>(
      `INSERT INTO processed_purchases (user_id, provider, product_id, provider_txn_id, coins, status, raw_payload)
       VALUES ($1, 'google', 'coins500', $2, 500, 'reversed', '{"purchaseToken":"do-not-leak"}'::jsonb)
       RETURNING id::text AS id`,
      [buyer.id, googleTxn],
    );
    const shop = await getPool().query<{ id: string }>(
      `INSERT INTO shop_purchases (buyer_id, item_id, stripe_session_id, status, quantity, amount_pence)
       VALUES ($1, $2, $3, 'paid', 1, 1999)
       RETURNING id::text AS id`,
      [buyer.id, itemId, sessionId],
    );
    const appleId = apple.rows[0]?.id;
    const googleId = google.rows[0]?.id;
    const shopId = shop.rows[0]?.id;
    const walletBefore = await getPool().query<{ paid_coins: number }>(
      `SELECT paid_coins FROM wallet_balances WHERE user_id = $1`,
      [buyer.id],
    );
    const paidBefore = Number(walletBefore.rows[0]?.paid_coins ?? 0);

    try {
      const loggedOutIap = await authJson("/api/admin/iap-purchases", null);
      expect(loggedOutIap.status).toBe(401);
      assertNoPurchases(loggedOutIap.body);
      const loggedOutShop = await authJson("/api/admin/shop-purchases", null);
      expect(loggedOutShop.status).toBe(401);
      assertNoPurchases(loggedOutShop.body);
      const loggedOutAlias = await authJson("/api/admin/purchases", null);
      expect(loggedOutAlias.status).toBe(404);

      const attacker = await registerIsolated("b75");
      expect(attacker.isAdmin).toBe(false);
      const attackerIap = await authJson("/api/admin/iap-purchases", attacker.token);
      expect(attackerIap.status).toBe(403);
      assertNoPurchases(attackerIap.body);
      const attackerShop = await authJson("/api/admin/shop-purchases", attacker.token);
      expect(attackerShop.status).toBe(403);
      assertNoPurchases(attackerShop.body);

      const admin = await registerIsolated("a75");
      await getPool().query(`UPDATE users SET is_admin = true WHERE id = $1`, [admin.id]);

      const iap = await authJson("/api/admin/iap-purchases", admin.token);
      expect(iap.status).toBe(200);
      expect(iap.cache).toMatch(/no-store/);
      expect(iap.body.source).toBe("iap");
      const iapRows = iap.body.data as Array<Record<string, unknown>>;
      expect(Array.isArray(iapRows)).toBe(true);
      const appleRow = iapRows.find((row) => row.id === appleId);
      const googleRow = iapRows.find((row) => row.id === googleId);
      expect(appleRow).toMatchObject({
        user_id: buyer.id,
        provider: "apple",
        product_id: "coins100",
        transaction_id: appleTxn,
        coins: 100,
        status: "credited",
      });
      expect(googleRow).toMatchObject({
        user_id: buyer.id,
        provider: "google",
        product_id: "coins500",
        transaction_id: googleTxn,
        coins: 500,
        status: "reversed",
      });
      expect(JSON.stringify(iap.body)).not.toMatch(/raw_payload|purchaseToken|do-not-leak|receipt/);

      const alias = await authJson("/api/admin/purchases", admin.token);
      expect(alias.status).toBe(404);

      const shopList = await authJson("/api/admin/shop-purchases", admin.token);
      expect(shopList.status).toBe(200);
      expect(shopList.body.source).toBe("shop");
      const shopRows = shopList.body.data as Array<Record<string, unknown>>;
      expect(shopRows.find((row) => row.id === shopId)).toMatchObject({
        user_id: buyer.id,
        stripe_session_id: sessionId,
        item_id: itemId,
        quantity: 1,
        amount_pence: 1999,
        status: "paid",
      });
      expect(JSON.stringify(shopList.body)).not.toMatch(/STRIPE_SECRET|client_secret|payment_intent/);

      const monetisationStill = await authJson("/api/admin/monetisation", admin.token);
      expect(monetisationStill.status).toBe(200);
      expect(monetisationStill.body).toHaveProperty("config");

      const walletAfter = await getPool().query<{ paid_coins: number }>(
        `SELECT paid_coins FROM wallet_balances WHERE user_id = $1`,
        [buyer.id],
      );
      expect(Number(walletAfter.rows[0]?.paid_coins ?? 0)).toBe(paidBefore);

      await getPool().query(`UPDATE users SET is_admin = false WHERE id = $1`, [admin.id]);
      const revoked = await authJson("/api/admin/iap-purchases", admin.token);
      expect(revoked.status).toBe(403);
      assertNoPurchases(revoked.body);
      const revokedShop = await authJson("/api/admin/shop-purchases", admin.token);
      expect(revokedShop.status).toBe(403);
      assertNoPurchases(revokedShop.body);
    } finally {
      await getPool().query(`DELETE FROM shop_purchases WHERE stripe_session_id = $1`, [sessionId]);
      await getPool().query(`DELETE FROM shop_items WHERE id = $1`, [itemId]);
      await getPool().query(`DELETE FROM processed_purchases WHERE provider_txn_id = ANY($1::text[])`, [
        [appleTxn, googleTxn],
      ]);
    }
  }, 60_000);

  it("PAGE-076 admin withdrawals are gated by users.is_admin and apply one economic action", async ({ skip }) => {
    if (!db || !base) {
      skip();
      return;
    }

    async function registerIsolated(prefix: string) {
      const username = `${prefix}${Math.random().toString(36).slice(2, 10)}`.slice(0, 12);
      const res = await fetch(`${base}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: `${username}@example.com`,
          username,
          password: "password12",
          ageConfirmed13Plus: true,
          consentVersion: "2026-07-21",
        }),
      });
      const body = (await res.json()) as { token?: string; user?: { id?: string; isAdmin?: boolean } };
      expect(res.status).toBe(201);
      return {
        id: String(body.user?.id ?? ""),
        token: accessTokenFromLogin(body),
        isAdmin: body.user?.isAdmin === true,
      };
    }

    async function authJson(pathName: string, userToken: string | null, init: RequestInit = {}) {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(init.headers as Record<string, string> | undefined),
      };
      if (userToken) headers.Authorization = `Bearer ${userToken}`;
      const res = await fetch(`${base}${pathName}`, { ...init, headers });
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      return { status: res.status, body, cache: res.headers.get("cache-control") };
    }

    function assertNoWithdrawals(body: Record<string, unknown>) {
      expect(body).not.toHaveProperty("withdrawals");
      expect(body).not.toHaveProperty("withdrawal");
      expect(body).not.toHaveProperty("reversed");
      expect(body).not.toHaveProperty("rows");
      expect(JSON.stringify(body)).not.toMatch(
        /DATABASE_URL|VALKEY|LIVEKIT_API_SECRET|STRIPE_SECRET|BEGIN RSA PRIVATE KEY|client_secret|iban_or_account/,
      );
    }

    async function seedCreatorWithdrawal(prefix: string, amountPence: number) {
      const creator = await registerIsolated(prefix);
      await getPool().query(
        `INSERT INTO creator_wallet_gbp (user_id, available_pence, held_pence, withdrawn_pence, pending_pence)
         VALUES ($1, $2, 0, 0, 0)
         ON CONFLICT (user_id) DO UPDATE
           SET available_pence = $2, held_pence = 0, withdrawn_pence = 0, pending_pence = 0, updated_at = NOW()`,
        [creator.id, amountPence],
      );
      const method = await authJson("/api/creator/payout-method", creator.token, {
        method: "POST",
        body: JSON.stringify({
          type: "bank",
          details: { account_name: "Creator", iban_or_account: "GB82WEST12345698765432" },
        }),
      });
      expect(method.status).toBe(200);
      const requested = await authJson("/api/creator/withdraw-gbp", creator.token, {
        method: "POST",
        body: JSON.stringify({
          amount_pence: amountPence,
          idempotency_key: `${prefix}-wd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        }),
      });
      expect(requested.status).toBe(200);
      expect(requested.body).toMatchObject({ ok: true, status: "pending" });
      return { creator, withdrawalId: String(requested.body.id ?? ""), amountPence };
    }

    async function walletOf(userId: string) {
      const row = await getPool().query<{
        available_pence: string;
        held_pence: string;
        withdrawn_pence: string;
        pending_pence: string;
      }>(
        `SELECT available_pence::text, held_pence::text, withdrawn_pence::text, pending_pence::text
           FROM creator_wallet_gbp WHERE user_id = $1`,
        [userId],
      );
      return {
        available: Number(row.rows[0]?.available_pence ?? -1),
        held: Number(row.rows[0]?.held_pence ?? -1),
        withdrawn: Number(row.rows[0]?.withdrawn_pence ?? -1),
        pending: Number(row.rows[0]?.pending_pence ?? -1),
      };
    }

    const reviewFixture = await seedCreatorWithdrawal("p76a", 5000);
    const rejectFixture = await seedCreatorWithdrawal("p76b", 2500);
    const cancelFixture = await seedCreatorWithdrawal("p76c", 1500);
    const concurrentFixture = await seedCreatorWithdrawal("p76d", 4000);
    const chargebackCreator = await registerIsolated("p76e");
    const earning = await getPool().query<{ id: string }>(
      `INSERT INTO creator_earnings (creator_id, coins, amount_pence, status, available_at)
       VALUES ($1, 10, 600, 'available', NOW())
       RETURNING id::text AS id`,
      [chargebackCreator.id],
    );
    await getPool().query(
      `INSERT INTO creator_wallet_gbp (user_id, available_pence, held_pence, withdrawn_pence, pending_pence)
       VALUES ($1, 600, 0, 0, 0)
       ON CONFLICT (user_id) DO UPDATE
         SET available_pence = 600, held_pence = 0, withdrawn_pence = 0, pending_pence = 0, updated_at = NOW()`,
      [chargebackCreator.id],
    );
    const earningId = earning.rows[0]?.id ?? "";
    const unfreezeCreator = await registerIsolated("p76f");
    await getPool().query(
      `INSERT INTO creator_wallet_gbp (user_id, available_pence, held_pence, withdrawn_pence, pending_pence)
       VALUES ($1, 0, 900, 0, 0)
       ON CONFLICT (user_id) DO UPDATE
         SET available_pence = 0, held_pence = 900, withdrawn_pence = 0, pending_pence = 0, updated_at = NOW()`,
      [unfreezeCreator.id],
    );

    try {
      const loggedOutList = await authJson("/api/admin/withdrawals", null);
      expect(loggedOutList.status).toBe(401);
      assertNoWithdrawals(loggedOutList.body);
      const loggedOutReview = await authJson(`/api/admin/withdrawals/${reviewFixture.withdrawalId}/review`, null, {
        method: "POST",
        body: "{}",
      });
      expect(loggedOutReview.status).toBe(401);
      assertNoWithdrawals(loggedOutReview.body);
      const loggedOutChargeback = await authJson("/api/admin/chargeback", null, {
        method: "POST",
        body: JSON.stringify({ earning_id: earningId }),
      });
      expect(loggedOutChargeback.status).toBe(401);
      const loggedOutUnfreeze = await authJson(`/api/admin/unfreeze/${unfreezeCreator.id}`, null, { method: "POST" });
      expect(loggedOutUnfreeze.status).toBe(401);

      const attacker = await registerIsolated("b76");
      expect(attacker.isAdmin).toBe(false);
      const attackerList = await authJson("/api/admin/withdrawals?status=pending", attacker.token);
      expect(attackerList.status).toBe(403);
      assertNoWithdrawals(attackerList.body);
      const attackerApprove = await authJson(`/api/admin/withdrawals/${reviewFixture.withdrawalId}/approve`, attacker.token, {
        method: "POST",
        body: "{}",
      });
      expect(attackerApprove.status).toBe(403);
      assertNoWithdrawals(attackerApprove.body);
      const attackerChargeback = await authJson("/api/admin/chargeback", attacker.token, {
        method: "POST",
        body: JSON.stringify({ earning_id: earningId }),
      });
      expect(attackerChargeback.status).toBe(403);
      const attackerUnfreeze = await authJson(`/api/admin/unfreeze/${unfreezeCreator.id}`, attacker.token, {
        method: "POST",
      });
      expect(attackerUnfreeze.status).toBe(403);

      const admin = await registerIsolated("a76");
      const adminB = await registerIsolated("c76");
      await getPool().query(`UPDATE users SET is_admin = true WHERE id = ANY($1::uuid[])`, [[admin.id, adminB.id]]);

      const listed = await authJson("/api/admin/withdrawals?status=pending", admin.token);
      expect(listed.status).toBe(200);
      expect(listed.cache).toMatch(/no-store/);
      const listedRows = listed.body.withdrawals as Array<Record<string, unknown>>;
      expect(Array.isArray(listedRows)).toBe(true);
      const reviewRow = listedRows.find((row) => row.id === reviewFixture.withdrawalId);
      expect(reviewRow).toMatchObject({
        user_id: reviewFixture.creator.id,
        amount_pence: 5000,
        currency: "GBP",
        status: "pending",
      });
      expect(JSON.stringify(listed.body)).not.toMatch(/STRIPE_SECRET|client_secret|iban_or_account|password_hash/);

      const badFilter = await authJson("/api/admin/withdrawals?status=paid", admin.token);
      expect(badFilter.status).toBe(400);
      const sqlFilter = await authJson("/api/admin/withdrawals?status=pending%27%3Bdrop%20table%20withdrawals_gbp", admin.token);
      expect(sqlFilter.status).toBe(400);

      const reviewed = await authJson(`/api/admin/withdrawals/${reviewFixture.withdrawalId}/review`, admin.token, {
        method: "POST",
        body: JSON.stringify({ admin_note: "checking", reviewedBy: attacker.id, status: "paid_manually", amount_pence: 999999 }),
      });
      expect(reviewed.status).toBe(200);
      expect((reviewed.body.withdrawal as { status?: string; processed_by?: string }).status).toBe("under_review");
      expect((reviewed.body.withdrawal as { processed_by?: string }).processed_by).toBe(admin.id);
      expect(await walletOf(reviewFixture.creator.id)).toMatchObject({ available: 0, held: 5000, withdrawn: 0 });
      const reviewedAgain = await authJson(`/api/admin/withdrawals/${reviewFixture.withdrawalId}/review`, admin.token, {
        method: "POST",
        body: "{}",
      });
      expect(reviewedAgain.status).toBe(400);
      expect(await walletOf(reviewFixture.creator.id)).toMatchObject({ available: 0, held: 5000, withdrawn: 0 });

      const approved = await authJson(`/api/admin/withdrawals/${reviewFixture.withdrawalId}/approve`, admin.token, {
        method: "POST",
        body: "{}",
      });
      expect(approved.status).toBe(200);
      expect((approved.body.withdrawal as { status?: string }).status).toBe("approved");
      expect(await walletOf(reviewFixture.creator.id)).toMatchObject({ available: 0, held: 0, withdrawn: 5000 });
      const approvedAgain = await authJson(`/api/admin/withdrawals/${reviewFixture.withdrawalId}/approve`, admin.token, {
        method: "POST",
        body: "{}",
      });
      expect(approvedAgain.status).toBe(400);
      expect(await walletOf(reviewFixture.creator.id)).toMatchObject({ available: 0, held: 0, withdrawn: 5000 });

      const rejectAfterApprove = await authJson(`/api/admin/withdrawals/${reviewFixture.withdrawalId}/reject`, admin.token, {
        method: "POST",
        body: JSON.stringify({ admin_note: "too late" }),
      });
      expect(rejectAfterApprove.status).toBe(400);
      expect(await walletOf(reviewFixture.creator.id)).toMatchObject({ available: 0, held: 0, withdrawn: 5000 });

      const paid = await authJson(`/api/admin/withdrawals/${reviewFixture.withdrawalId}/mark-paid`, admin.token, {
        method: "POST",
        body: JSON.stringify({ admin_note: "bank ref 076" }),
      });
      expect(paid.status).toBe(200);
      expect((paid.body.withdrawal as { status?: string; admin_note?: string }).status).toBe("paid_manually");
      expect((paid.body.withdrawal as { admin_note?: string }).admin_note).toBe("bank ref 076");
      expect(await walletOf(reviewFixture.creator.id)).toMatchObject({ available: 0, held: 0, withdrawn: 5000 });
      const paidAgain = await authJson(`/api/admin/withdrawals/${reviewFixture.withdrawalId}/mark-paid`, admin.token, {
        method: "POST",
        body: JSON.stringify({ admin_note: "bank ref 076 again" }),
      });
      expect(paidAgain.status).toBe(400);
      expect(await walletOf(reviewFixture.creator.id)).toMatchObject({ available: 0, held: 0, withdrawn: 5000 });

      const creatorHistory = await authJson("/api/creator/withdrawals-gbp", reviewFixture.creator.token);
      expect(creatorHistory.status).toBe(200);
      const historyRows = (creatorHistory.body.withdrawals as Array<{ id?: string; status?: string }>) ?? [];
      expect(historyRows.find((row) => row.id === reviewFixture.withdrawalId)?.status).toBe("paid_manually");

      const rejected = await authJson(`/api/admin/withdrawals/${rejectFixture.withdrawalId}/reject`, admin.token, {
        method: "POST",
        body: JSON.stringify({ admin_note: "not eligible" }),
      });
      expect(rejected.status).toBe(200);
      expect((rejected.body.withdrawal as { status?: string }).status).toBe("rejected");
      expect(await walletOf(rejectFixture.creator.id)).toMatchObject({ available: 2500, held: 0, withdrawn: 0 });
      const rejectedAgain = await authJson(`/api/admin/withdrawals/${rejectFixture.withdrawalId}/reject`, admin.token, {
        method: "POST",
        body: JSON.stringify({ admin_note: "not eligible" }),
      });
      expect(rejectedAgain.status).toBe(400);
      expect(await walletOf(rejectFixture.creator.id)).toMatchObject({ available: 2500, held: 0, withdrawn: 0 });

      const missingNote = await authJson(`/api/admin/withdrawals/${cancelFixture.withdrawalId}/cancel`, admin.token, {
        method: "POST",
        body: "{}",
      });
      expect(missingNote.status).toBe(400);
      const cancelled = await authJson(`/api/admin/withdrawals/${cancelFixture.withdrawalId}/cancel`, admin.token, {
        method: "POST",
        body: JSON.stringify({ admin_note: "creator asked to stop" }),
      });
      expect(cancelled.status).toBe(200);
      expect((cancelled.body.withdrawal as { status?: string }).status).toBe("cancelled");
      expect(await walletOf(cancelFixture.creator.id)).toMatchObject({ available: 1500, held: 0, withdrawn: 0 });
      const cancelledAgain = await authJson(`/api/admin/withdrawals/${cancelFixture.withdrawalId}/cancel`, admin.token, {
        method: "POST",
        body: JSON.stringify({ admin_note: "creator asked to stop" }),
      });
      expect(cancelledAgain.status).toBe(400);
      expect(await walletOf(cancelFixture.creator.id)).toMatchObject({ available: 1500, held: 0, withdrawn: 0 });

      const [left, right] = await Promise.all([
        authJson(`/api/admin/withdrawals/${concurrentFixture.withdrawalId}/approve`, admin.token, {
          method: "POST",
          body: "{}",
        }),
        authJson(`/api/admin/withdrawals/${concurrentFixture.withdrawalId}/approve`, adminB.token, {
          method: "POST",
          body: "{}",
        }),
      ]);
      const statuses = [left.status, right.status].sort();
      expect(statuses).toEqual([200, 400]);
      expect(await walletOf(concurrentFixture.creator.id)).toMatchObject({ available: 0, held: 0, withdrawn: 4000 });
      const approveLedger = await getPool().query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM financial_ledger WHERE idempotency_key = $1`,
        [`withdrawal_approve:${concurrentFixture.withdrawalId}`],
      );
      expect(Number(approveLedger.rows[0]?.n ?? 0)).toBe(1);

      const unknownAction = await authJson(`/api/admin/withdrawals/${reviewFixture.withdrawalId}/explode`, admin.token, {
        method: "POST",
        body: "{}",
      });
      expect(unknownAction.status).toBe(404);
      const cancelPaid = await authJson(`/api/admin/withdrawals/${reviewFixture.withdrawalId}/cancel`, admin.token, {
        method: "POST",
        body: JSON.stringify({ admin_note: "cannot cancel paid" }),
      });
      expect(cancelPaid.status).toBe(400);

      const charged = await authJson("/api/admin/chargeback", admin.token, {
        method: "POST",
        body: JSON.stringify({ earning_id: earningId, gift_tx_id: earningId }),
      });
      expect(charged.status).toBe(200);
      expect(charged.body).toMatchObject({
        reversed: { id: earningId, creator_id: chargebackCreator.id, amount_pence: 600, status: "reversed" },
      });
      expect(await walletOf(chargebackCreator.id)).toMatchObject({ available: 0, pending: 0 });
      const chargedAgain = await authJson("/api/admin/chargeback", admin.token, {
        method: "POST",
        body: JSON.stringify({ earning_id: earningId }),
      });
      expect(chargedAgain.status).toBe(400);
      expect(await walletOf(chargebackCreator.id)).toMatchObject({ available: 0, pending: 0 });
      const shopStill = await getPool().query<{ n: string }>(`SELECT COUNT(*)::text AS n FROM shop_purchases`);
      expect(Number(shopStill.rows[0]?.n ?? 0)).toBeGreaterThanOrEqual(0);

      const unfrozen = await authJson(`/api/admin/unfreeze/${unfreezeCreator.id}`, admin.token, { method: "POST" });
      expect(unfrozen.status).toBe(200);
      expect(unfrozen.body).toMatchObject({ ok: true, userId: unfreezeCreator.id, released: 900, still_reserved: 0 });
      expect(await walletOf(unfreezeCreator.id)).toMatchObject({ available: 900, held: 0 });
      const unfrozenAgain = await authJson(`/api/admin/unfreeze/${unfreezeCreator.id}`, admin.token, { method: "POST" });
      expect(unfrozenAgain.status).toBe(200);
      expect(unfrozenAgain.body).toMatchObject({ released: 0, still_reserved: 0 });
      expect(await walletOf(unfreezeCreator.id)).toMatchObject({ available: 900, held: 0 });

      const monetisationStill = await authJson("/api/admin/monetisation", admin.token);
      expect(monetisationStill.status).toBe(200);
      expect(monetisationStill.body).toHaveProperty("config");
      const purchasesStill = await authJson("/api/admin/iap-purchases", admin.token);
      expect(purchasesStill.status).toBe(200);

      await getPool().query(`UPDATE users SET is_admin = false WHERE id = $1`, [admin.id]);
      const revoked = await authJson("/api/admin/withdrawals", admin.token);
      expect(revoked.status).toBe(403);
      assertNoWithdrawals(revoked.body);
      const revokedApprove = await authJson(`/api/admin/withdrawals/${concurrentFixture.withdrawalId}/approve`, admin.token, {
        method: "POST",
        body: "{}",
      });
      expect(revokedApprove.status).toBe(403);
    } finally {
      await getPool().query(`DELETE FROM financial_ledger WHERE ref_id = ANY($1::text[])`, [
        [
          reviewFixture.withdrawalId,
          rejectFixture.withdrawalId,
          cancelFixture.withdrawalId,
          concurrentFixture.withdrawalId,
          earningId,
        ],
      ]);
      await getPool().query(`DELETE FROM withdrawals_gbp WHERE id = ANY($1::uuid[])`, [
        [
          reviewFixture.withdrawalId,
          rejectFixture.withdrawalId,
          cancelFixture.withdrawalId,
          concurrentFixture.withdrawalId,
        ],
      ]);
      await getPool().query(`DELETE FROM creator_earnings WHERE id = $1`, [earningId]);
    }
  }, 60_000);

  it("PAGE-077 admin Rising Stars is gated by users.is_admin and mutates canonical rs_* only", async ({ skip }) => {
    if (!db || !base) {
      skip();
      return;
    }

    async function registerIsolated(prefix: string) {
      const username = `${prefix}${Math.random().toString(36).slice(2, 10)}`.slice(0, 12);
      const res = await fetch(`${base}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: `${username}@example.com`,
          username,
          password: "password12",
          ageConfirmed13Plus: true,
          consentVersion: "2026-07-21",
        }),
      });
      const body = (await res.json()) as { token?: string; user?: { id?: string; isAdmin?: boolean } };
      expect(res.status).toBe(201);
      return {
        id: String(body.user?.id ?? ""),
        token: accessTokenFromLogin(body),
        isAdmin: body.user?.isAdmin === true,
      };
    }

    async function authJson(pathName: string, userToken: string | null, init: RequestInit = {}) {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(init.headers as Record<string, string> | undefined),
      };
      if (userToken) headers.Authorization = `Bearer ${userToken}`;
      const res = await fetch(`${base}${pathName}`, { ...init, headers });
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      return { status: res.status, body, cache: res.headers.get("cache-control") };
    }

    function assertNoAdminRs(body: Record<string, unknown>) {
      expect(body).not.toHaveProperty("seasons");
      expect(body).not.toHaveProperty("challenges");
      expect(body).not.toHaveProperty("audit");
      expect(body).not.toHaveProperty("season");
      expect(body).not.toHaveProperty("challenge");
      expect(body).not.toHaveProperty("entry");
      expect(body).not.toHaveProperty("badge");
      expect(body).not.toHaveProperty("reward");
      expect(body).not.toHaveProperty("grant");
      expect(JSON.stringify(body)).not.toMatch(
        /DATABASE_URL|VALKEY|LIVEKIT_API_SECRET|STRIPE_SECRET|BEGIN RSA PRIVATE KEY|client_secret/,
      );
    }

    const starts = new Date(Date.now() + 86_400_000).toISOString();
    const ends = new Date(Date.now() + 2 * 86_400_000).toISOString();
    const slug = `p077-${Math.random().toString(36).slice(2, 10)}`;
    let seasonId = "";

    const currentBefore = await authJson("/api/rising-stars/seasons/current", null);
    expect(currentBefore.status).toBe(200);
    const currentSeasonId =
      currentBefore.body.season && typeof currentBefore.body.season === "object"
        ? String((currentBefore.body.season as { id?: string }).id ?? "")
        : "";

    try {
      const loggedOutSeasons = await authJson("/api/admin/rising-stars/seasons", null);
      expect(loggedOutSeasons.status).toBe(401);
      assertNoAdminRs(loggedOutSeasons.body);
      const loggedOutCreate = await authJson("/api/admin/rising-stars/seasons", null, {
        method: "POST",
        body: JSON.stringify({
          slug,
          title: "P077 Season",
          starts_at: starts,
          ends_at: ends,
          status: "draft",
        }),
      });
      expect(loggedOutCreate.status).toBe(401);
      assertNoAdminRs(loggedOutCreate.body);

      const attacker = await registerIsolated("b77");
      expect(attacker.isAdmin).toBe(false);
      const attackerSeasons = await authJson("/api/admin/rising-stars/seasons", attacker.token);
      expect(attackerSeasons.status).toBe(403);
      assertNoAdminRs(attackerSeasons.body);
      const attackerCreate = await authJson("/api/admin/rising-stars/seasons", attacker.token, {
        method: "POST",
        body: JSON.stringify({
          slug,
          title: "P077 Season",
          starts_at: starts,
          ends_at: ends,
          status: "draft",
        }),
      });
      expect(attackerCreate.status).toBe(403);
      assertNoAdminRs(attackerCreate.body);

      const admin = await registerIsolated("a77");
      const adminB = await registerIsolated("c77");
      const creator = await registerIsolated("d77");
      const voter = await registerIsolated("e77");
      await getPool().query(`UPDATE users SET is_admin = true WHERE id = ANY($1::uuid[])`, [[admin.id, adminB.id]]);

      const listed = await authJson("/api/admin/rising-stars/seasons", admin.token);
      expect(listed.status).toBe(200);
      expect(listed.cache).toMatch(/no-store/);
      expect(Array.isArray(listed.body.seasons)).toBe(true);

      const badStatus = await authJson("/api/admin/rising-stars/seasons", admin.token, {
        method: "POST",
        body: JSON.stringify({
          slug: `${slug}-bad`,
          title: "Bad",
          starts_at: starts,
          ends_at: ends,
          status: "whatever",
        }),
      });
      expect(badStatus.status).toBe(400);

      const invertedDates = await authJson("/api/admin/rising-stars/seasons", admin.token, {
        method: "POST",
        body: JSON.stringify({
          slug: `${slug}-dates`,
          title: "Bad dates",
          starts_at: ends,
          ends_at: starts,
          status: "draft",
        }),
      });
      expect(invertedDates.status).toBe(400);

      const created = await authJson("/api/admin/rising-stars/seasons", admin.token, {
        method: "POST",
        body: JSON.stringify({
          slug,
          title: "P077 Season",
          description: "isolated draft",
          starts_at: starts,
          ends_at: ends,
          status: "draft",
        }),
      });
      expect(created.status).toBe(201);
      seasonId = String((created.body.season as { id?: string } | undefined)?.id ?? "");
      expect(seasonId).toMatch(/^[0-9a-f-]{36}$/i);

      const createdAgain = await authJson("/api/admin/rising-stars/seasons", admin.token, {
        method: "POST",
        body: JSON.stringify({
          slug,
          title: "P077 Season",
          starts_at: starts,
          ends_at: ends,
          status: "draft",
        }),
      });
      expect(createdAgain.status).toBe(409);

      const category = await authJson("/api/admin/rising-stars/categories", admin.token, {
        method: "POST",
        body: JSON.stringify({ season_id: seasonId, slug: "music", title: "Music" }),
      });
      expect(category.status).toBe(201);
      const categoryId = String((category.body.category as { id?: string } | undefined)?.id ?? "");

      const region = await authJson("/api/admin/rising-stars/regions", admin.token, {
        method: "POST",
        body: JSON.stringify({
          season_id: seasonId,
          slug: "uk",
          title: "United Kingdom",
          country_codes: ["GB"],
        }),
      });
      expect(region.status).toBe(201);
      const regionId = String((region.body.region as { id?: string } | undefined)?.id ?? "");

      const challenge = await authJson("/api/admin/rising-stars/challenges", admin.token, {
        method: "POST",
        body: JSON.stringify({
          season_id: seasonId,
          category_id: categoryId,
          region_id: regionId,
          week_index: 1,
          title: "P077 Challenge",
          sound_track_id: "epidemic-p077",
          opens_at: starts,
          closes_at: ends,
          status: "scheduled",
        }),
      });
      expect(challenge.status).toBe(201);
      const challengeId = String((challenge.body.challenge as { id?: string } | undefined)?.id ?? "");
      expect(challengeId).toMatch(/^[0-9a-f-]{36}$/i);

      const unknownPatch = await authJson(
        "/api/admin/rising-stars/challenges/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/status",
        admin.token,
        { method: "PATCH", body: JSON.stringify({ status: "open" }) },
      );
      expect(unknownPatch.status).toBe(404);

      const opened = await authJson(`/api/admin/rising-stars/challenges/${challengeId}/status`, admin.token, {
        method: "PATCH",
        body: JSON.stringify({ status: "open" }),
      });
      expect(opened.status).toBe(200);
      expect((opened.body.challenge as { status?: string }).status).toBe("open");
      const openedAgain = await authJson(`/api/admin/rising-stars/challenges/${challengeId}/status`, admin.token, {
        method: "PATCH",
        body: JSON.stringify({ status: "open" }),
      });
      expect(openedAgain.status).toBe(200);

      const adminChallenges = await authJson(
        `/api/admin/rising-stars/challenges?seasonId=${encodeURIComponent(seasonId)}`,
        admin.token,
      );
      expect(adminChallenges.status).toBe(200);
      expect(((adminChallenges.body.challenges as Array<{ id: string }>) ?? []).some((row) => row.id === challengeId)).toBe(
        true,
      );

      await getPool().query(
        `INSERT INTO rs_entries (challenge_id, user_id, vote_count, status)
         VALUES ($1, $2, 5, 'active'), ($1, $3, 2, 'active')`,
        [challengeId, creator.id, voter.id],
      );
      const entries = await getPool().query<{ id: string; user_id: string }>(
        `SELECT id::text AS id, user_id::text AS user_id FROM rs_entries WHERE challenge_id = $1`,
        [challengeId],
      );
      const topEntry = entries.rows.find((row) => row.user_id === creator.id)?.id ?? "";
      const otherEntry = entries.rows.find((row) => row.user_id === voter.id)?.id ?? "";

      const freezeA = authJson(`/api/admin/rising-stars/challenges/${challengeId}/freeze`, admin.token, {
        method: "POST",
        body: JSON.stringify({ frozen: true }),
      });
      const freezeB = authJson(`/api/admin/rising-stars/challenges/${challengeId}/freeze`, adminB.token, {
        method: "POST",
        body: JSON.stringify({ frozen: true }),
      });
      const freezeResults = await Promise.all([freezeA, freezeB]);
      expect(freezeResults.every((row) => row.status === 200)).toBe(true);
      const freezeAgain = await authJson(`/api/admin/rising-stars/challenges/${challengeId}/freeze`, admin.token, {
        method: "POST",
        body: JSON.stringify({ frozen: true }),
      });
      expect(freezeAgain.status).toBe(200);
      expect((freezeAgain.body.challenge as { leaderboard_frozen?: boolean }).leaderboard_frozen).toBe(true);

      const unfreeze = await authJson(`/api/admin/rising-stars/challenges/${challengeId}/freeze`, admin.token, {
        method: "POST",
        body: JSON.stringify({ frozen: false }),
      });
      expect(unfreeze.status).toBe(200);
      expect((unfreeze.body.challenge as { leaderboard_frozen?: boolean }).leaderboard_frozen).toBe(false);

      const snapshot = await authJson(`/api/admin/rising-stars/challenges/${challengeId}/snapshot`, admin.token, {
        method: "POST",
        body: JSON.stringify({ phase: "qualifier", advanceTopN: 1 }),
      });
      expect(snapshot.status).toBe(200);
      expect(snapshot.body.ok).toBe(true);
      expect(snapshot.body.results).toBe(2);
      expect((snapshot.body.challenge as { status?: string; leaderboard_frozen?: boolean }).status).toBe("qualified");
      expect((snapshot.body.challenge as { leaderboard_frozen?: boolean }).leaderboard_frozen).toBe(true);
      const snapshotAgain = await authJson(`/api/admin/rising-stars/challenges/${challengeId}/snapshot`, admin.token, {
        method: "POST",
        body: JSON.stringify({ phase: "qualifier", advanceTopN: 1 }),
      });
      expect(snapshotAgain.status).toBe(200);
      expect(snapshotAgain.body.ok).toBe(true);
      expect(snapshotAgain.body.results).toBe(1);
      const phaseRows = await getPool().query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM rs_phase_results WHERE challenge_id = $1 AND phase = 'qualifier'`,
        [challengeId],
      );
      expect(Number(phaseRows.rows[0]?.n)).toBe(1);
      const entryStates = await getPool().query<{ id: string; status: string }>(
        `SELECT id::text AS id, status FROM rs_entries WHERE challenge_id = $1`,
        [challengeId],
      );
      expect(entryStates.rows.find((row) => row.id === topEntry)?.status).toBe("advanced");
      expect(entryStates.rows.find((row) => row.id === otherEntry)?.status).toBe("eliminated");

      const dq = await authJson(`/api/admin/rising-stars/entries/${otherEntry}/disqualify`, admin.token, {
        method: "POST",
      });
      expect(dq.status).toBe(200);
      expect((dq.body.entry as { status?: string }).status).toBe("disqualified");
      const dqAgain = await authJson(`/api/admin/rising-stars/entries/${otherEntry}/disqualify`, admin.token, {
        method: "POST",
      });
      expect(dqAgain.status).toBe(200);
      const banned = await getPool().query<{ banned_until: Date | null }>(
        `SELECT banned_until FROM users WHERE id = $1`,
        [voter.id],
      );
      expect(banned.rows[0]?.banned_until).toBeNull();

      const publicBoard = await authJson(`/api/rising-stars/challenges/${challengeId}/leaderboard`, null);
      expect(publicBoard.status).toBe(200);
      const board = (publicBoard.body.leaderboard as Array<{ entry_id: string; status: string }>) ?? [];
      expect(board.some((row) => row.entry_id === otherEntry)).toBe(false);
      expect(board.some((row) => row.entry_id === topEntry)).toBe(true);

      const publicDetail = await authJson(`/api/rising-stars/challenges/${challengeId}`, creator.token);
      expect(publicDetail.status).toBe(200);
      expect((publicDetail.body.challenge as { id?: string }).id).toBe(challengeId);

      const badge = await authJson("/api/admin/rising-stars/badges", admin.token, {
        method: "POST",
        body: JSON.stringify({
          season_id: seasonId,
          code: "winner",
          title: "Winner",
          kind: "winner",
        }),
      });
      expect(badge.status).toBe(201);
      const badgeId = String((badge.body.badge as { id?: string } | undefined)?.id ?? "");
      const award = await authJson("/api/admin/rising-stars/badges/award", admin.token, {
        method: "POST",
        body: JSON.stringify({ userId: creator.id, badgeId, challengeId }),
      });
      expect(award.status).toBe(200);
      expect(award.body.created).toBe(true);
      const awardAgain = await authJson("/api/admin/rising-stars/badges/award", admin.token, {
        method: "POST",
        body: JSON.stringify({ userId: creator.id, badgeId, challengeId }),
      });
      expect(awardAgain.status).toBe(200);
      expect(awardAgain.body.created).toBe(false);
      const badgeRows = await getPool().query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM rs_user_badges WHERE user_id = $1 AND badge_id = $2`,
        [creator.id, badgeId],
      );
      expect(Number(badgeRows.rows[0]?.n)).toBe(1);

      const walletBefore = await getPool().query<{
        available_pence: string;
        held_pence: string;
        withdrawn_pence: string;
      }>(
        `SELECT available_pence::text, held_pence::text, withdrawn_pence::text
         FROM creator_wallet_gbp WHERE user_id = $1`,
        [creator.id],
      );
      const reward = await authJson("/api/admin/rising-stars/rewards/definitions", admin.token, {
        method: "POST",
        body: JSON.stringify({
          season_id: seasonId,
          place_from: 1,
          place_to: 1,
          reward_kind: "creator_credit_manual",
          payload: { note: "off-platform" },
        }),
      });
      expect(reward.status).toBe(201);
      const definitionId = String((reward.body.reward as { id?: string } | undefined)?.id ?? "");
      const grant = await authJson("/api/admin/rising-stars/rewards/grants", admin.token, {
        method: "POST",
        body: JSON.stringify({
          definitionId,
          userId: creator.id,
          challengeId,
          status: "granted",
          notes: "manual note only",
        }),
      });
      expect(grant.status).toBe(200);
      const grantAgain = await authJson("/api/admin/rising-stars/rewards/grants", admin.token, {
        method: "POST",
        body: JSON.stringify({
          definitionId,
          userId: creator.id,
          challengeId,
          status: "granted",
        }),
      });
      expect(grantAgain.status).toBe(200);
      expect((grantAgain.body.grant as { id?: string }).id).toBe((grant.body.grant as { id?: string }).id);
      const grantRows = await getPool().query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM rs_reward_grants WHERE definition_id = $1 AND user_id = $2`,
        [definitionId, creator.id],
      );
      expect(Number(grantRows.rows[0]?.n)).toBe(1);
      const walletAfter = await getPool().query<{
        available_pence: string;
        held_pence: string;
        withdrawn_pence: string;
      }>(
        `SELECT available_pence::text, held_pence::text, withdrawn_pence::text
         FROM creator_wallet_gbp WHERE user_id = $1`,
        [creator.id],
      );
      expect(walletAfter.rows[0] ?? null).toEqual(walletBefore.rows[0] ?? null);
      const paidLots = await getPool().query(`SELECT 1 FROM paid_coin_lots WHERE user_id = $1`, [creator.id]);
      expect(paidLots.rowCount ?? 0).toBe(0);
      const withdrawals = await getPool().query(`SELECT 1 FROM withdrawals_gbp WHERE user_id = $1`, [creator.id]);
      expect(withdrawals.rowCount ?? 0).toBe(0);

      const audit = await authJson("/api/admin/rising-stars/audit?limit=50", admin.token);
      expect(audit.status).toBe(200);
      const auditRows = (audit.body.audit as Array<{ action: string; entity_id: string | null }>) ?? [];
      expect(auditRows.some((row) => row.action === "create_season" && row.entity_id === seasonId)).toBe(true);
      expect(auditRows.some((row) => row.action === "snapshot_phase" && row.entity_id === challengeId)).toBe(true);
      expect(auditRows.every((row) => !("details" in row))).toBe(true);
      const freezeAudits = await getPool().query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM rs_admin_audit WHERE action = 'freeze_leaderboard' AND entity_id = $1`,
        [challengeId],
      );
      expect(Number(freezeAudits.rows[0]?.n)).toBe(2);

      const currentAfter = await authJson("/api/rising-stars/seasons/current", null);
      expect(currentAfter.status).toBe(200);
      const currentAfterId =
        currentAfter.body.season && typeof currentAfter.body.season === "object"
          ? String((currentAfter.body.season as { id?: string }).id ?? "")
          : "";
      expect(currentAfterId).toBe(currentSeasonId);
      expect(currentAfterId).not.toBe(seasonId);

      const attackerSnapshot = await authJson(`/api/admin/rising-stars/challenges/${challengeId}/snapshot`, attacker.token, {
        method: "POST",
        body: JSON.stringify({ phase: "final", advanceTopN: 0 }),
      });
      expect(attackerSnapshot.status).toBe(403);
      assertNoAdminRs(attackerSnapshot.body);

      const withdrawalsStill = await authJson("/api/admin/withdrawals?status=pending", admin.token);
      expect(withdrawalsStill.status).toBe(200);
      const monetisationStill = await authJson("/api/admin/monetisation", admin.token);
      expect(monetisationStill.status).toBe(200);
      expect(monetisationStill.body).toHaveProperty("config");
      const purchasesStill = await authJson("/api/admin/iap-purchases", admin.token);
      expect(purchasesStill.status).toBe(200);

      await getPool().query(`UPDATE users SET is_admin = false WHERE id = $1`, [admin.id]);
      const revoked = await authJson("/api/admin/rising-stars/seasons", admin.token);
      expect(revoked.status).toBe(403);
      assertNoAdminRs(revoked.body);
      const revokedFreeze = await authJson(`/api/admin/rising-stars/challenges/${challengeId}/freeze`, admin.token, {
        method: "POST",
        body: JSON.stringify({ frozen: true }),
      });
      expect(revokedFreeze.status).toBe(403);
    } finally {
      if (seasonId) {
        await getPool().query(`DELETE FROM rs_seasons WHERE id = $1`, [seasonId]);
      }
    }
  }, 60_000);

  it("PAGE-078 admin Progression is gated by users.is_admin and mutates canonical progression only", async ({ skip }) => {
    if (!db || !base) {
      skip();
      return;
    }

    async function registerIsolated(prefix: string) {
      const username = `${prefix}${Math.random().toString(36).slice(2, 10)}`.slice(0, 12);
      const res = await fetch(`${base}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: `${username}@example.com`,
          username,
          password: "password12",
          ageConfirmed13Plus: true,
          consentVersion: "2026-07-21",
        }),
      });
      const body = (await res.json()) as { token?: string; user?: { id?: string } };
      expect(res.status).toBe(201);
      return { id: String(body.user?.id ?? ""), token: accessTokenFromLogin(body) };
    }

    async function authJson(pathName: string, userToken: string | null, init: RequestInit = {}) {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(init.headers as Record<string, string> | undefined),
      };
      if (userToken) headers.Authorization = `Bearer ${userToken}`;
      const res = await fetch(`${base}${pathName}`, { ...init, headers });
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      return { status: res.status, body, cache: res.headers.get("cache-control") };
    }

    function assertNoProgression(body: Record<string, unknown>) {
      expect(body.config).toBeUndefined();
      expect(body.levels).toBeUndefined();
      expect(body.missions).toBeUndefined();
      expect(body.rewards).toBeUndefined();
      expect(body.caps).toBeUndefined();
      expect(body.flags).toBeUndefined();
      expect(body.progression).toBeUndefined();
      expect(body.entries).toBeUndefined();
    }

    const previousHub = process.env.ENGAGEMENT_HUB_ENABLED;
    const admin = await registerIsolated("p78a");
    const attacker = await registerIsolated("p78u");
    const target = await registerIsolated("p78t");
    await getPool().query(`UPDATE users SET is_admin = true WHERE id = $1`, [admin.id]);

    const loggedOut = await authJson("/api/admin/progression/config", null);
    expect(loggedOut.status).toBe(401);
    assertNoProgression(loggedOut.body);
    const loggedOutXp = await authJson("/api/admin/progression/xp-adjustments", null, {
      method: "POST",
      body: JSON.stringify({
        user_id: target.id,
        amount_delta: 5,
        reason: "logged out",
        idempotency_key: "logged-out-key",
      }),
    });
    expect(loggedOutXp.status).toBe(401);

    const attackerConfig = await authJson("/api/admin/progression/config", attacker.token);
    expect(attackerConfig.status).toBe(403);
    assertNoProgression(attackerConfig.body);
    const attackerXp = await authJson("/api/admin/progression/xp-adjustments", attacker.token, {
      method: "POST",
      body: JSON.stringify({
        user_id: target.id,
        amount_delta: 50,
        reason: "non-admin attack",
        idempotency_key: "attacker-xp-key",
      }),
    });
    expect(attackerXp.status).toBe(403);
    const attackerStarter = await authJson("/api/admin/progression/starter-adjustments", attacker.token, {
      method: "POST",
      body: JSON.stringify({
        user_id: target.id,
        amount_delta: 10,
        reason: "non-admin attack",
        idempotency_key: "attacker-st-key",
      }),
    });
    expect(attackerStarter.status).toBe(403);

    const dump = await authJson("/api/admin/progression", admin.token);
    expect(dump.status).toBe(404);

    const config = await authJson("/api/admin/progression/config", admin.token);
    expect(config.status).toBe(200);
    expect(config.cache).toMatch(/no-store/);
    expect(Array.isArray(config.body.config)).toBe(true);
    const levels = await authJson("/api/admin/progression/levels", admin.token);
    expect(levels.status).toBe(200);
    expect(Array.isArray(levels.body.levels)).toBe(true);
    expect((levels.body.levels as Array<{ level: number }>).length).toBe(300);

    const missions = await authJson("/api/admin/progression/missions", admin.token);
    expect(missions.status).toBe(200);
    const daily = await authJson("/api/admin/progression/daily-rewards", admin.token);
    expect(daily.status).toBe(200);
    const caps = await authJson("/api/admin/progression/battle-energy-caps", admin.token);
    expect(caps.status).toBe(200);
    const flags = await authJson("/api/admin/progression/feature-flags", admin.token);
    expect(flags.status).toBe(200);

    const unknownField = await authJson("/api/admin/progression/config", admin.token, {
      method: "PATCH",
      body: JSON.stringify({ source: "daily_activity", xp_amount: 10, enabled: true, extra: true }),
    });
    expect(unknownField.status).toBe(400);

    const invalidLevel = await authJson("/api/admin/progression/levels", admin.token, {
      method: "PUT",
      body: JSON.stringify({ level: 2, total_xp_required: -1, title: "bad" }),
    });
    expect(invalidLevel.status).toBe(400);

    const originalLevel = await getPool().query<{ title: string | null; badge_code: string | null }>(
      `SELECT title, badge_code FROM xp_level_requirements WHERE level = 299`,
    );
    const patchedLevel = await authJson("/api/admin/progression/levels", admin.token, {
      method: "PUT",
      body: JSON.stringify({
        level: 299,
        total_xp_required: Number(
          (
            await getPool().query<{ n: string }>(
              `SELECT total_xp_required::text AS n FROM xp_level_requirements WHERE level = 299`,
            )
          ).rows[0]?.n,
        ),
        title: "qa-page078-temp",
        badge_code: originalLevel.rows[0]?.badge_code ?? null,
      }),
    });
    expect(patchedLevel.status).toBe(200);
    const restoredLevel = await authJson("/api/admin/progression/levels", admin.token, {
      method: "PUT",
      body: JSON.stringify({
        level: 299,
        total_xp_required: Number(
          (
            await getPool().query<{ n: string }>(
              `SELECT total_xp_required::text AS n FROM xp_level_requirements WHERE level = 299`,
            )
          ).rows[0]?.n,
        ),
        title: originalLevel.rows[0]?.title ?? null,
        badge_code: originalLevel.rows[0]?.badge_code ?? null,
      }),
    });
    expect(restoredLevel.status).toBe(200);

    const originalDaily = await getPool().query<{ reward_label: string }>(
      `SELECT reward_label FROM daily_reward_config WHERE streak_day = 3`,
    );
    const dailySaved = await authJson("/api/admin/progression/daily-rewards", admin.token, {
      method: "PUT",
      body: JSON.stringify({
        streak_day: 3,
        reward_xp: 0,
        reward_promo_coins: 0,
        reward_label: "qa-page078-temp",
      }),
    });
    expect(dailySaved.status).toBe(200);
    const dailyRestored = await authJson("/api/admin/progression/daily-rewards", admin.token, {
      method: "PUT",
      body: JSON.stringify({
        streak_day: 3,
        reward_xp: 0,
        reward_promo_coins: 0,
        reward_label: originalDaily.rows[0]?.reward_label || "Gift coupon",
      }),
    });
    expect(dailyRestored.status).toBe(200);

    const flagConfirm = await authJson("/api/admin/progression/feature-flags", admin.token, {
      method: "PATCH",
      body: JSON.stringify({ promotionalCoinsEnabled: false }),
    });
    expect(flagConfirm.status).toBe(400);
    const flagSafe = await authJson("/api/admin/progression/feature-flags", admin.token, {
      method: "PATCH",
      body: JSON.stringify({ liveQuestsEnabled: true, reason: "page078 qa" }),
    });
    expect(flagSafe.status).toBe(200);
    const flagRestore = await authJson("/api/admin/progression/feature-flags", admin.token, {
      method: "PATCH",
      body: JSON.stringify({ liveQuestsEnabled: false, reason: "page078 restore" }),
    });
    expect(flagRestore.status).toBe(200);

    const walletBefore = await getPool().query<{
      paid_coins: string;
      promo_coins: string;
      starter_coins: string;
    }>(`SELECT paid_coins::text, promo_coins::text, starter_coins::text FROM wallet_balances WHERE user_id = $1`, [
      target.id,
    ]);
    const lotsBefore = await getPool().query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM paid_coin_lots WHERE user_id = $1`,
      [target.id],
    );
    const iapBefore = await getPool().query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM processed_purchases WHERE user_id = $1`,
      [target.id],
    );

    const xpKey = "page078-xp-once";
    const xpFirst = await authJson("/api/admin/progression/xp-adjustments", admin.token, {
      method: "POST",
      body: JSON.stringify({
        user_id: target.id,
        amount_delta: 50,
        reason: "page078 qa xp",
        idempotency_key: xpKey,
      }),
    });
    expect(xpFirst.status).toBe(200);
    const xpAgain = await authJson("/api/admin/progression/xp-adjustments", admin.token, {
      method: "POST",
      body: JSON.stringify({
        user_id: target.id,
        amount_delta: 50,
        reason: "page078 qa xp",
        idempotency_key: xpKey,
      }),
    });
    expect(xpAgain.status).toBe(200);
    const xpRow = await getPool().query<{ total_xp: string; fan_level: string }>(
      `SELECT total_xp::text, fan_level::text FROM user_engagement WHERE user_id = $1`,
      [target.id],
    );
    expect(Number(xpRow.rows[0]?.total_xp ?? 0)).toBe(50);
    const xpUndo = await authJson("/api/admin/progression/xp-adjustments", admin.token, {
      method: "POST",
      body: JSON.stringify({
        user_id: target.id,
        amount_delta: -50,
        reason: "page078 qa xp restore",
        idempotency_key: "page078-xp-restore",
      }),
    });
    expect(xpUndo.status).toBe(200);

    const starterKey = "page078-starter-once";
    const starterFirst = await authJson("/api/admin/progression/starter-adjustments", admin.token, {
      method: "POST",
      body: JSON.stringify({
        user_id: target.id,
        amount_delta: 7,
        reason: "page078 qa starter",
        idempotency_key: starterKey,
      }),
    });
    expect(starterFirst.status).toBe(200);
    const starterAgain = await authJson("/api/admin/progression/starter-adjustments", admin.token, {
      method: "POST",
      body: JSON.stringify({
        user_id: target.id,
        amount_delta: 7,
        reason: "page078 qa starter",
        idempotency_key: starterKey,
      }),
    });
    expect(starterAgain.status).toBe(200);
    const walletMid = await getPool().query<{
      paid_coins: string;
      promo_coins: string;
      starter_coins: string;
    }>(`SELECT paid_coins::text, promo_coins::text, starter_coins::text FROM wallet_balances WHERE user_id = $1`, [
      target.id,
    ]);
    expect(Number(walletMid.rows[0]?.starter_coins ?? 0)).toBe(Number(walletBefore.rows[0]?.starter_coins ?? 0) + 7);
    expect(walletMid.rows[0]?.paid_coins).toBe(walletBefore.rows[0]?.paid_coins);
    expect(walletMid.rows[0]?.promo_coins).toBe(walletBefore.rows[0]?.promo_coins);
    const starterUndo = await authJson("/api/admin/progression/starter-adjustments", admin.token, {
      method: "POST",
      body: JSON.stringify({
        user_id: target.id,
        amount_delta: -7,
        reason: "page078 qa starter restore",
        idempotency_key: "page078-starter-restore",
      }),
    });
    expect(starterUndo.status).toBe(200);

    const walletAfter = await getPool().query<{
      paid_coins: string;
      promo_coins: string;
      starter_coins: string;
    }>(`SELECT paid_coins::text, promo_coins::text, starter_coins::text FROM wallet_balances WHERE user_id = $1`, [
      target.id,
    ]);
    expect(walletAfter.rows[0]?.paid_coins).toBe(walletBefore.rows[0]?.paid_coins);
    expect(walletAfter.rows[0]?.promo_coins).toBe(walletBefore.rows[0]?.promo_coins);
    expect(walletAfter.rows[0]?.starter_coins).toBe(walletBefore.rows[0]?.starter_coins);
    const lotsAfter = await getPool().query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM paid_coin_lots WHERE user_id = $1`,
      [target.id],
    );
    expect(lotsAfter.rows[0]?.n).toBe(lotsBefore.rows[0]?.n);
    const iapAfter = await getPool().query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM processed_purchases WHERE user_id = $1`,
      [target.id],
    );
    expect(iapAfter.rows[0]?.n).toBe(iapBefore.rows[0]?.n);

    process.env.ENGAGEMENT_HUB_ENABLED = "true";
    const hub = await authJson("/api/engagement/hub", target.token);
    expect(hub.status).toBe(200);
    const userMissions = await authJson("/api/engagement/missions", target.token);
    expect(userMissions.status).toBe(200);
    const fan = await authJson("/api/engagement/fan-level", target.token);
    expect(fan.status).toBe(200);
    const dailyUser = await authJson("/api/engagement/daily-login", target.token);
    expect(dailyUser.status).toBe(200);
    const rising = await authJson("/api/admin/rising-stars/seasons", admin.token);
    expect(rising.status).toBe(200);
    const withdrawals = await authJson("/api/admin/withdrawals?status=pending", admin.token);
    expect(withdrawals.status).toBe(200);

    await getPool().query(`UPDATE users SET is_admin = false WHERE id = $1`, [admin.id]);
    const revoked = await authJson("/api/admin/progression/config", admin.token);
    expect(revoked.status).toBe(403);
    assertNoProgression(revoked.body);
    const revokedXp = await authJson("/api/admin/progression/xp-adjustments", admin.token, {
      method: "POST",
      body: JSON.stringify({
        user_id: target.id,
        amount_delta: 9,
        reason: "revoked",
        idempotency_key: "revoked-xp",
      }),
    });
    expect(revokedXp.status).toBe(403);

    if (previousHub == null) delete process.env.ENGAGEMENT_HUB_ENABLED;
    else process.env.ENGAGEMENT_HUB_ENABLED = previousHub;
  }, 60_000);
});

