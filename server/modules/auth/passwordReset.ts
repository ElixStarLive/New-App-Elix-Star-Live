import { withTransaction } from "../../infra/postgres.js";
import { env } from "../../infra/env.js";
import { requireValkey } from "../../infra/valkey.js";
import { hashPassword } from "../../infra/password.js";
import { randomToken, sha256 } from "../../infra/tokens.js";
import { AppError } from "../../middleware/errors.js";
import { logger } from "../../infra/logger.js";

export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;
export const PASSWORD_RESET_REQUEST_MAX = 3;
export const PASSWORD_RESET_REQUEST_WINDOW_SEC = 15 * 60;

export function passwordResetCallbackUrl(origin: string, rawToken: string): string {
  const base = origin.replace(/\/$/, "");
  return `${base}/reset-password?token=${encodeURIComponent(rawToken)}`;
}

export function passwordResetRequestKey(emailNormalized: string): string {
  return `auth:reset:req:${sha256(emailNormalized)}`;
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
    logger.error({ err: error }, "password reset rate limit lookup failed");
    throw new AppError("unavailable", "Reset temporarily unavailable. Please try again.", 503);
  }
}

export async function recordPasswordResetRequest(emailNormalized: string): Promise<void> {
  if (!env().valkeyUrl) return;
  const key = passwordResetRequestKey(emailNormalized);
  const count = await requireValkey().incr(key);
  if (count === 1) await requireValkey().expire(key, PASSWORD_RESET_REQUEST_WINDOW_SEC);
}

export async function issuePasswordResetToken(userId: string): Promise<string> {
  const raw = randomToken();
  await withTransaction(async (client) => {
    await client.query(
      `UPDATE password_reset_tokens
       SET used_at = NOW()
       WHERE user_id = $1 AND used_at IS NULL`,
      [userId],
    );
    await client.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [userId, sha256(raw), new Date(Date.now() + PASSWORD_RESET_TTL_MS)],
    );
  });
  return raw;
}

export async function applyPasswordReset(rawToken: string, newPassword: string): Promise<{ userId: string }> {
  if (newPassword.length < 8 || newPassword.length > 128) {
    throw new AppError("validation_error", "Password must be at least 8 characters.", 400);
  }
  const trimmed = rawToken.trim();
  if (trimmed.length < 10) {
    throw new AppError("invalid_credentials", "Invalid or expired reset link.", 400);
  }
  const tokenHash = sha256(trimmed);
  return withTransaction(async (client) => {
    const { rows } = await client.query<{
      id: string;
      user_id: string;
      expires_at: Date;
      used_at: Date | null;
    }>(
      `SELECT id, user_id, expires_at, used_at
       FROM password_reset_tokens
       WHERE token_hash = $1
       FOR UPDATE`,
      [tokenHash],
    );
    const row = rows[0];
    if (!row) {
      throw new AppError("invalid_credentials", "Invalid or expired reset link.", 400);
    }
    if (row.used_at) {
      throw new AppError("invalid_credentials", "This reset link has already been used or is no longer valid.", 400);
    }
    if (row.expires_at.getTime() <= Date.now()) {
      throw new AppError("invalid_credentials", "This reset link has expired.", 400);
    }
    const user = await client.query<{ deleted_at: Date | null }>(
      `SELECT deleted_at FROM users WHERE id = $1 FOR UPDATE`,
      [row.user_id],
    );
    if (!user.rows[0] || user.rows[0].deleted_at) {
      throw new AppError("invalid_credentials", "Invalid or expired reset link.", 400);
    }
    const passwordHash = await hashPassword(newPassword);
    await client.query(`UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`, [
      passwordHash,
      row.user_id,
    ]);
    await client.query(
      `UPDATE password_reset_tokens
       SET used_at = NOW()
       WHERE user_id = $1 AND used_at IS NULL`,
      [row.user_id],
    );
    await client.query(`UPDATE auth_sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`, [
      row.user_id,
    ]);
    return { userId: row.user_id };
  });
}
