import { getPool, withTransaction } from "../../infra/postgres.js";
import { randomToken, sha256 } from "../../infra/tokens.js";
import { AppError } from "../../middleware/errors.js";

export const EMAIL_VERIFY_TTL_MS = 2 * 24 * 60 * 60 * 1000;

export function emailVerifyCallbackUrl(origin: string, rawToken: string): string {
  const base = origin.replace(/\/$/, "");
  return `${base}/auth/callback?token=${encodeURIComponent(rawToken)}`;
}

export async function issueEmailVerifyToken(userId: string): Promise<string> {
  const raw = randomToken();
  await getPool().query(
    `INSERT INTO email_verify_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, sha256(raw), new Date(Date.now() + EMAIL_VERIFY_TTL_MS)],
  );
  return raw;
}

export async function consumeEmailVerifyToken(rawToken: string): Promise<{ alreadyConfirmed: boolean }> {
  const tokenHash = sha256(rawToken.trim());
  return withTransaction(async (client) => {
    const { rows } = await client.query<{
      id: string;
      user_id: string;
      expires_at: Date;
      used_at: Date | null;
    }>(
      `SELECT id, user_id, expires_at, used_at
       FROM email_verify_tokens
       WHERE token_hash = $1
       FOR UPDATE`,
      [tokenHash],
    );
    const row = rows[0];
    if (!row) {
      throw new AppError("invalid_credentials", "Invalid or expired confirmation link.", 400);
    }

    const userResult = await client.query<{
      email_confirmed_at: Date | null;
      deleted_at: Date | null;
      banned_until: Date | null;
    }>(
      `SELECT email_confirmed_at, deleted_at, banned_until
       FROM users
       WHERE id = $1
       FOR UPDATE`,
      [row.user_id],
    );
    const user = userResult.rows[0];
    if (!user || user.deleted_at) {
      throw new AppError("invalid_credentials", "Invalid or expired confirmation link.", 400);
    }
    if (user.banned_until && user.banned_until.getTime() > Date.now()) {
      throw new AppError("forbidden", "Account suspended.", 403);
    }

    if (row.used_at) {
      if (user.email_confirmed_at) return { alreadyConfirmed: true };
      throw new AppError("invalid_credentials", "Invalid or expired confirmation link.", 400);
    }
    if (row.expires_at.getTime() <= Date.now()) {
      throw new AppError("invalid_credentials", "This confirmation link has expired.", 400);
    }

    await client.query(`UPDATE email_verify_tokens SET used_at = NOW() WHERE id = $1`, [row.id]);
    if (user.email_confirmed_at) return { alreadyConfirmed: true };
    await client.query(
      `UPDATE users SET email_confirmed_at = NOW(), updated_at = NOW() WHERE id = $1 AND email_confirmed_at IS NULL`,
      [row.user_id],
    );
    return { alreadyConfirmed: false };
  });
}
