import type { Response } from "express";
import { getPool, withTransaction } from "../../infra/postgres.js";
import { isLiveNeonSchema } from "../../infra/liveSchema.js";
import { logger } from "../../infra/logger.js";
import { AppError } from "../../middleware/errors.js";
import type { AuthedRequest } from "../../middleware/auth.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const ADMIN_USERS_LIMIT = 500;
export const ADMIN_USERS_SEARCH_MAX = 80;
export const ADMIN_USERS_REASON_MAX = 500;

export const ADMIN_USERS_LIST_SQL = `
  SELECT id::text AS id,
         username,
         email,
         avatar_url,
         created_at,
         (banned_until IS NOT NULL AND banned_until > NOW()) AS is_banned
    FROM users
   WHERE deleted_at IS NULL
     AND (
       $1 = ''
       OR LOWER(username) LIKE $2 ESCAPE E'\\\\'
       OR LOWER(email) LIKE $2 ESCAPE E'\\\\'
     )
   ORDER BY created_at DESC NULLS LAST
   LIMIT ${ADMIN_USERS_LIMIT}
`;

export const ADMIN_USERS_LIST_SQL_LIVE = `
  SELECT u.id::text AS id,
         COALESCE(NULLIF(p.username, ''), u.username) AS username,
         u.email,
         COALESCE(NULLIF(p.avatar_url, ''), u.avatar_url) AS avatar_url,
         u.created_at,
         (p.banned_until IS NOT NULL AND p.banned_until > NOW()) AS is_banned
    FROM elix_auth_users u
    LEFT JOIN profiles p ON p.user_id = u.id
   WHERE (
       $1 = ''
       OR LOWER(COALESCE(p.username, u.username)) LIKE $2 ESCAPE E'\\\\'
       OR LOWER(u.email) LIKE $2 ESCAPE E'\\\\'
     )
   ORDER BY u.created_at DESC NULLS LAST
   LIMIT ${ADMIN_USERS_LIMIT}
`;

export type AdminUserRow = {
  id: string;
  username: string;
  email: string;
  avatar_url: string | null;
  created_at: string;
  is_banned: boolean;
};

export function isAdminUserId(value: string): boolean {
  return UUID_RE.test(value);
}

export function escapeAdminUserLike(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export function parseAdminUsersQuery(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().slice(0, ADMIN_USERS_SEARCH_MAX);
}

export function parseOptionalBanUntil(raw: unknown): Date | null {
  if (raw == null || raw === "") return null;
  if (typeof raw !== "string") throw new AppError("validation_error", "Invalid until date", 400);
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) throw new AppError("validation_error", "Invalid until date", 400);
  return date;
}

export function parseOptionalBanReason(raw: unknown): string | null {
  if (raw == null || raw === "") return null;
  if (typeof raw !== "string") throw new AppError("validation_error", "Invalid reason", 400);
  const reason = raw.trim();
  if (reason.length > ADMIN_USERS_REASON_MAX) throw new AppError("validation_error", "Reason is too long", 400);
  return reason || null;
}

function postgresUnavailableCode(error: unknown): string | undefined {
  return error && typeof error === "object" && "code" in error ? String((error as { code?: string }).code) : undefined;
}

function writeDatabaseFailure(res: Response, error: unknown, label: string): void {
  const code = postgresUnavailableCode(error);
  logger.error({ err: error }, label);
  if (code === "42P01" || code === "42703") {
    res.status(503).json({ error: "SCHEMA_UNAVAILABLE" });
    return;
  }
  res.status(500).json({ error: "DATABASE_ERROR" });
}

function mapUserRow(row: {
  id: string;
  username: string;
  email: string;
  avatar_url: string | null;
  created_at: Date | string;
  is_banned: boolean;
}): AdminUserRow {
  const created =
    row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at || "");
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    avatar_url: row.avatar_url,
    created_at: created,
    is_banned: row.is_banned === true,
  };
}

export async function loadAdminUsers(query: unknown): Promise<AdminUserRow[]> {
  const q = parseAdminUsersQuery(query);
  const like = q ? `%${escapeAdminUserLike(q.toLowerCase())}%` : "";
  const live = await isLiveNeonSchema();
  const { rows } = await getPool().query<{
    id: string;
    username: string;
    email: string;
    avatar_url: string | null;
    created_at: Date;
    is_banned: boolean;
  }>(live ? ADMIN_USERS_LIST_SQL_LIVE : ADMIN_USERS_LIST_SQL, [q, like]);
  return rows.map(mapUserRow);
}

async function requireTargetUser(userId: string): Promise<void> {
  const live = await isLiveNeonSchema();
  const { rows } = live
    ? await getPool().query<{ id: string }>(`SELECT id FROM elix_auth_users WHERE id = $1`, [userId])
    : await getPool().query<{ id: string }>(
        `SELECT id FROM users WHERE id = $1 AND deleted_at IS NULL`,
        [userId],
      );
  if (!rows[0]) throw new AppError("not_found", "User not found", 404);
}

async function notifyBannedSessions(userId: string): Promise<void> {
  try {
    const realtime = await import("../../websocket/index.js");
    realtime.disconnectUserSessions(userId, "Banned");
    await realtime.sendToUserGlobal(userId, "force_disconnect", { reason: "Banned" });
  } catch (error) {
    logger.warn({ err: error, userId }, "admin ban realtime notify failed");
  }
}

export async function applyAdminBan(
  actorId: string,
  userId: string,
  until: Date | null,
  reason: string | null,
): Promise<{ ok: true; userId: string; banned_until: string; is_banned: true }> {
  await requireTargetUser(userId);
  const bannedUntil = until ?? new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000);
  const live = await isLiveNeonSchema();
  await withTransaction(async (client) => {
    if (live) {
      await client.query(
        `INSERT INTO profiles (user_id, banned_until, updated_at) VALUES ($1, $2, NOW())
         ON CONFLICT (user_id) DO UPDATE
           SET banned_until = EXCLUDED.banned_until, updated_at = NOW()`,
        [userId, bannedUntil],
      );
      await client.query(
        `UPDATE elix_auth_sessions SET revoked_at = NOW()
          WHERE user_id = $1 AND (revoked_at IS NULL)`,
        [userId],
      );
    } else {
      const updated = await client.query(
        `UPDATE users
            SET banned_until = $2, updated_at = NOW()
          WHERE id = $1 AND deleted_at IS NULL`,
        [userId, bannedUntil],
      );
      if (!updated.rowCount) throw new AppError("not_found", "User not found", 404);
      await client.query(
        `UPDATE auth_sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`,
        [userId],
      );
    }
  });
  await notifyBannedSessions(userId);
  logger.warn({ userId, bannedUntil, reason, by: actorId }, "admin ban applied");
  return {
    ok: true,
    userId,
    banned_until: bannedUntil.toISOString(),
    is_banned: true,
  };
}

export async function applyAdminUnban(
  actorId: string,
  userId: string,
): Promise<{ ok: true; userId: string; is_banned: false }> {
  await requireTargetUser(userId);
  const live = await isLiveNeonSchema();
  if (live) {
    const updated = await getPool().query(
      `UPDATE profiles SET banned_until = NULL, updated_at = NOW() WHERE user_id = $1`,
      [userId],
    );
    if (!updated.rowCount) throw new AppError("not_found", "User not found", 404);
  } else {
    const updated = await getPool().query(
      `UPDATE users
          SET banned_until = NULL, updated_at = NOW()
        WHERE id = $1 AND deleted_at IS NULL`,
      [userId],
    );
    if (!updated.rowCount) throw new AppError("not_found", "User not found", 404);
  }
  logger.info({ userId, by: actorId }, "admin ban lifted");
  return { ok: true, userId, is_banned: false };
}

export async function handleAdminUsers(req: AuthedRequest, res: Response): Promise<void> {
  res.setHeader("Cache-Control", "private, no-store");
  try {
    const users = await loadAdminUsers(req.query.q);
    res.json({ users });
  } catch (error) {
    writeDatabaseFailure(res, error, "admin list users failed");
  }
}

export async function handleAdminBan(req: AuthedRequest, res: Response): Promise<void> {
  res.setHeader("Cache-Control", "private, no-store");
  const userId = String(req.params.userId ?? "");
  if (!isAdminUserId(userId)) throw new AppError("validation_error", "Invalid user", 400);
  const until = parseOptionalBanUntil(req.body?.until);
  const reason = parseOptionalBanReason(req.body?.reason);
  try {
    res.json(await applyAdminBan(req.userId as string, userId, until, reason));
  } catch (error) {
    if (error instanceof AppError) throw error;
    writeDatabaseFailure(res, error, "admin ban failed");
  }
}

export async function handleAdminUnban(req: AuthedRequest, res: Response): Promise<void> {
  res.setHeader("Cache-Control", "private, no-store");
  const userId = String(req.params.userId ?? "");
  if (!isAdminUserId(userId)) throw new AppError("validation_error", "Invalid user", 400);
  try {
    res.json(await applyAdminUnban(req.userId as string, userId));
  } catch (error) {
    if (error instanceof AppError) throw error;
    writeDatabaseFailure(res, error, "admin unban failed");
  }
}
