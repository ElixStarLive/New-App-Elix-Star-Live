import { getPool } from "../../infra/postgres.js";
import { AppError } from "../../middleware/errors.js";
import { parseCoinCount } from "../wallet/ledger.js";
import { fanTierForLevel } from "../../../shared/engagement/fanTiers.js";
import { getProgressionSnapshot } from "./progression.js";
import { mapEngagementDbError } from "./settings.js";
import type { EngagementRewardWallet } from "../../../shared/contracts/engagement.js";

function requiredCount(value: unknown, label: string): number {
  const n = parseCoinCount(value);
  if (n == null) throw new AppError("unavailable", `${label} is unreadable`, 503);
  return n;
}

export function giftSpendableDisplay(purchased: number, starter: number, promo: number): number {
  return purchased + starter + promo;
}

export async function getRewardWalletForUser(userId: string): Promise<EngagementRewardWallet> {
  try {
    const [wallet, progress] = await Promise.all([
      getPool().query<{ paid_coins: string; promo_coins: string; starter_coins: string }>(
        `SELECT paid_coins::text AS paid_coins, promo_coins::text AS promo_coins,
                starter_coins::text AS starter_coins
         FROM wallet_balances WHERE user_id = $1`,
        [userId],
      ),
      getProgressionSnapshot(userId),
    ]);
    const row = wallet.rows[0];
    if (!row) throw new AppError("unavailable", "Wallet is unreadable", 503);
    const purchasedCoins = requiredCount(row.paid_coins, "Purchased coins");
    const starterCoins = requiredCount(row.starter_coins, "Starter coins");
    const promotionalCoins = requiredCount(row.promo_coins, "Promotional coins");
    return {
      purchasedCoins,
      starterCoins,
      promotionalCoins,
      totalGiftSpendable: giftSpendableDisplay(purchasedCoins, starterCoins, promotionalCoins),
      battleEnergy: progress.battle_energy,
      totalXp: progress.total_xp,
      fanLevel: progress.fan_level,
      fanTier: fanTierForLevel(progress.fan_level),
    };
  } catch (error) {
    mapEngagementDbError(error);
  }
}
