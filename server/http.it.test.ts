import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import type http from "node:http";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { applyPendingMigrations, closePool, getPool } from "./infra/postgres.js";
import { resetEnvCache } from "./infra/env.js";
import { closeValkey } from "./infra/valkey.js";
import { sha256 } from "./infra/tokens.js";
import { totpNow } from "./infra/totp.js";
import { emailVerifyCallbackUrl, issueEmailVerifyToken } from "./modules/auth/emailVerify.js";
import { issuePasswordResetToken, passwordResetCallbackUrl } from "./modules/auth/passwordReset.js";

const TEST_JWT = "integration-test-jwt-secret-key-32chars";

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
  } catch {
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
    if (!db) return;
    process.env.NODE_ENV = "test";
    process.env.DATABASE_URL = db.url;
    process.env.JWT_SECRET = TEST_JWT;
    process.env.TEST_COINS_ISSUE_PASSWORD = "qa-test-coins";
    delete process.env.VALKEY_URL;
    delete process.env.REDIS_URL;
    resetEnvCache();
    await applyPendingMigrations(db.url);
    const { createApp } = await import("./index.js");
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

  async function json(pathName: string, init: RequestInit = {}) {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(init.headers as Record<string, string> | undefined),
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${base}${pathName}`, { ...init, headers });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { status: res.status, body };
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
    token = String(registered.body.token ?? "");
    expect(token).toBeTruthy();
    expect(registered.body.needsEmailConfirmation).toBe(false);
    expect(String(registered.body.welcomeMessage ?? "")).toContain("50,000");
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

    const consent = await json("/api/auth/consent", {
      method: "POST",
      body: JSON.stringify({
        consent_type: "terms_privacy_and_age_13_plus",
        version: "2026-07-21",
        age_confirmed_13_plus: true,
      }),
    });
    expect(consent.status).toBe(200);

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
    expect(missingTerms.status).toBe(400);

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
    token = String(login.body.token ?? "");

    const loginByEmail = await json("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: `${unique}@example.com`, password: "password12" }),
    });
    expect(loginByEmail.status).toBe(200);
    expect(String(loginByEmail.body.token ?? "")).toBeTruthy();

    const wrong = await json("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: `${unique}@example.com`, password: "nope-nope-12" }),
    });
    expect(wrong.status).toBe(401);
    expect(wrong.body.message).toBe("Invalid login credentials.");

    const me = await json("/api/auth/me");
    expect(me.status).toBe(200);

    const wallet = await json("/api/wallet");
    expect(wallet.status).toBe(200);
    expect(wallet.body.paidCoins).toBe(0);
    expect(wallet.body.starterCoins).toBe(50000);

    const mint = await json("/api/wallet/test-coins", {
      method: "POST",
      body: JSON.stringify({ password: "qa-test-coins", amount: 25 }),
    });
    expect(mint.status).toBe(200);
    expect(mint.body.testCoins).toBe(25);

    const iap = await json("/api/iap/verify", {
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
    expect(verifyGarbage.status).toBe(400);
    expect(verifyGarbage.body.message).toBe("Invalid or expired confirmation link.");

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
    expect(unconfirmedForgot.body).toEqual({ ok: true });
    const unconfirmedReset = await getPool().query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM password_reset_tokens WHERE user_id = $1 AND used_at IS NULL`,
      [userId],
    );
    expect(unconfirmedReset.rows[0]?.n).toBeGreaterThan(0);
    delete process.env.SMTP_URL;

    const raw = await issueEmailVerifyToken(userId);
    expect(emailVerifyCallbackUrl("https://app.example", raw)).toContain("/auth/callback?token=");
    const storedHash = await getPool().query<{ token_hash: string }>(
      `SELECT token_hash FROM email_verify_tokens WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [userId],
    );
    expect(storedHash.rows[0]?.token_hash).toBe(sha256(raw));
    expect(storedHash.rows[0]?.token_hash).not.toBe(raw);

    const verified = await json("/api/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ token: raw }),
    });
    expect(verified.status).toBe(200);
    expect(verified.body.ok).toBe(true);
    expect(verified.body.alreadyConfirmed).toBe(false);

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
    expect(reused.body.alreadyConfirmed).toBe(true);

    const raceRaw = await issueEmailVerifyToken(userId);
    const [firstRace, secondRace] = await Promise.all([
      json("/api/auth/verify-email", { method: "POST", body: JSON.stringify({ token: raceRaw }) }),
      json("/api/auth/verify-email", { method: "POST", body: JSON.stringify({ token: raceRaw }) }),
    ]);
    expect(firstRace.status).toBe(200);
    expect(secondRace.status).toBe(200);

    const expiredRaw = await issueEmailVerifyToken(userId);
    await getPool().query(`UPDATE email_verify_tokens SET expires_at = NOW() - INTERVAL '1 second' WHERE token_hash = $1`, [
      sha256(expiredRaw),
    ]);
    const expired = await json("/api/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ token: expiredRaw }),
    });
    expect(expired.status).toBe(400);
    expect(expired.body.message).toBe("This confirmation link has expired.");

    const afterVerifyLogin = await json("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: `${unique}@example.com`, password: "password12" }),
    });
    expect(afterVerifyLogin.status).toBe(200);
    token = String(afterVerifyLogin.body.token ?? "");

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
    expect(forgotWithoutMail.body.message).toBe("Email service is not configured. Please contact support.");

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
    expect(unknownForgot.body).toEqual({ ok: true });
    expect(knownForgot.body).toEqual({ ok: true });
    expect(knownForgot.body).not.toHaveProperty("token");

    const resetStored = await getPool().query<{ token_hash: string; expires_at: Date; used_at: Date | null }>(
      `SELECT token_hash, expires_at, used_at FROM password_reset_tokens WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId],
    );
    const unusedAfterKnown = resetStored.rows.filter((row) => !row.used_at);
    expect(unusedAfterKnown.length).toBe(1);
    expect(unusedAfterKnown[0]?.token_hash).toMatch(/^[a-f0-9]{64}$/);
    const resetTtlMs = unusedAfterKnown[0]!.expires_at.getTime() - Date.now();
    expect(resetTtlMs).toBeGreaterThan(50 * 60 * 1000);
    expect(resetTtlMs).toBeLessThanOrEqual(60 * 60 * 1000 + 5_000);

    const unknownTokens = await getPool().query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM password_reset_tokens t
       JOIN users u ON u.id = t.user_id
       WHERE u.email_normalized = $1`,
      ["nobody-unknown@example.com"],
    );
    expect(unknownTokens.rows[0]?.n).toBe(0);

    const knownForgotAgain = await json("/api/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email: `${unique}@example.com` }),
    });
    expect(knownForgotAgain.status).toBe(200);
    const resetAfterSecond = await getPool().query<{ used_at: Date | null }>(
      `SELECT used_at FROM password_reset_tokens WHERE user_id = $1 ORDER BY created_at ASC`,
      [userId],
    );
    expect(resetAfterSecond.rows.filter((row) => row.used_at).length).toBeGreaterThanOrEqual(1);
    expect(resetAfterSecond.rows.filter((row) => !row.used_at).length).toBe(1);

    const sessionsAfterForgot = await getPool().query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM auth_sessions WHERE user_id = $1`,
      [userId],
    );
    expect(sessionsAfterForgot.rows[0]?.n).toBe(sessionsBeforeForgot.rows[0]?.n);

    const meAfterForgot = await json("/api/auth/me");
    expect(meAfterForgot.status).toBe(200);

    const resetRaw = await issuePasswordResetToken(userId);
    expect(passwordResetCallbackUrl("https://app.example", resetRaw)).toBe(
      `https://app.example/reset-password?token=${encodeURIComponent(resetRaw)}`,
    );
    expect(resetRaw.length).toBeGreaterThanOrEqual(64);
    const resetHash = await getPool().query<{ token_hash: string }>(
      `SELECT token_hash FROM password_reset_tokens WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [userId],
    );
    expect(resetHash.rows[0]?.token_hash).toBe(sha256(resetRaw));
    expect(resetHash.rows[0]?.token_hash).not.toBe(resetRaw);

    const resetAsVerify = await json("/api/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ token: resetRaw }),
    });
    expect(resetAsVerify.status).toBe(400);
    expect(resetAsVerify.body.message).toBe("Invalid or expired confirmation link.");

    const hashBeforeExpiredReset = await getPool().query<{ password_hash: string }>(
      `SELECT password_hash FROM users WHERE id = $1`,
      [userId],
    );
    await getPool().query(
      `UPDATE password_reset_tokens SET expires_at = NOW() - INTERVAL '1 second' WHERE token_hash = $1`,
      [sha256(resetRaw)],
    );
    const expiredReset = await json("/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token: resetRaw, password: "password99xx" }),
    });
    expect(expiredReset.status).toBe(400);
    expect(expiredReset.body.message).toBe("This reset link has expired.");
    const hashAfterExpiredReset = await getPool().query<{ password_hash: string }>(
      `SELECT password_hash FROM users WHERE id = $1`,
      [userId],
    );
    expect(hashAfterExpiredReset.rows[0]?.password_hash).toBe(hashBeforeExpiredReset.rows[0]?.password_hash);

    const verifyAsReset = await issueEmailVerifyToken(userId);
    const verifyCannotReset = await json("/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token: verifyAsReset, password: "password99xx" }),
    });
    expect(verifyCannotReset.status).toBe(400);
    expect(verifyCannotReset.body.message).toBe("Invalid or expired reset link.");

    const sessionCannotReset = await json("/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, password: "password99xx" }),
    });
    expect(sessionCannotReset.status).toBe(400);

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
    expect(suspendedForgot.body).toEqual({ ok: true });
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
    const resetSession = String(resetLogin.body.token ?? "");
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
    expect(resetUnknown.status).toBe(400);
    expect(resetUnknown.body.message).toBe("Invalid or expired reset link.");

    const weakTok = await issuePasswordResetToken(resetUserId);
    const weakReset = await json("/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token: weakTok, password: "short" }),
    });
    expect(weakReset.status).toBe(400);
    expect(weakReset.body.message).toBe("Password must be at least 8 characters.");
    const stillOld = await json("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: resetEmail, password: "password12" }),
    });
    expect(stillOld.status).toBe(200);

    const superseded = await issuePasswordResetToken(resetUserId);
    const liveReset = await issuePasswordResetToken(resetUserId);
    const supersededReset = await json("/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token: superseded, password: "ResetPass12" }),
    });
    expect(supersededReset.status).toBe(400);
    expect(supersededReset.body.message).toBe("This reset link has already been used or is no longer valid.");

    const appleCannotReset = await json("/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({
        token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.signaturepaddingxx",
        password: "ResetPass12",
      }),
    });
    expect(appleCannotReset.status).toBe(400);

    const applied = await json("/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token: liveReset, password: "ResetPass12" }),
    });
    expect(applied.status).toBe(200);
    expect(applied.body).toEqual({ ok: true });
    expect(applied.body).not.toHaveProperty("token");
    expect(applied.body).not.toHaveProperty("password_hash");

    const storedResetHash = await getPool().query<{ password_hash: string }>(
      `SELECT password_hash FROM users WHERE id = $1`,
      [resetUserId],
    );
    expect(storedResetHash.rows[0]?.password_hash).toBeTruthy();
    expect(storedResetHash.rows[0]?.password_hash).not.toBe("ResetPass12");
    expect(storedResetHash.rows[0]?.password_hash).not.toBe("password12");

    const consumed = await getPool().query<{ unused: number; used: number }>(
      `SELECT
         COUNT(*) FILTER (WHERE used_at IS NULL)::int AS unused,
         COUNT(*) FILTER (WHERE used_at IS NOT NULL)::int AS used
       FROM password_reset_tokens WHERE user_id = $1`,
      [resetUserId],
    );
    expect(consumed.rows[0]?.unused).toBe(0);
    expect(consumed.rows[0]?.used).toBeGreaterThanOrEqual(2);

    const reusedReset = await json("/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token: liveReset, password: "ResetPass99" }),
    });
    expect(reusedReset.status).toBe(400);
    expect(reusedReset.body.message).toBe("This reset link has already been used or is no longer valid.");

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
    expect(String(newPasswordLogin.body.token ?? "")).toBeTruthy();

    const keptFirstSession = token;
    token = resetSession;
    const revokedSession = await json("/api/auth/me");
    expect(revokedSession.status).toBe(401);
    token = keptFirstSession;
    const firstUserStill = await json("/api/auth/me");
    expect(firstUserStill.status).toBe(200);

    const raceTok = await issuePasswordResetToken(resetUserId);
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
    expect(raceStatuses).toEqual([200, 400]);
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
    const suspendedTok = await issuePasswordResetToken(resetUserId);
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

    const deletedTok = await issuePasswordResetToken(resetUserId);
    await getPool().query(`UPDATE users SET deleted_at = NOW() WHERE id = $1`, [resetUserId]);
    const deletedReset = await json("/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token: deletedTok, password: "Deleted12x" }),
    });
    expect(deletedReset.status).toBe(400);
    expect(deletedReset.body.message).toBe("Invalid or expired reset link.");

    const bannedRaw = await issueEmailVerifyToken(userId);
    await getPool().query(`UPDATE users SET banned_until = $2 WHERE id = $1`, [userId, new Date("9999-12-31T00:00:00.000Z")]);
    const banned = await json("/api/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ token: bannedRaw }),
    });
    expect(banned.status).toBe(403);
    await getPool().query(`UPDATE users SET banned_until = NULL WHERE id = $1`, [userId]);

    const deletedRaw = await issueEmailVerifyToken(userId);
    await getPool().query(`UPDATE users SET deleted_at = NOW() WHERE id = $1`, [userId]);
    const unusedBeforeDeletedForgot = await getPool().query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM password_reset_tokens WHERE user_id = $1 AND used_at IS NULL`,
      [userId],
    );
    process.env.SMTP_URL = "smtp://127.0.0.1:9";
    const deletedForgot = await json("/api/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email: `${unique}@example.com` }),
    });
    expect(deletedForgot.status).toBe(200);
    expect(deletedForgot.body).toEqual({ ok: true });
    const unusedAfterDeletedForgot = await getPool().query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM password_reset_tokens WHERE user_id = $1 AND used_at IS NULL`,
      [userId],
    );
    expect(unusedAfterDeletedForgot.rows[0]?.n).toBe(unusedBeforeDeletedForgot.rows[0]?.n);
    delete process.env.SMTP_URL;
    const deleted = await json("/api/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ token: deletedRaw }),
    });
    expect(deleted.status).toBe(400);
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
      const userToken = String(registered.body.token ?? "");
      return { id, token: userToken };
    }

    const viewer = await registerUser("v");
    const creator = await registerUser("c");
    const blocked = await registerUser("b");
    token = "";
    const unauth = await json("/api/feed/foryou");
    expect(unauth.status).toBe(401);
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
    const items = (foryou.body.items as Array<{ id: string; userId: string }>) || [];
    expect(items.some((row) => row.id === videoId)).toBe(true);
    expect(items.some((row) => row.id === blockedVideo.rows[0].id)).toBe(false);
    expect(items.every((row) => row.userId !== blocked.id)).toBe(true);

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
    const like = await json(`/api/videos/${videoId}/like`, { method: "POST" });
    expect(like.status).toBe(200);
    const unlike = await json(`/api/videos/${videoId}/like`, { method: "DELETE" });
    expect(unlike.status).toBe(200);
    const save = await json(`/api/videos/${videoId}/save`, { method: "POST" });
    expect(save.status).toBe(200);

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
    const page1 = await json("/api/feed/foryou");
    const page1Items = (page1.body.items as Array<{ id: string }>) || [];
    expect(page1Items.length).toBe(20);
    expect(page1.body.nextCursor).toBe("off:20");
    const page2 = await json(`/api/feed/foryou?cursor=${encodeURIComponent(String(page1.body.nextCursor))}`);
    const page2Items = (page2.body.items as Array<{ id: string }>) || [];
    const seen = new Set(page1Items.map((row) => row.id));
    for (const row of page2Items) {
      expect(seen.has(row.id)).toBe(false);
      seen.add(row.id);
    }
  }, 60_000);

  it("requires a valid TOTP code after 2FA is enabled", async ({ skip }) => {
    if (!db || !base) {
      skip();
      return;
    }
    const unique = `totp${Date.now()}`;
    const registered = await json("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({
        email: `${unique}@example.com`,
        username: unique.slice(0, 20),
        password: "password12",
        ageConfirmed13Plus: true,
        consentVersion: "2026-07-21",
      }),
    });
    expect(registered.status).toBe(201);
    token = String(registered.body.token ?? "");

    const enrolled = await json("/api/auth/2fa/enroll", { method: "POST" });
    expect(enrolled.status).toBe(200);
    const secret = String(enrolled.body.secret ?? "");
    expect(secret).toBeTruthy();
    const verified = await json("/api/auth/2fa/verify", {
      method: "POST",
      body: JSON.stringify({ code: totpNow(secret) }),
    });
    expect(verified.status).toBe(200);

    token = "";
    const missingCode = await json("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: `${unique}@example.com`, password: "password12" }),
    });
    expect(missingCode.status).toBe(401);
    expect(missingCode.body.error).toBe("requires_2fa");

    const wrongCode = await json("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: `${unique}@example.com`, password: "password12", totpCode: "000000" }),
    });
    expect(wrongCode.status).toBe(401);
    expect(wrongCode.body.error).toBe("invalid_credentials");

    const validCode = await json("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: `${unique}@example.com`, password: "password12", totpCode: totpNow(secret) }),
    });
    expect(validCode.status).toBe(200);
  });
});
