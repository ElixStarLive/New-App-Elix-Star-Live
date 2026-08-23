import { createHash } from "node:crypto";
import { getPool, withTransaction } from "../../infra/postgres.js";
import { env } from "../../infra/env.js";
import { requireValkey } from "../../infra/valkey.js";
import { hashPassword } from "../../infra/password.js";
import { sha256, signPurposeToken, verifyPurposeToken } from "../../infra/tokens.js";
import { isLiveNeonSchema } from "../../infra/liveSchema.js";
import { AppError } from "../../middleware/errors.js";

/** Frozen OLD: 1 hour purpose-bound password reset JWT. */
export const PASSWORD_RESET_TTL_SEC = 60 * 60;
export const PASSWORD_RESET_REQUEST_MAX = 3;
export const PASSWORD_RESET_REQUEST_WINDOW_SEC = 15 * 60;

export type PasswordResetUser = {
  id: string;
  email: string;
  password_hash: string;
};

export function passwordResetCallbackUrl(origin: string, rawToken: string): string {
  const base = origin.replace(/\/$/, "");
  return `${base}/reset-password?token=${encodeURIComponent(rawToken)}`;
}

export function passwordResetRequestKey(emailNormalized: string): string {
  return `auth:reset:req:${sha256(emailNormalized)}`;
}

/** Binding to current password hash — single-use after successful reset (frozen OLD). */
export function passwordResetBinding(passwordHash: string): string {
  return createHash("sha256").update(String(passwordHash)).digest("base64url").slice(0, 22);
}

export async function assertPasswordResetRequestAllowed(emailNormalized: string): Promise<void> {
  if (!env().valkeyUrl) return;
  try {
    const count = Number((await requireValkey().get(passwordResetRequestKey(emailNormalized))) ?? "0");
    if (count >= PASSWORD_RESET_REQUEST_MAX) {
      throw new AppError("rate_limited", "Too many reset requests. Please try again later.", 429);
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("unavailable", "Reset temporarily unavailable. Please try again.", 503);
  }
}

export async function recordPasswordResetRequest(emailNormalized: string): Promise<void> {
  if (!env().valkeyUrl) return;
  const key = passwordResetRequestKey(emailNormalized);
  const count = await requireValkey().incr(key);
  if (count === 1) await requireValkey().expire(key, PASSWORD_RESET_REQUEST_WINDOW_SEC);
}

export async function issuePasswordResetToken(user: PasswordResetUser): Promise<string> {
  return signPurposeToken({
    sub: user.id,
    email: user.email,
    purpose: "password_reset",
    pv: passwordResetBinding(user.password_hash),
    expirySec: PASSWORD_RESET_TTL_SEC,
  });
}

export async function applyPasswordReset(
  rawToken: string,
  newPassword: string,
): Promise<{ userId: string }> {
  if (newPassword.length < 8 || newPassword.length > 128) {
    throw new AppError("validation_error", "Password must be at least 8 characters.", 400);
  }
  const trimmed = rawToken.trim();
  if (!trimmed) {
    throw new AppError("unauthorized", "Unauthorized", 401);
  }

  const payload = await verifyPurposeToken(trimmed, "password_reset");
  if (!payload) {
    throw new AppError("invalid_credentials", "Invalid or expired reset link.", 401);
  }

  const live = await isLiveNeonSchema();
  if (live) {
    const { rows } = await getPool().query<{ id: string; password_hash: string }>(
      `SELECT id, password_hash FROM elix_auth_users WHERE id = $1 LIMIT 1`,
      [payload.sub],
    );
    const user = rows[0];
    if (!user) throw new AppError("not_found", "User not found.", 404);
    if (payload.pv !== passwordResetBinding(user.password_hash)) {
      throw new AppError(
        "invalid_credentials",
        "This reset link has already been used or is no longer valid.",
        401,
      );
    }
    const passwordHash = await hashPassword(newPassword);
    await getPool().query(`UPDATE elix_auth_users SET password_hash = $2 WHERE id = $1`, [
      user.id,
      passwordHash,
    ]);
    await getPool().query(`DELETE FROM elix_auth_sessions WHERE user_id = $1`, [user.id]);
    return { userId: user.id };
  }

  return withTransaction(async (client) => {
    const { rows } = await client.query<{
      id: string;
      password_hash: string;
      deleted_at: Date | null;
    }>(
      `SELECT id, password_hash, deleted_at FROM users WHERE id = $1 FOR UPDATE`,
      [payload.sub],
    );
    const user = rows[0];
    if (!user || user.deleted_at) {
      throw new AppError("invalid_credentials", "Invalid or expired reset link.", 400);
    }
    if (payload.pv !== passwordResetBinding(user.password_hash)) {
      throw new AppError(
        "invalid_credentials",
        "This reset link has already been used or is no longer valid.",
        401,
      );
    }
    const passwordHash = await hashPassword(newPassword);
    await client.query(`UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`, [
      passwordHash,
      user.id,
    ]);
    await client.query(`UPDATE auth_sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`, [
      user.id,
    ]);
    return { userId: user.id };
  });
}
