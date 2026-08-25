import { getPool } from "../../infra/postgres.js";
import { AppError } from "../../middleware/errors.js";
import { parseCoinCount } from "../wallet/ledger.js";
import type { EngagementHub } from "../../../shared/contracts/engagement.js";
import { fanTierForLevel } from "../../../shared/engagement/fanTiers.js";
import { utcDateKey, utcWeekKey } from "./period.js";
import { getDailyLoginSummary } from "./dailyLogin.js";
import { getProgressionSnapshot } from "./progression.js";
import { mapEngagementDbError } from "./settings.js";

export { fanTierForLevel };

function requiredCount(value: unknown, label: string): number {
  const n = parseCoinCount(value);
  if (n == null) throw new AppError("unavailable", `${label} is unreadable`, 503);
  return n;
}

export async function getHubSummary(userId: string): Promise<EngagementHub> {
  try {
    const [progress, wallet, missions, daily] = await Promise.all([
      getProgressionSnapshot(userId),
      getPool().query<{ promo_coins: string; starter_coins: string }>(
        `SELECT promo_coins::text AS promo_coins, starter_coins::text AS starter_coins
         FROM wallet_balances WHERE user_id = $1`,
        [userId],
      ),
      getPool().query<{ n: number }>(
        `SELECT COUNT(*)::int AS n
         FROM engagement_missions m
         LEFT JOIN user_mission_progress p
           ON p.mission_id = m.id
          AND p.user_id = $1
          AND p.period_key = CASE WHEN m.scope = 'weekly' THEN $3 ELSE $2 END
         WHERE m.enabled = TRUE AND COALESCE(p.claimed, FALSE) = FALSE`,
        [userId, utcDateKey(), utcWeekKey()],
      ),
      getDailyLoginSummary(userId),
    ]);
    const promo = wallet.rows[0] ? requiredCount(wallet.rows[0].promo_coins, "Promo") : 0;
    const starter = wallet.rows[0] ? requiredCount(wallet.rows[0].starter_coins, "Starter") : 0;
    return {
      promotional_balance: promo,
      battle_energy: progress.battle_energy,
      total_xp: progress.total_xp,
      fan_level: progress.fan_level,
      fan_tier: fanTierForLevel(progress.fan_level),
      missions_open: requiredCount(missions.rows[0]?.n ?? 0, "missions"),
      daily_login: daily,
      starter_coin_balance: starter,
    };
  } catch (error) {
    mapEngagementDbError(error);
  }
}
