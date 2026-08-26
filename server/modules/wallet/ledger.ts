import type { PoolClient } from "pg";
import type { CoinBucket, WalletBalance } from "../../../shared/contracts/money.js";
import { getPool } from "../../infra/postgres.js";
import { AppError } from "../../middleware/errors.js";

export type WalletRow = {
  paid_coins: string;
  promo_coins: string;
  starter_coins: string;
  test_coins: string;
};

const COLUMN: Record<CoinBucket, string> = {
  paid: "paid_coins",
  promo: "promo_coins",
  starter: "starter_coins",
  test: "test_coins",
};

export async function applyWalletDelta(
  client: PoolClient,
  params: {
    userId: string;
    bucket: CoinBucket;
    delta: number;
    reason: string;
    idempotencyKey: string;
    refType?: string;
    refId?: string;
  },
): Promise<{ balanceAfter: number }> {
  if (params.delta === 0) {
    throw new AppError("validation_error", "Wallet delta cannot be zero", 400);
  }
  const existing = await client.query<{ id: string }>(
    `SELECT id FROM wallet_ledger WHERE idempotency_key = $1`,
    [params.idempotencyKey],
  );
  if (existing.rows[0]) {
    throw new AppError("duplicate", "This wallet operation was already applied", 409);
  }
  const column = COLUMN[params.bucket];
  const locked = await client.query<WalletRow>(
    `SELECT paid_coins, promo_coins, starter_coins, test_coins
     FROM wallet_balances WHERE user_id = $1 FOR UPDATE`,
    [params.userId],
  );
  if (!locked.rows[0]) {
    throw new AppError("not_found", "Wallet not found", 404);
  }
  const current = Number(locked.rows[0][`${params.bucket}_coins` as keyof WalletRow]);
  const next = current + params.delta;
  if (next < 0) {
    throw new AppError("insufficient_balance", "Not enough coins", 400);
  }
  await client.query(
    `UPDATE wallet_balances SET ${column} = $2, updated_at = NOW() WHERE user_id = $1`,
    [params.userId, next],
  );
  await client.query(
    `INSERT INTO wallet_ledger (user_id, bucket, delta, balance_after, reason, idempotency_key, ref_type, ref_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      params.userId,
      params.bucket,
      params.delta,
      next,
      params.reason,
      params.idempotencyKey,
      params.refType ?? null,
      params.refId ?? null,
    ],
  );
  return { balanceAfter: next };
}

export function balancesFromRow(row: WalletRow): WalletBalance {
  return {
    paidCoins: Number(row.paid_coins),
    promoCoins: Number(row.promo_coins),
    starterCoins: Number(row.starter_coins),
    testCoins: Number(row.test_coins),
  };
}

/** Coin balances for a user, 404-ing when the wallet row is missing. */
export async function readWalletBalances(userId: string): Promise<WalletBalance> {
  const { rows } = await getPool().query<WalletRow>(
    `SELECT paid_coins, promo_coins, starter_coins, test_coins FROM wallet_balances WHERE user_id = $1`,
    [userId],
  );
  if (!rows[0]) throw new AppError("not_found", "Wallet not found", 404);
  return balancesFromRow(rows[0]);
}
