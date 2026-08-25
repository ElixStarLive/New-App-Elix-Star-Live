import { getPool } from "../../infra/postgres.js";
import { AppError } from "../../middleware/errors.js";

const USER_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type BlockedUserRow = {
  blocked_user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  created_at: string;
};

function assertUserId(value: string, message: string): string {
  const id = value.trim();
  if (!USER_ID_RE.test(id)) {
    throw new AppError("validation_error", message, 400);
  }
  return id;
}

export async function isBlockedEitherWay(userA: string, userB: string): Promise<boolean> {
  const { rows } = await getPool().query(
    `SELECT 1 FROM blocks
     WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)
     LIMIT 1`,
    [userA, userB],
  );
  return Boolean(rows[0]);
}

export async function listBlockedUsers(blockerId: string): Promise<BlockedUserRow[]> {
  const { rows } = await getPool().query<{
    blocked_user_id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
    created_at: Date;
  }>(
    `SELECT b.blocked_id AS blocked_user_id,
            u.username,
            u.display_name,
            u.avatar_url,
            b.created_at
     FROM blocks b
     JOIN users u ON u.id = b.blocked_id
     WHERE b.blocker_id = $1
       AND b.blocked_id <> $1
       AND u.deleted_at IS NULL
     ORDER BY b.created_at DESC, b.blocked_id ASC`,
    [blockerId],
  );
  return rows.map((row) => ({
    blocked_user_id: row.blocked_user_id,
    username: row.username,
    display_name: row.display_name,
    avatar_url: row.avatar_url,
    created_at: row.created_at.toISOString(),
  }));
}

export async function insertBlock(blockerId: string, targetId: string): Promise<void> {
  const target = assertUserId(targetId, "blockedUserId required");
  if (target === blockerId) {
    throw new AppError("validation_error", "Cannot block yourself", 400);
  }
  const found = await getPool().query<{ id: string }>(
    `SELECT id FROM users WHERE id = $1 AND deleted_at IS NULL`,
    [target],
  );
  if (!found.rows[0]) {
    throw new AppError("not_found", "User not found", 404);
  }
  await getPool().query(
    `INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [blockerId, target],
  );
}

export async function deleteBlock(blockerId: string, targetId: string): Promise<void> {
  const target = assertUserId(targetId, "blockedUserId required");
  if (target === blockerId) {
    throw new AppError("validation_error", "Cannot unblock yourself", 400);
  }
  await getPool().query(`DELETE FROM blocks WHERE blocker_id = $1 AND blocked_id = $2`, [blockerId, target]);
}
