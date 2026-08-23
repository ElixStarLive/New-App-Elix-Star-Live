import type { Request, Response } from "express";
import { Router } from "express";
import { createHash, randomUUID } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import {
  appleNativeBodySchema,
  canonicalizeUsername,
  forgotPasswordBodySchema,
  loginBodySchema,
  loginIdentifier,
  REGISTER_CONSENT_TYPE,
  REGISTER_CONSENT_VERSION,
  REGISTER_WELCOME_STARTER,
  registerBodySchema,
  resetPasswordBodySchema,
  sessionUserSchema,
  twoFactorCodeBodySchema,
  usernameSchema,
  verifyEmailBodySchema,
} from "../../../shared/contracts/auth.js";
import { REGISTER_STARTER_COINS } from "../../../shared/contracts/money.js";
import { getPool, withTransaction } from "../../infra/postgres.js";
import { LIVE_AUTH_USER_SELECT, isLiveNeonSchema } from "../../infra/liveSchema.js";
import { hashPassword, verifyPassword } from "../../infra/password.js";
import { randomToken, sha256, signAccessToken } from "../../infra/tokens.js";
import { env } from "../../infra/env.js";
import { sendMail } from "../../infra/mail.js";
import { logger } from "../../infra/logger.js";
import { encryptSecret, decryptSecret } from "../../infra/secretBox.js";
import { requireValkey } from "../../infra/valkey.js";
import { AppError } from "../../middleware/errors.js";
import { requireAuth, type AuthedRequest } from "../../middleware/auth.js";
import { consumeEmailVerifyToken, emailVerifyCallbackUrl, issueEmailVerifyToken } from "./emailVerify.js";
import {
  applyPasswordReset,
  assertPasswordResetRequestAllowed,
  issuePasswordResetToken,
  passwordResetCallbackUrl,
  recordPasswordResetRequest,
} from "./passwordReset.js";

type UserRow = {
  id: string;
  email: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  bio: string;
  is_verified: boolean;
  is_admin: boolean;
  email_confirmed_at: Date | null;
  created_at?: Date | string | null;
  banned_until?: Date | null;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeUsername(username: string): string {
  return canonicalizeUsername(username).toLowerCase();
}

async function followerCounts(userId: string): Promise<{ followerCount: number; followingCount: number }> {
  const live = await isLiveNeonSchema();
  const { rows } = await getPool().query<{ followers: string; following: string }>(
    live
      ? `SELECT
           (SELECT COUNT(*)::text FROM follows WHERE following_id = $1) AS followers,
           (SELECT COUNT(*)::text FROM follows WHERE follower_id = $1) AS following`
      : `SELECT
       (SELECT COUNT(*)::text FROM follows WHERE followee_id = $1) AS followers,
       (SELECT COUNT(*)::text FROM follows WHERE follower_id = $1) AS following`,
    [userId],
  );
  return {
    followerCount: Number(rows[0]?.followers ?? 0),
    followingCount: Number(rows[0]?.following ?? 0),
  };
}

async function toSessionUser(row: UserRow) {
  const counts = await followerCounts(row.id);
  return sessionUserSchema.parse({
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    bio: row.bio,
    isVerified: row.is_verified,
    email: row.email,
    isAdmin: row.is_admin,
    emailConfirmed: Boolean(row.email_confirmed_at),
    ...counts,
  });
}

async function issueSession(user: UserRow) {
  if (user.banned_until && new Date(user.banned_until).getTime() > Date.now()) {
    throw new AppError("forbidden", "Account suspended.", 403);
  }
  if (await isLiveNeonSchema()) {
    const jwt = await signAccessToken(user.id, "", user.email);
    await getPool().query(
      `INSERT INTO elix_auth_sessions (token_hash, user_id, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '7 days')
       ON CONFLICT (token_hash) DO UPDATE
         SET user_id = EXCLUDED.user_id, expires_at = EXCLUDED.expires_at`,
      [sha256(jwt), user.id],
    );
    return { token: jwt, user: await toSessionUser(user) };
  }
  const raw = randomToken();
  const tokenHash = sha256(raw);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const { rows } = await getPool().query<{ id: string }>(
    `INSERT INTO auth_sessions (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3) RETURNING id`,
    [user.id, tokenHash, expiresAt],
  );
  const sessionId = rows[0].id;
  const jwt = await signAccessToken(user.id, sessionId, user.email);
  return { token: jwt, user: await toSessionUser(user) };
}

function isoOrEmpty(value: Date | string | null | undefined): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function setAuthSessionCookie(res: Response, token: string): void {
  res.cookie("auth_token", token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    secure: env().isProduction,
  });
}

function clearAuthSessionCookie(res: Response): void {
  res.clearCookie("auth_token", {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: env().isProduction,
  });
}

async function loadLoginProfileMeta(user: UserRow) {
  const live = await isLiveNeonSchema();
  if (live) {
    const { rows } = await getPool().query<{ starter: string | null; level: string | null }>(
      `SELECT
         (SELECT balance::text FROM starter_coin_balances WHERE user_id = $1) AS starter,
         (SELECT level::text FROM profiles WHERE user_id = $1) AS level`,
      [user.id],
    );
    return {
      is_admin: user.is_admin,
      is_creator: user.is_verified,
      banned_until: user.banned_until ? new Date(user.banned_until).toISOString() : null,
      starter_coin_balance: Number(rows[0]?.starter ?? 0),
      total_xp: 0,
      level: Number(rows[0]?.level ?? 0),
    };
  }
  const { rows } = await getPool().query<{ starter_coins: string | null }>(
    `SELECT starter_coins::text AS starter_coins FROM wallet_balances WHERE user_id = $1`,
    [user.id],
  );
  return {
    is_admin: user.is_admin,
    is_creator: user.is_verified,
    banned_until: user.banned_until ? new Date(user.banned_until).toISOString() : null,
    starter_coin_balance: Number(rows[0]?.starter_coins ?? 0),
    total_xp: 0,
    level: 0,
  };
}

async function writeProductionLogin(res: Response, user: UserRow): Promise<void> {
  const session = await issueSession(user);
  setAuthSessionCookie(res, session.token);
  res.json({
    user: {
      id: user.id,
      email: user.email,
      user_metadata: {
        username: user.username,
        full_name: user.display_name,
        avatar_url: user.avatar_url || "",
      },
      email_confirmed_at: isoOrEmpty(user.email_confirmed_at),
      created_at: isoOrEmpty(user.created_at),
    },
    session: { access_token: session.token, accessToken: session.token },
    profile_meta: await loadLoginProfileMeta(user),
  });
}

async function findUserByLogin(emailOrUsername: string): Promise<(UserRow & { password_hash: string | null }) | null> {
  const value = emailOrUsername.trim();
  const { rows } = (await isLiveNeonSchema())
    ? await getPool().query<UserRow & { password_hash: string | null }>(
        `${LIVE_AUTH_USER_SELECT}
         WHERE u.email_lower = $1 OR LOWER(u.username) = $2
         LIMIT 1`,
        [normalizeEmail(value), normalizeUsername(value)],
      )
    : await getPool().query<UserRow & { password_hash: string | null }>(
        `SELECT id, email, username, display_name, avatar_url, bio, is_verified, is_admin, email_confirmed_at, created_at, password_hash, banned_until
     FROM users
     WHERE deleted_at IS NULL AND (email_normalized = $1 OR username_normalized = $2)
     LIMIT 1`,
        [normalizeEmail(value), normalizeUsername(value)],
      );
  return rows[0] ?? null;
}

function loginFailKey(identifier: string): string {
  return `auth:login:fail:${sha256(identifier.trim().toLowerCase())}`;
}

const LOGIN_FAIL_MAX = 10;
const LOGIN_FAIL_WINDOW_SEC = 15 * 60;

let loginDecoyHashPromise: Promise<string> | null = null;

function loginDecoyHash(): Promise<string> {
  if (!loginDecoyHashPromise) {
    loginDecoyHashPromise = hashPassword("elix-login-decoy");
  }
  return loginDecoyHashPromise;
}

function mailIsConfigured(): boolean {
  return Boolean(process.env.SMTP_URL?.trim());
}

async function assertLoginAllowed(identifier: string): Promise<void> {
  if (!env().valkeyUrl) return;
  try {
    const count = Number((await requireValkey().get(loginFailKey(identifier))) ?? "0");
    if (count >= LOGIN_FAIL_MAX) {
      throw new AppError("rate_limited", "Too many failed sign-in attempts. Please try again later.", 429);
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("unavailable", "Login temporarily unavailable. Please try again.", 503);
  }
}

async function recordLoginFailure(identifier: string): Promise<void> {
  if (!env().valkeyUrl) return;
  const key = loginFailKey(identifier);
  const count = await requireValkey().incr(key);
  if (count === 1) await requireValkey().expire(key, LOGIN_FAIL_WINDOW_SEC);
}

async function clearLoginFailure(identifier: string): Promise<void> {
  if (!env().valkeyUrl) return;
  await requireValkey().del(loginFailKey(identifier));
}

async function assertTotpIfEnabled(userId: string, totpCode: string | undefined): Promise<void> {
  if (await isLiveNeonSchema()) return;
  const { rows } = await getPool().query<{ secret_encrypted: string; enabled_at: Date | null }>(
    `SELECT secret_encrypted, enabled_at FROM user_two_factor WHERE user_id = $1`,
    [userId],
  );
  if (!rows[0]?.enabled_at) return;
  if (!totpCode) throw new AppError("requires_2fa", "Authenticator code required", 401);
  const { verifyTotp } = await import("../../infra/totp.js");
  if (!verifyTotp(decryptSecret(rows[0].secret_encrypted), totpCode)) {
    throw new AppError("invalid_credentials", "Invalid authenticator code", 401);
  }
}

function uniqueRegisterConflict(error: unknown): AppError | null {
  if (!error || typeof error !== "object" || !("code" in error)) return null;
  if (String((error as { code: unknown }).code) !== "23505") return null;
  const constraint = String((error as { constraint?: string }).constraint ?? "");
  if (constraint.includes("email")) {
    return new AppError("conflict", "An account with this email already exists.", 409);
  }
  if (constraint.includes("username")) {
    return new AppError("conflict", "This username is already taken.", 409);
  }
  return new AppError("conflict", "Email or username already in use", 409);
}

function derivedUsernameFromEmail(email: string): string {
  const local = (email.split("@")[0] ?? "user").replace(/[^a-zA-Z0-9_]+/g, "_").replace(/^_+|_+$/g, "") || "user";
  const clipped = local.slice(0, 24);
  const candidate = clipped.length >= 3 ? clipped : `${clipped}user`.slice(0, 24);
  const parsed = usernameSchema.safeParse(candidate);
  return parsed.success ? parsed.data : "user";
}

async function sendConfirmationEmail(email: string, userId: string): Promise<boolean> {
  if (!mailIsConfigured()) return false;
  try {
    const verifyToken = await issueEmailVerifyToken(userId);
    const origin = env().CLIENT_URL || "http://localhost:5173";
    await sendMail(
      email,
      "Confirm your Elix Star Live email",
      `Confirm your email: ${emailVerifyCallbackUrl(origin, verifyToken)}`,
    );
    return true;
  } catch (error) {
    logger.error({ err: error, userId }, "register confirmation email failed");
    return false;
  }
}

const router = Router();

router.post("/register", async (req: Request, res: Response) => {
  const body = registerBodySchema.parse(req.body);
  const emailNormalized = normalizeEmail(body.email);
  const username = body.username ?? derivedUsernameFromEmail(body.email);
  const usernameNormalized = normalizeUsername(username);
  const displayName = body.displayName?.trim() || username;
  const passwordHash = await hashPassword(body.password);
  const requireConfirm = mailIsConfigured();
  if (await isLiveNeonSchema()) {
    try {
      const user = await withTransaction(async (client) => {
        const id = randomUUID();
        await client.query(
          `INSERT INTO elix_auth_users
             (id, email, email_lower, password_hash, username, display_name, avatar_url, created_at, email_confirmed_at)
           VALUES ($1, $2, $3, $4, $5, $6, NULL, NOW(), $7)`,
          [
            id,
            body.email.trim(),
            emailNormalized,
            passwordHash,
            username,
            displayName,
            requireConfirm ? null : new Date(),
          ],
        );
        await client.query(
          `INSERT INTO profiles (user_id, username, display_name, avatar_url, level, created_at, updated_at)
           VALUES ($1, $2, $3, NULL, 0, NOW(), NOW())
           ON CONFLICT (user_id) DO NOTHING`,
          [id, username, displayName],
        );
        await client.query("SAVEPOINT starter_seed");
        try {
          await client.query(
            `INSERT INTO starter_coin_balances (user_id, balance, lifetime_granted, lifetime_spent)
             VALUES ($1, $2, $2, 0)
             ON CONFLICT (user_id) DO NOTHING`,
            [id, REGISTER_STARTER_COINS],
          );
          await client.query("RELEASE SAVEPOINT starter_seed");
        } catch {
          await client.query("ROLLBACK TO SAVEPOINT starter_seed");
        }
        const loaded = await client.query<UserRow>(
          `${LIVE_AUTH_USER_SELECT} WHERE u.id = $1`,
          [id],
        );
        return loaded.rows[0];
      });
      const sessionUser = await toSessionUser(user);
      if (requireConfirm) {
        const confirmationEmailSent = await sendConfirmationEmail(body.email, user.id);
        res.status(201).json({
          token: null,
          user: sessionUser,
          needsEmailConfirmation: true,
          confirmationEmailSent,
          welcomeMessage: confirmationEmailSent
            ? "Check your email to confirm your account before signing in."
            : "Account created, but the confirmation email could not be sent. Request a new confirmation email to sign in.",
        });
        return;
      }
      const session = await issueSession(user);
      res.status(201).json({
        token: session.token,
        user: session.user,
        needsEmailConfirmation: false,
        confirmationEmailSent: false,
        welcomeMessage: REGISTER_WELCOME_STARTER,
      });
      return;
    } catch (error) {
      const conflict = uniqueRegisterConflict(error);
      if (conflict) throw conflict;
      throw error;
    }
  }
  try {
    const user = await withTransaction(async (client) => {
      const inserted = await client.query<UserRow>(
        `INSERT INTO users (
           email, email_normalized, username, username_normalized, password_hash, display_name, email_confirmed_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, email, username, display_name, avatar_url, bio, is_verified, is_admin, email_confirmed_at, banned_until`,
        [
          body.email.trim(),
          emailNormalized,
          username,
          usernameNormalized,
          passwordHash,
          displayName,
          requireConfirm ? null : new Date(),
        ],
      );
      const row = inserted.rows[0];
      await client.query(`INSERT INTO wallet_balances (user_id, starter_coins) VALUES ($1, $2)`, [
        row.id,
        REGISTER_STARTER_COINS,
      ]);
      await client.query(
        `INSERT INTO wallet_ledger (user_id, bucket, delta, balance_after, reason, idempotency_key)
         VALUES ($1, 'starter', $2, $2, 'register_starter', $3)`,
        [row.id, REGISTER_STARTER_COINS, `starter:onboarding:${row.id}`],
      );
      await client.query(`INSERT INTO creator_wallet_gbp (user_id) VALUES ($1)`, [row.id]);
      await client.query(`INSERT INTO notification_prefs (user_id) VALUES ($1)`, [row.id]);
      await client.query(`INSERT INTO user_consents (user_id, kind) VALUES ($1, $2)`, [
        row.id,
        REGISTER_CONSENT_TYPE,
      ]);
      return row;
    });
    const sessionUser = await toSessionUser(user);
    if (requireConfirm) {
      const confirmationEmailSent = await sendConfirmationEmail(body.email, user.id);
      res.status(201).json({
        token: null,
        user: sessionUser,
        needsEmailConfirmation: true,
        confirmationEmailSent,
        welcomeMessage: confirmationEmailSent
          ? "Check your email to confirm your account before signing in."
          : "Account created, but the confirmation email could not be sent. Request a new confirmation email to sign in.",
      });
      return;
    }
    const session = await issueSession(user);
    res.status(201).json({
      token: session.token,
      user: session.user,
      needsEmailConfirmation: false,
      confirmationEmailSent: false,
      welcomeMessage: REGISTER_WELCOME_STARTER,
    });
  } catch (error) {
    const conflict = uniqueRegisterConflict(error);
    if (conflict) throw conflict;
    throw error;
  }
});

router.post("/login", async (req: Request, res: Response) => {
  const body = loginBodySchema.parse(req.body);
  const identifier = loginIdentifier(body);
  if (!identifier || !body.password) {
    throw new AppError("validation_error", "Please enter both email and password.", 400);
  }
  await assertLoginAllowed(identifier);
  const user = await findUserByLogin(identifier);
  if (!user?.password_hash) {
    await verifyPassword(body.password, await loginDecoyHash());
    await recordLoginFailure(identifier);
    res.status(401).json({ error: "Invalid login credentials." });
    return;
  }
  const ok = await verifyPassword(body.password, user.password_hash);
  if (!ok) {
    await recordLoginFailure(identifier);
    res.status(401).json({ error: "Invalid login credentials." });
    return;
  }
  if (!user.email_confirmed_at && mailIsConfigured()) {
    throw new AppError(
      "forbidden",
      "Please confirm your email before logging in. Check your inbox or request a new confirmation email.",
      403,
    );
  }
  await clearLoginFailure(identifier);
  await writeProductionLogin(res, user);
});

router.post("/guest", async (_req: Request, res: Response) => {
  if (env().isProduction) {
    throw new AppError("forbidden", "Guest login is not available", 403);
  }
  const email = "guest@example.com";
  let user: UserRow | null = await findUserByLogin(email);
  if (!user) {
    const passwordHash = await hashPassword(randomToken());
    user = await withTransaction(async (client) => {
      const inserted = await client.query<UserRow>(
        `INSERT INTO users (email, email_normalized, username, username_normalized, password_hash, display_name)
         VALUES ($1, $2, 'guest', 'guest', $3, 'Guest')
         RETURNING id, email, username, display_name, avatar_url, bio, is_verified, is_admin, email_confirmed_at`,
        [email, email, passwordHash],
      );
      const row = inserted.rows[0];
      await client.query(`INSERT INTO wallet_balances (user_id) VALUES ($1)`, [row.id]);
      await client.query(`INSERT INTO creator_wallet_gbp (user_id) VALUES ($1)`, [row.id]);
      await client.query(`INSERT INTO notification_prefs (user_id) VALUES ($1)`, [row.id]);
      return row;
    });
  }
  res.json(await issueSession(user));
});

router.post("/change-password", requireAuth, async (req: AuthedRequest, res) => {
  const currentPassword = typeof req.body?.currentPassword === "string" ? req.body.currentPassword : "";
  const newPassword = typeof req.body?.newPassword === "string" ? req.body.newPassword : "";
  if (newPassword.length < 8 || newPassword.length > 128) {
    throw new AppError("validation_error", "Password must be 8-128 characters", 400);
  }
  const live = await isLiveNeonSchema();
  const { rows } = live
    ? await getPool().query<{ password_hash: string | null }>(
        `SELECT password_hash FROM elix_auth_users WHERE id = $1`,
        [req.userId],
      )
    : await getPool().query<{ password_hash: string | null }>(
        `SELECT password_hash FROM users WHERE id = $1`,
        [req.userId],
      );
  if (!rows[0]?.password_hash) throw new AppError("invalid_credentials", "Password change is not available", 400);
  const ok = await verifyPassword(currentPassword, rows[0].password_hash);
  if (!ok) throw new AppError("invalid_credentials", "Current password is incorrect", 401);
  const passwordHash = await hashPassword(newPassword);
  await withTransaction(async (client) => {
    if (live) {
      await client.query(`UPDATE elix_auth_users SET password_hash = $1 WHERE id = $2`, [
        passwordHash,
        req.userId,
      ]);
      await client.query(
        `DELETE FROM elix_auth_sessions WHERE user_id = $1 AND token_hash <> $2`,
        [req.userId, req.sessionId],
      );
      return;
    }
    await client.query(`UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`, [
      passwordHash,
      req.userId,
    ]);
    await client.query(
      `UPDATE auth_sessions SET revoked_at = NOW() WHERE user_id = $1 AND id <> $2 AND revoked_at IS NULL`,
      [req.userId, req.sessionId],
    );
  });
  res.json({ ok: true });
});

router.get("/me", requireAuth, async (req: AuthedRequest, res: Response) => {
  const { rows } = (await isLiveNeonSchema())
    ? await getPool().query<UserRow>(`${LIVE_AUTH_USER_SELECT} WHERE u.id = $1`, [req.userId])
    : await getPool().query<UserRow>(
        `SELECT id, email, username, display_name, avatar_url, bio, is_verified, is_admin, email_confirmed_at
     FROM users WHERE id = $1 AND deleted_at IS NULL`,
        [req.userId],
      );
  if (!rows[0]) throw new AppError("unauthenticated", "Session expired", 401);
  res.json({ user: await toSessionUser(rows[0]) });
});

router.post("/logout", requireAuth, async (req: AuthedRequest, res: Response) => {
  if (await isLiveNeonSchema()) {
    await getPool().query(`DELETE FROM elix_auth_sessions WHERE token_hash = $1`, [req.sessionId]);
  } else {
    await getPool().query(`UPDATE auth_sessions SET revoked_at = NOW() WHERE id = $1`, [req.sessionId]);
  }
  clearAuthSessionCookie(res);
  res.json({ ok: true });
});

router.post("/forgot-password", async (req: Request, res: Response) => {
  const body = forgotPasswordBodySchema.parse(req.body);
  const emailNormalized = normalizeEmail(body.email);
  if (!mailIsConfigured()) {
    throw new AppError("unavailable", "Email service is not configured. Please contact support.", 501);
  }
  await assertPasswordResetRequestAllowed(emailNormalized);
  await recordPasswordResetRequest(emailNormalized);
  const { rows } = (await isLiveNeonSchema())
    ? await getPool().query<{ id: string; email: string }>(
        `SELECT id, email FROM elix_auth_users WHERE email_lower = $1`,
        [emailNormalized],
      )
    : await getPool().query<{ id: string; email: string }>(
        `SELECT id, email FROM users WHERE email_normalized = $1 AND deleted_at IS NULL`,
        [emailNormalized],
      );
  const user = rows[0];
  if (user) {
    const raw = await issuePasswordResetToken(user.id);
    const origin = env().CLIENT_URL || "http://localhost:5173";
    try {
      await sendMail(
        user.email,
        "Reset your Elix Star Live password",
        `Click this link to reset your password: ${passwordResetCallbackUrl(origin, raw)}\n\nThis link expires in 1 hour. If you did not request a password reset, ignore this email.`,
      );
    } catch (error) {
      logger.error({ err: error, userId: user.id }, "password reset email send failed");
    }
  }
  res.json({ ok: true });
});

router.post("/reset-password", async (req: Request, res: Response) => {
  const body = resetPasswordBodySchema.parse(req.body);
  const result = await applyPasswordReset(body.token, body.password);
  try {
    const { disconnectUserSessions } = await import("../../websocket/index.js");
    disconnectUserSessions(result.userId, "Password changed");
  } catch (error) {
    logger.warn({ err: error, userId: result.userId }, "password reset socket revoke failed");
  }
  res.json({ ok: true });
});

router.post("/resend-confirmation", async (req: Request, res: Response) => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";
  if (!email) throw new AppError("validation_error", "Email is required.", 400);
  const { rows } = (await isLiveNeonSchema())
    ? await getPool().query<{ id: string; email_confirmed_at: Date | null }>(
        `SELECT id, email_confirmed_at FROM elix_auth_users WHERE email_lower = $1 LIMIT 1`,
        [normalizeEmail(email)],
      )
    : await getPool().query<{ id: string; email_confirmed_at: Date | null }>(
        `SELECT id, email_confirmed_at FROM users WHERE email_normalized = $1 AND deleted_at IS NULL LIMIT 1`,
        [normalizeEmail(email)],
      );
  const user = rows[0];
  if (user && !user.email_confirmed_at) {
    const sent = await sendConfirmationEmail(email, user.id);
    if (!sent) throw new AppError("unavailable", "Could not send confirmation email.", 503);
  }
  res.json({ ok: true });
});

router.post("/verify-email", async (req: Request, res: Response) => {
  const body = verifyEmailBodySchema.parse(req.body);
  const result = await consumeEmailVerifyToken(body.token);
  res.json({ ok: true, alreadyConfirmed: result.alreadyConfirmed });
});

router.post("/consent", requireAuth, async (req: AuthedRequest, res: Response) => {
  if (await isLiveNeonSchema()) {
    res.json({ ok: true });
    return;
  }
  const consentType = req.body?.consent_type;
  const version = req.body?.version;
  const ageConfirmed = req.body?.age_confirmed_13_plus;
  if (consentType !== REGISTER_CONSENT_TYPE || version !== REGISTER_CONSENT_VERSION || ageConfirmed !== true) {
    throw new AppError("validation_error", "Terms, privacy, and age confirmation are required.", 400);
  }
  await getPool().query(
    `INSERT INTO user_consents (user_id, kind) VALUES ($1, $2)
     ON CONFLICT (user_id, kind) DO NOTHING`,
    [req.userId, REGISTER_CONSENT_TYPE],
  );
  res.json({ ok: true });
});

router.post("/delete", requireAuth, async (req: AuthedRequest, res: Response) => {
  await withTransaction(async (client) => {
    if (await isLiveNeonSchema()) {
      await client.query(`DELETE FROM elix_auth_sessions WHERE user_id = $1`, [req.userId]);
      await client.query(`DELETE FROM follows WHERE follower_id = $1 OR following_id = $1`, [req.userId]);
      await client.query(`DELETE FROM elix_blocked_users WHERE blocker_user_id = $1 OR blocked_user_id = $1`, [
        req.userId,
      ]);
      await client.query(`DELETE FROM comments WHERE user_id = $1`, [req.userId]);
      await client.query(`DELETE FROM videos WHERE user_id = $1`, [req.userId]);
      await client.query(`DELETE FROM profiles WHERE user_id = $1`, [req.userId]);
      await client.query(`DELETE FROM elix_auth_users WHERE id = $1`, [req.userId]);
      return;
    }
    await client.query(`UPDATE users SET deleted_at = NOW(), email_normalized = $2, username_normalized = $3 WHERE id = $1`, [
      req.userId,
      `deleted-${req.userId}@invalid.local`,
      `deleted_${req.userId?.slice(0, 8)}`,
    ]);
    await client.query(`UPDATE auth_sessions SET revoked_at = NOW() WHERE user_id = $1`, [req.userId]);
  });
  res.json({ ok: true });
});

async function appleNative(req: Request, res: Response): Promise<void> {
  const body = appleNativeBodySchema.parse(req.body);
  const jwks = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));
  const { payload } = await jwtVerify(body.identityToken, jwks, {
    issuer: "https://appleid.apple.com",
    audience: env().APPLE_BUNDLE_ID,
  }).catch(() => {
    throw new AppError("invalid_credentials", "Apple token was rejected", 401);
  });
  const sub = typeof payload.sub === "string" ? payload.sub : null;
  const email = typeof payload.email === "string" ? payload.email : `${createHash("sha256").update(sub ?? "").digest("hex").slice(0, 16)}@apple.invalid`;
  if (!sub) throw new AppError("invalid_credentials", "Apple token was rejected", 401);
  if (await isLiveNeonSchema()) {
    const existing = await getPool().query<UserRow>(
      `${LIVE_AUTH_USER_SELECT} WHERE u.apple_sub = $1 LIMIT 1`,
      [sub],
    );
    if (existing.rows[0]) {
      await writeProductionLogin(res, existing.rows[0]);
      return;
    }
    const username = `apple_${sub.slice(0, 8)}`;
    const user = await withTransaction(async (client) => {
      const id = randomUUID();
      await client.query(
        `INSERT INTO elix_auth_users
           (id, email, email_lower, username, display_name, apple_sub, email_confirmed_at, created_at)
         VALUES ($1, $2, $3, $4, $4, $5, NOW(), NOW())`,
        [id, email, normalizeEmail(email), username, sub],
      );
      await client.query(
        `INSERT INTO profiles (user_id, username, display_name, level, created_at, updated_at)
         VALUES ($1, $2, $2, 0, NOW(), NOW())
         ON CONFLICT (user_id) DO NOTHING`,
        [id, username],
      );
      const loaded = await client.query<UserRow>(`${LIVE_AUTH_USER_SELECT} WHERE u.id = $1`, [id]);
      return loaded.rows[0];
    });
    await writeProductionLogin(res, user);
    return;
  }
  const existing = await getPool().query<UserRow>(
    `SELECT id, email, username, display_name, avatar_url, bio, is_verified, is_admin, email_confirmed_at, created_at, banned_until
     FROM users WHERE apple_sub = $1 AND deleted_at IS NULL`,
    [sub],
  );
  if (existing.rows[0]) {
    await writeProductionLogin(res, existing.rows[0]);
    return;
  }
  const username = `apple_${sub.slice(0, 8)}`;
  const user = await withTransaction(async (client) => {
    const inserted = await client.query<UserRow>(
      `INSERT INTO users (email, email_normalized, username, username_normalized, display_name, apple_sub, email_confirmed_at)
       VALUES ($1, $2, $3, $4, $3, $5, NOW())
       RETURNING id, email, username, display_name, avatar_url, bio, is_verified, is_admin, email_confirmed_at, created_at`,
      [email, normalizeEmail(email), username, username.toLowerCase(), sub],
    );
    const row = inserted.rows[0];
    await client.query(`INSERT INTO wallet_balances (user_id) VALUES ($1)`, [row.id]);
    await client.query(`INSERT INTO creator_wallet_gbp (user_id) VALUES ($1)`, [row.id]);
    await client.query(`INSERT INTO notification_prefs (user_id) VALUES ($1)`, [row.id]);
    return row;
  });
  await writeProductionLogin(res, user);
}

router.post("/apple", (req, res, next) => {
  void appleNative(req, res).catch(next);
});
router.post("/apple/native", (req, res, next) => {
  void appleNative(req, res).catch(next);
});

router.get("/2fa/status", requireAuth, async (req: AuthedRequest, res) => {
  if (await isLiveNeonSchema()) {
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ enabled: false });
    return;
  }
  res.setHeader("Cache-Control", "private, no-store");
  const { rows } = await getPool().query<{ enabled_at: Date | null }>(
    `SELECT enabled_at FROM user_two_factor WHERE user_id = $1`,
    [req.userId],
  );
  res.json({ enabled: Boolean(rows[0]?.enabled_at) });
});

router.post("/2fa/enroll", requireAuth, async (req: AuthedRequest, res) => {
  const userId = req.userId as string;
  const existing = await getPool().query<{ enabled_at: Date | null }>(
    `SELECT enabled_at FROM user_two_factor WHERE user_id = $1`,
    [userId],
  );
  if (existing.rows[0]?.enabled_at) {
    throw new AppError("conflict", "2FA already enabled", 409);
  }
  const { generateTotpSecret } = await import("../../infra/totp.js");
  const secret = generateTotpSecret();
  await getPool().query(
    `INSERT INTO user_two_factor (user_id, secret_encrypted, enabled_at)
     VALUES ($1, $2, NULL)
     ON CONFLICT (user_id) DO UPDATE SET secret_encrypted = EXCLUDED.secret_encrypted, enabled_at = NULL`,
    [userId, encryptSecret(secret)],
  );
  res.json({ secret });
});

router.post("/2fa/verify", requireAuth, async (req: AuthedRequest, res) => {
  const userId = req.userId as string;
  const body = twoFactorCodeBodySchema.parse(req.body ?? {});
  const { verifyTotp } = await import("../../infra/totp.js");
  const { rows } = await getPool().query<{ secret_encrypted: string }>(
    `SELECT secret_encrypted FROM user_two_factor WHERE user_id = $1`,
    [userId],
  );
  if (!rows[0]) {
    throw new AppError("validation_error", "Enroll 2FA before verifying", 400);
  }
  if (!verifyTotp(decryptSecret(rows[0].secret_encrypted), body.code)) {
    throw new AppError("invalid_credentials", "Invalid authenticator code", 401);
  }
  await getPool().query(`UPDATE user_two_factor SET enabled_at = NOW() WHERE user_id = $1`, [userId]);
  res.json({ ok: true, enabled: true });
});

router.post("/2fa/disable", requireAuth, async (req: AuthedRequest, res) => {
  const userId = req.userId as string;
  const body = twoFactorCodeBodySchema.parse(req.body ?? {});
  const { rows } = await getPool().query<{ enabled_at: Date | null }>(
    `SELECT enabled_at FROM user_two_factor WHERE user_id = $1`,
    [userId],
  );
  if (!rows[0]?.enabled_at) {
    throw new AppError("validation_error", "2FA is not enabled", 400);
  }
  await assertTotpIfEnabled(userId, body.code);
  await getPool().query(`DELETE FROM user_two_factor WHERE user_id = $1`, [userId]);
  res.json({ ok: true, enabled: false });
});

export default router;
