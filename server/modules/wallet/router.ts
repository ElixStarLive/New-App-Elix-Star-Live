import { Router } from "express";
import { getPool } from "../../infra/postgres.js";
import { isLiveNeonSchema } from "../../infra/liveSchema.js";
import { requireAuth, type AuthedRequest } from "../../middleware/auth.js";
import { AppError } from "../../middleware/errors.js";
import { walletApiFromRow, type WalletRow } from "./ledger.js";

const router = Router();

router.get("/", requireAuth, async (req: AuthedRequest, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  try {
    const live = await isLiveNeonSchema();
    const { rows } = live
      ? await getPool().query<WalletRow>(
          `SELECT
             COALESCE((SELECT coin_balance FROM elix_wallet_balances WHERE user_id = $1), 0)::text AS paid_coins,
             COALESCE((SELECT balance FROM promotional_coin_balances WHERE user_id = $1), 0)::text AS promo_coins,
             COALESCE((SELECT balance FROM starter_coin_balances WHERE user_id = $1), 0)::text AS starter_coins`,
          [req.userId],
        )
      : await getPool().query<WalletRow>(
          `SELECT paid_coins, promo_coins, starter_coins FROM wallet_balances WHERE user_id = $1`,
          [req.userId],
        );
    if (!live && !rows[0]) throw new AppError("not_found", "Wallet not found", 404);
    res.status(200).json(
      walletApiFromRow(rows[0] ?? { paid_coins: "0", promo_coins: "0", starter_coins: "0" }, req.userId as string),
    );
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("DATABASE_UNAVAILABLE", "DATABASE_UNAVAILABLE", 503);
  }
});

export default router;
