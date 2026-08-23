import { getPool } from "../../infra/postgres.js";
import { AppError } from "../../middleware/errors.js";
import { parseCoinCount } from "../wallet/ledger.js";
import { bumpAchievement } from "./achievements.js";
import { mapEngagementDbError } from "./settings.js";
import type { EngagementMvpPeriod, EngagementMvpRow } from "../../../shared/contracts/engagement.js";

export function normalizeMvpPeriod(raw: unknown): EngagementMvpPeriod {
  return raw === "week" || raw === "all" ? raw : "today";
}

function requiredCount(value: unknown, label: string): number {
  const n = parseCoinCount(value);
  if (n == null) throw new AppError("unavailable", `${label} is unreadable`, 503);
  return n;
}

export async function addMvpPoints(
  userId: string,
  points: number,
  opts: { roomId?: string; hostUserId?: string; source?: string; giftTransactionId?: string | null },
): Promise<void> {
  const pts = Math.max(0, Math.floor(points));
  if (!userId || pts <= 0) return;
  if (opts.source === "test" || opts.source === "test_gift") return;
  try {
    if (opts.giftTransactionId) {
      await getPool().query(
        `INSERT INTO mvp_scores (user_id, room_id, host_user_id, points, source, day_key, gift_transaction_id)
         VALUES ($1, $2, $3, $4, $5, CURRENT_DATE, $6)
         ON CONFLICT (gift_transaction_id) WHERE gift_transaction_id IS NOT NULL DO NOTHING`,
        [userId, opts.roomId || "", opts.hostUserId || "", pts, opts.source || "gift", opts.giftTransactionId],
      );
    } else {
      await getPool().query(
        `INSERT INTO mvp_scores (user_id, room_id, host_user_id, points, source, day_key)
         VALUES ($1, $2, $3, $4, $5, CURRENT_DATE)`,
        [userId, opts.roomId || "", opts.hostUserId || "", pts, opts.source || "gift"],
      );
    }
    const board = await getMvpLeaderboard("today", 10);
    if (board.some((row) => row.user_id === userId && row.rank <= 10)) {
      await bumpAchievement(userId, "mvp_top10", 1);
    }
  } catch (error) {
    mapEngagementDbError(error);
  }
}

export async function getMvpLeaderboard(
  period: EngagementMvpPeriod,
  limit = 50,
): Promise<EngagementMvpRow[]> {
  try {
    let where = "TRUE";
    if (period === "today") where = "day_key = CURRENT_DATE";
    if (period === "week") where = "day_key >= (CURRENT_DATE - INTERVAL '7 days')";
    const { rows } = await getPool().query<{ user_id: string; points: string }>(
      `SELECT user_id::text AS user_id, SUM(points)::text AS points
       FROM mvp_scores
       WHERE ${where}
       GROUP BY user_id
       ORDER BY SUM(points) DESC
       LIMIT $1`,
      [Math.min(100, Math.max(1, Math.floor(limit) || 50))],
    );
    return rows.map((row, index) => ({
      rank: index + 1,
      user_id: row.user_id,
      points: requiredCount(row.points, "MVP points"),
    }));
  } catch (error) {
    mapEngagementDbError(error);
  }
}
