import { createHash } from "node:crypto";
import { getPool } from "../../infra/postgres.js";
import { signPurposeToken, verifyPurposeToken } from "../../infra/tokens.js";
import { AppError } from "../../middleware/errors.js";

/** Frozen OLD: 24h purpose-bound email confirm JWT. */
export const EMAIL_VERIFY_TTL_SEC = 24 * 60 * 60;

export type EmailVerifyUser = {
  id: string;
  email: string;
  email_confirmed_at: Date | string | null;
  password_hash: string;
};

export type EmailVerifySessionUser = {
  id: string;
  email: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  bio?: string | null;
  is_verified?: boolean;
  is_admin?: boolean;
  email_confirmed_at: Date | string | null;
  created_at?: Date | string | null;
  banned_until?: Date | string | null;
  password_hash?: string | null;
};

export function emailVerifyCallbackUrl(origin: string, rawToken: string): string {
  const base = origin.replace(/\/$/, "");
  return `${base}/auth/callback?token=${encodeURIComponent(rawToken)}`;
}

/** Binding invalidates once the account is confirmed (frozen OLD). */
export function emailVerifyBinding(user: EmailVerifyUser): string {
  const confirmedRaw = user.email_confirmed_at;
  const confirmed =
    confirmedRaw instanceof Date
      ? confirmedRaw.toISOString()
      : typeof confirmedRaw === "string" && confirmedRaw.trim()
        ? confirmedRaw.trim()
        : null;
  const state = confirmed ? `confirmed:${confirmed}` : "pending";
  return createHash("sha256")
    .update(`${user.id}|${state}|${user.password_hash}`)
    .digest("base64url")
    .slice(0, 22);
}

export async function issueEmailVerifyToken(user: EmailVerifyUser): Promise<string> {
  if (user.email_confirmed_at) {
    throw new AppError("validation_error", "Email is already confirmed.", 400);
  }
  return signPurposeToken({
    sub: user.id,
    email: user.email,
    purpose: "email_verify",
    pv: emailVerifyBinding(user),
    expirySec: EMAIL_VERIFY_TTL_SEC,
  });
}

async function loadVerifyUser(userId: string): Promise<(EmailVerifySessionUser & { password_hash: string }) | null> {
  const { rows } = await getPool().query<EmailVerifySessionUser & { password_hash: string }>(
    `SELECT id, email, username, display_name, avatar_url, bio, is_verified, is_admin,
            email_confirmed_at, created_at, banned_until, password_hash
     FROM users
     WHERE id = $1 AND deleted_at IS NULL
     LIMIT 1`,
    [userId],
  );
  return rows[0] ?? null;
}

async function markEmailConfirmed(userId: string): Promise<Date | string | null> {
  const { rows } = await getPool().query<{ email_confirmed_at: Date | string | null }>(
    `UPDATE users
        SET email_confirmed_at = COALESCE(email_confirmed_at, NOW()), updated_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING email_confirmed_at`,
    [userId],
  );
  return rows[0]?.email_confirmed_at ?? null;
}

/**
 * Consume frozen OLD purpose JWT. Caller issues the production session response.
 * Status codes match OLD: 401 invalid, 404 missing user, 403 suspended.
 */
export async function consumeEmailVerifyToken(
  rawToken: string,
): Promise<{ user: EmailVerifySessionUser; alreadyConfirmed: boolean }> {
  const payload = await verifyPurposeToken(rawToken.trim(), "email_verify");
  if (!payload) {
    throw new AppError("invalid_credentials", "Invalid or expired confirmation link.", 401);
  }

  const user = await loadVerifyUser(payload.sub);
  if (!user?.password_hash) {
    throw new AppError("not_found", "User not found.", 404);
  }
  if (user.banned_until && new Date(user.banned_until).getTime() > Date.now()) {
    throw new AppError("forbidden", "Account suspended.", 403);
  }

  if (user.email_confirmed_at) {
    return { user, alreadyConfirmed: true };
  }

  if (payload.pv !== emailVerifyBinding(user)) {
    throw new AppError("invalid_credentials", "This confirmation link is no longer valid.", 401);
  }

  const confirmedAt = await markEmailConfirmed(user.id);
  if (!confirmedAt) {
    throw new AppError("unavailable", "Database not configured", 503);
  }
  return {
    user: { ...user, email_confirmed_at: confirmedAt },
    alreadyConfirmed: false,
  };
}
