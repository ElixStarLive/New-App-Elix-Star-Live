import type { PoolClient } from "pg";
import type { CoinBucket } from "../../../shared/contracts/money.js";
import { AppError } from "../../middleware/errors.js";

export type WalletRow = {
  paid_coins: string;
  promo_coins: string;
  starter_coins: string;
};

const COLUMN: Record<"paid" | "promo" | "starter", string> = {
  paid: "paid_coins",
  promo: "promo_coins",
  starter: "starter_coins",
};

export function parseCoinCount(value: unknown): number | null {
  if (typeof value === "bigint") {
    if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) return null;
    return Number(value);
  }
  if (typeof value === "number") {
    if (!Number.isInteger(value) || value < 0 || !Number.isSafeInteger(value)) return null;
    return value;
  }
  if (typeof value === "string" && /^(0|[1-9]\d*)$/.test(value.trim())) {
    const n = Number(value.trim());
    return Number.isSafeInteger(n) ? n : null;
  }
  return null;
}

export function balancesFromRow(row: WalletRow): {
  paidCoins: number;
  promoCoins: number;
  starterCoins: number;
} {
  const paidCoins = parseCoinCount(row.paid_coins);
  const promoCoins = parseCoinCount(row.promo_coins);
  const starterCoins = parseCoinCount(row.starter_coins);
  if (paidCoins == null || promoCoins == null || starterCoins == null) {
    throw new AppError("unavailable", "Wallet balances are unreadable", 503);
  }
  return { paidCoins, promoCoins, starterCoins };
}

export function walletApiFromRow(row: WalletRow, userId: string) {
  const balances = balancesFromRow(row);
  return {
    user_id: userId,
    coin_balance: balances.paidCoins,
    starter_balance: balances.starterCoins,
    promotional_balance: balances.promoCoins,
  };
}

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
  if (params.bucket === "test") {
    throw new AppError("validation_error", "Test coins are not wallet money", 400);
  }
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
    `SELECT paid_coins, promo_coins, starter_coins
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
