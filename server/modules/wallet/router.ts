import { Router } from "express";
import { getPool } from "../../infra/postgres.js";
import { requireAuth, type AuthedRequest } from "../../middleware/auth.js";
import { AppError } from "../../middleware/errors.js";
import { walletApiFromRow, type WalletRow } from "./ledger.js";

const router = Router();

router.get("/", requireAuth, async (req: AuthedRequest, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  try {
    
    const { rows } = await getPool().query<WalletRow>(
          `SELECT paid_coins, promo_coins, starter_coins FROM wallet_balances WHERE user_id = $1`,
          [req.userId],
        );
    if (!rows[0]) throw new AppError("not_found", "Wallet not found", 404);
    res.status(200).json(
      walletApiFromRow(rows[0], req.userId as string),
    );
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("DATABASE_UNAVAILABLE", "DATABASE_UNAVAILABLE", 503);
  }
});

export default router;
