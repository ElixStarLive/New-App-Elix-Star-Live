import type { Request, Response } from "express";
import { Router } from "express";
import { createHash } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import {
  appleNativeBodySchema,
  canonicalizeUsername,
  deleteAccountBodySchema,
  forgotPasswordBodySchema,
  loginBodySchema,
  loginIdentifier,
  REGISTER_CONSENT_TYPE,
  REGISTER_CONSENT_VERSION,
  REGISTER_WELCOME_STARTER,
  registerBodySchema,
  resetPasswordBodySchema,
  sessionUserSchema,
  usernameSchema,
  verifyEmailBodySchema,
} from "../../../shared/contracts/auth.js";
import { REGISTER_STARTER_COINS } from "../../../shared/contracts/money.js";
import { getPool, withTransaction } from "../../infra/postgres.js";
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
  banned_until?: Date | null;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeUsername(username: string): string {
  return canonicalizeUsername(username).toLowerCase();
}

async function followerCounts(userId: string): Promise<{ followerCount: number; followingCount: number }> {
  const { rows } = await getPool().query<{ followers: string; following: string }>(
    `SELECT
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
  const raw = randomToken();
  const tokenHash = sha256(raw);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const { rows } = await getPool().query<{ id: string }>(
    `INSERT INTO auth_sessions (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3) RETURNING id`,
    [user.id, tokenHash, expiresAt],
  );
  const sessionId = rows[0].id;
  const jwt = await signAccessToken(user.id, sessionId);
  return { token: jwt, user: await toSessionUser(user) };
}

async function findUserByLogin(emailOrUsername: string): Promise<(UserRow & { password_hash: string | null }) | null> {
  const value = emailOrUsername.trim();
  const { rows } = await getPool().query<UserRow & { password_hash: string | null }>(
    `SELECT id, email, username, display_name, avatar_url, bio, is_verified, is_admin, email_confirmed_at, password_hash, banned_until
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
    throw new AppError("invalid_credentials", "Invalid login credentials.", 401);
  }
  const ok = await verifyPassword(body.password, user.password_hash);
  if (!ok) {
    await recordLoginFailure(identifier);
    throw new AppError("invalid_credentials", "Invalid login credentials.", 401);
  }
  if (!user.email_confirmed_at && mailIsConfigured()) {
    throw new AppError(
      "forbidden",
      "Please confirm your email before logging in. Check your inbox or request a new confirmation email.",
      403,
    );
  }
  const session = await issueSession(user);
  await clearLoginFailure(identifier);
  res.json(session);
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
  const { rows } = await getPool().query<{ password_hash: string | null }>(
    `SELECT password_hash FROM users WHERE id = $1`,
    [req.userId],
  );
  if (!rows[0]?.password_hash) throw new AppError("invalid_credentials", "Password change is not available", 400);
  const ok = await verifyPassword(currentPassword, rows[0].password_hash);
  if (!ok) throw new AppError("invalid_credentials", "Current password is incorrect", 401);
  const passwordHash = await hashPassword(newPassword);
  await withTransaction(async (client) => {
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
  const { rows } = await getPool().query<UserRow>(
    `SELECT id, email, username, display_name, avatar_url, bio, is_verified, is_admin, email_confirmed_at
     FROM users WHERE id = $1 AND deleted_at IS NULL`,
    [req.userId],
  );
  if (!rows[0]) throw new AppError("unauthenticated", "Session expired", 401);
  res.json({ user: await toSessionUser(rows[0]) });
});

router.post("/logout", requireAuth, async (req: AuthedRequest, res: Response) => {
  await getPool().query(`UPDATE auth_sessions SET revoked_at = NOW() WHERE id = $1`, [req.sessionId]);
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
  const { rows } = await getPool().query<{ id: string; email: string }>(
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

router.post("/verify-email", async (req: Request, res: Response) => {
  const body = verifyEmailBodySchema.parse(req.body);
  const result = await consumeEmailVerifyToken(body.token);
  res.json({ ok: true, alreadyConfirmed: result.alreadyConfirmed });
});

router.post("/consent", requireAuth, async (req: AuthedRequest, res: Response) => {
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

router.post("/delete-account", requireAuth, async (req: AuthedRequest, res: Response) => {
  const body = deleteAccountBodySchema.parse(req.body ?? {});
  const { rows } = await getPool().query<{ password_hash: string | null }>(
    `SELECT password_hash FROM users WHERE id = $1`,
    [req.userId],
  );
  if (rows[0]?.password_hash) {
    if (!body.password || !(await verifyPassword(body.password, rows[0].password_hash))) {
      throw new AppError("invalid_credentials", "Password required to delete account", 401);
    }
  }
  await withTransaction(async (client) => {
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
  const existing = await getPool().query<UserRow>(
    `SELECT id, email, username, display_name, avatar_url, bio, is_verified, is_admin, email_confirmed_at, banned_until
     FROM users WHERE apple_sub = $1 AND deleted_at IS NULL`,
    [sub],
  );
  if (existing.rows[0]) {
    res.json(await issueSession(existing.rows[0]));
    return;
  }
  const username = `apple_${sub.slice(0, 8)}`;
  const user = await withTransaction(async (client) => {
    const inserted = await client.query<UserRow>(
      `INSERT INTO users (email, email_normalized, username, username_normalized, display_name, apple_sub, email_confirmed_at)
       VALUES ($1, $2, $3, $4, $3, $5, NOW())
       RETURNING id, email, username, display_name, avatar_url, bio, is_verified, is_admin, email_confirmed_at`,
      [email, normalizeEmail(email), username, username.toLowerCase(), sub],
    );
    const row = inserted.rows[0];
    await client.query(`INSERT INTO wallet_balances (user_id) VALUES ($1)`, [row.id]);
    await client.query(`INSERT INTO creator_wallet_gbp (user_id) VALUES ($1)`, [row.id]);
    await client.query(`INSERT INTO notification_prefs (user_id) VALUES ($1)`, [row.id]);
    return row;
  });
  res.status(201).json(await issueSession(user));
}

router.post("/apple", (req, res, next) => {
  void appleNative(req, res).catch(next);
});
router.post("/apple/native", (req, res, next) => {
  void appleNative(req, res).catch(next);
});

router.get("/2fa/status", requireAuth, async (req: AuthedRequest, res) => {
  const { rows } = await getPool().query<{ enabled_at: Date | null }>(
    `SELECT enabled_at FROM user_two_factor WHERE user_id = $1`,
    [req.userId],
  );
  res.json({ enabled: Boolean(rows[0]?.enabled_at), enrolled: Boolean(rows[0]) });
});

router.post("/2fa/enroll", requireAuth, async (req: AuthedRequest, res) => {
  const { generateTotpSecret } = await import("../../infra/totp.js");
  const secret = generateTotpSecret();
  await getPool().query(
    `INSERT INTO user_two_factor (user_id, secret_encrypted)
     VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET secret_encrypted = EXCLUDED.secret_encrypted, enabled_at = NULL`,
    [req.userId, encryptSecret(secret)],
  );
  res.json({ secret, otpauth: `otpauth://totp/Elix:${req.userId}?secret=${secret}&issuer=Elix` });
});

router.post("/2fa/verify", requireAuth, async (req: AuthedRequest, res) => {
  const { verifyTotp } = await import("../../infra/totp.js");
  const code = typeof req.body?.code === "string" ? req.body.code : "";
  const { rows } = await getPool().query<{ secret_encrypted: string }>(
    `SELECT secret_encrypted FROM user_two_factor WHERE user_id = $1`,
    [req.userId],
  );
  if (!rows[0] || !verifyTotp(decryptSecret(rows[0].secret_encrypted), code)) {
    throw new AppError("invalid_credentials", "Invalid authenticator code", 401);
  }
  await getPool().query(`UPDATE user_two_factor SET enabled_at = NOW() WHERE user_id = $1`, [req.userId]);
  res.json({ ok: true });
});

router.post("/2fa/disable", requireAuth, async (req: AuthedRequest, res) => {
  const code = typeof req.body?.code === "string" ? req.body.code : "";
  await assertTotpIfEnabled(req.userId as string, code || undefined);
  await getPool().query(`DELETE FROM user_two_factor WHERE user_id = $1`, [req.userId]);
  res.json({ ok: true });
});

export default router;
