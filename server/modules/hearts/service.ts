import { getPool } from "../../infra/postgres.js";
import type { DailyHeartStatus } from "../../../shared/contracts/hearts.js";

export async function readDailyHeartStatus(
  creatorId: string,
  memberId: string | null,
): Promise<DailyHeartStatus> {
  const pool = getPool();
  const today = await pool.query<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt FROM daily_hearts WHERE creator_user_id = $1 AND day = CURRENT_DATE`,
    [creatorId],
  );
  const total = await pool.query<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt FROM daily_hearts WHERE creator_user_id = $1`,
    [creatorId],
  );
  let hasSent = false;
  if (memberId) {
    const sent = await pool.query(
      `SELECT 1 FROM daily_hearts
       WHERE creator_user_id = $1 AND member_user_id = $2 AND day = CURRENT_DATE`,
      [creatorId, memberId],
    );
    hasSent = Boolean(sent.rows[0]);
  }
  return {
    todayCount: Number(today.rows[0]?.cnt ?? 0),
    totalCount: Number(total.rows[0]?.cnt ?? 0),
    hasSent,
  };
}

export async function sendDailyHeart(
  creatorId: string,
  memberId: string,
): Promise<{ ok: true; already: boolean }> {
  const wrote = await getPool().query<{ member_user_id: string }>(
    `INSERT INTO daily_hearts (creator_user_id, member_user_id, day)
     VALUES ($1, $2, CURRENT_DATE)
     ON CONFLICT (creator_user_id, member_user_id, day) DO NOTHING
     RETURNING member_user_id`,
    [creatorId, memberId],
  );
  return { ok: true, already: !wrote.rows[0] };
}
