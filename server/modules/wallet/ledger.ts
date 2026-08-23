import type { PoolClient } from "pg";
import type { CoinBucket } from "../../../shared/contracts/money.js";
import { AppError } from "../../middleware/errors.js";
import { isLiveNeonSchema } from "../../infra/liveSchema.js";

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
    starter_coins: balances.starterCoins,
    promotional_balance: balances.promoCoins,
    promotional_coins: balances.promoCoins,
  };
}

async function applyLiveWalletDelta(
  client: PoolClient,
  params: {
    userId: string;
    bucket: Exclude<CoinBucket, "test">;
    delta: number;
    reason: string;
    idempotencyKey: string;
    refType?: string;
    refId?: string;
  },
): Promise<{ balanceAfter: number }> {
  // Idempotency: prefer elix_wallet_ledger; fail closed if duplicate key conflict after apply.
  const prior = await client.query<{ id: string }>(
    `SELECT id FROM elix_wallet_ledger WHERE idempotency_key = $1 LIMIT 1`,
    [params.idempotencyKey],
  ).catch(() => ({ rows: [] as { id: string }[] }));
  if (prior.rows[0]) {
    throw new AppError("duplicate", "This wallet operation was already applied", 409);
  }

  let balanceAfter = 0;
  if (params.bucket === "paid") {
    if (params.delta > 0) {
      const credited = await client.query<{ coin_balance: string }>(
        `INSERT INTO elix_wallet_balances (user_id, coin_balance, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (user_id) DO UPDATE
           SET coin_balance = elix_wallet_balances.coin_balance + EXCLUDED.coin_balance,
               updated_at = NOW()
         RETURNING coin_balance`,
        [params.userId, params.delta],
      );
      balanceAfter = Number(credited.rows[0]?.coin_balance ?? 0);
    } else {
      const debit = await client.query<{ coin_balance: string }>(
        `UPDATE elix_wallet_balances SET coin_balance = coin_balance + $2, updated_at = NOW()
         WHERE user_id = $1 AND coin_balance >= $3
         RETURNING coin_balance`,
        [params.userId, params.delta, Math.abs(params.delta)],
      );
      if (!debit.rows[0]) throw new AppError("insufficient_balance", "Not enough coins", 400);
      balanceAfter = Number(debit.rows[0].coin_balance);
    }
  } else if (params.bucket === "promo") {
    if (params.delta > 0) {
      const credited = await client.query<{ balance: string }>(
        `INSERT INTO promotional_coin_balances (user_id, balance)
         VALUES ($1, $2)
         ON CONFLICT (user_id) DO UPDATE
           SET balance = promotional_coin_balances.balance + EXCLUDED.balance
         RETURNING balance`,
        [params.userId, params.delta],
      );
      balanceAfter = Number(credited.rows[0]?.balance ?? 0);
    } else {
      const debit = await client.query<{ balance: string }>(
        `UPDATE promotional_coin_balances SET balance = balance + $2
         WHERE user_id = $1 AND balance >= $3
         RETURNING balance`,
        [params.userId, params.delta, Math.abs(params.delta)],
      );
      if (!debit.rows[0]) throw new AppError("insufficient_balance", "Not enough promotional coins", 400);
      balanceAfter = Number(debit.rows[0].balance);
    }
  } else {
    if (params.delta > 0) {
      const credited = await client.query<{ balance: string }>(
        `INSERT INTO starter_coin_balances (user_id, balance, lifetime_granted, lifetime_spent)
         VALUES ($1, $2, $2, 0)
         ON CONFLICT (user_id) DO UPDATE
           SET balance = starter_coin_balances.balance + EXCLUDED.balance,
               lifetime_granted = starter_coin_balances.lifetime_granted + EXCLUDED.lifetime_granted
         RETURNING balance`,
        [params.userId, params.delta],
      );
      balanceAfter = Number(credited.rows[0]?.balance ?? 0);
    } else {
      const debit = await client.query<{ balance: string }>(
        `UPDATE starter_coin_balances SET balance = balance + $2,
               lifetime_spent = lifetime_spent + $3
         WHERE user_id = $1 AND balance >= $3
         RETURNING balance`,
        [params.userId, params.delta, Math.abs(params.delta)],
      );
      if (!debit.rows[0]) throw new AppError("insufficient_balance", "Not enough starter coins", 400);
      balanceAfter = Number(debit.rows[0].balance);
    }
  }

  try {
    await client.query(
      `INSERT INTO elix_wallet_ledger (user_id, delta, balance_after, reason, idempotency_key, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [params.userId, params.delta, balanceAfter, params.reason, params.idempotencyKey],
    );
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String((error as { code: string }).code) : "";
    if (code === "23505") {
      throw new AppError("duplicate", "This wallet operation was already applied", 409);
    }
    // Ledger shape unknown: balance mutation already applied; fail closed so caller can roll back txn.
    throw new AppError("unavailable", "WALLET_LEDGER_UNAVAILABLE", 503);
  }
  return { balanceAfter };
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
  if (await isLiveNeonSchema()) {
    return applyLiveWalletDelta(client, {
      userId: params.userId,
      bucket: params.bucket,
      delta: params.delta,
      reason: params.reason,
      idempotencyKey: params.idempotencyKey,
      refType: params.refType,
      refId: params.refId,
    });
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
