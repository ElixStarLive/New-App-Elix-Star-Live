import { getPool, withTransaction } from "../../infra/postgres.js";
import { isLiveNeonSchema, publicTableExists } from "../../infra/liveSchema.js";
import { AppError } from "../../middleware/errors.js";
import { isSchemaUnavailable } from "../engagement/settings.js";
import { isUniqueViolation, parseCreatorWithdrawBody, penceFromDb } from "./moneyParse.js";
import { parsePayoutMethodBody, serializePayoutMethod, type PayoutMethodRow } from "./methods.js";

export type CreatorBalancePayload = {
  pending_coins: number;
  available_coins: number;
  locked_coins: number;
  total_earned: number;
  total_withdrawn: number;
  gbp: {
    pending_pence: number;
    available_pence: number;
    withdrawn_pence: number;
    reversed_pence: number;
    held_pence: number;
  };
  rewards: {
    qualified_views_30d: number;
    current_reward_pence: number;
    next_milestone_views: number | null;
    next_milestone_reward_pence: number | null;
  };
  earnings_by_source: {
    gifts_pence: number;
    subscriptions_pence: number;
    rewards_pence: number;
    reversals_pence: number;
  };
  active_subscribers: number;
};

const ZERO_BALANCE: CreatorBalancePayload = {
  pending_coins: 0,
  available_coins: 0,
  locked_coins: 0,
  total_earned: 0,
  total_withdrawn: 0,
  gbp: {
    pending_pence: 0,
    available_pence: 0,
    withdrawn_pence: 0,
    reversed_pence: 0,
    held_pence: 0,
  },
  rewards: {
    qualified_views_30d: 0,
    current_reward_pence: 0,
    next_milestone_views: null,
    next_milestone_reward_pence: null,
  },
  earnings_by_source: {
    gifts_pence: 0,
    subscriptions_pence: 0,
    rewards_pence: 0,
    reversals_pence: 0,
  },
  active_subscribers: 0,
};

function creatorAccount(userId: string): string {
  return `creator:${userId}`;
}

function mapPayoutDbError(error: unknown): never {
  if (error instanceof AppError) throw error;
  if (isSchemaUnavailable(error)) {
    throw new AppError("SCHEMA_UNAVAILABLE", "SCHEMA_UNAVAILABLE", 503);
  }
  throw new AppError("DATABASE_UNAVAILABLE", "DATABASE_UNAVAILABLE", 503);
}

/** Live Neon lacks NEW payout tables → fail closed (never fake £0 success). */
async function assertNewPayoutTables(): Promise<void> {
  if (!(await isLiveNeonSchema())) return;
  const [wallet, methods, withdrawals] = await Promise.all([
    publicTableExists("creator_wallet_gbp"),
    publicTableExists("payout_methods"),
    publicTableExists("withdrawals_gbp"),
  ]);
  if (!wallet || !methods || !withdrawals) {
    throw new AppError("SCHEMA_UNAVAILABLE", "SCHEMA_UNAVAILABLE", 503);
  }
}

export async function getCreatorBalance(userId: string): Promise<CreatorBalancePayload> {
  try {
    await assertNewPayoutTables();
    const pool = getPool();
    const account = creatorAccount(userId);
    const [wallet, ledgerTotals, creatorTotals] = await Promise.all([
      pool.query<{
        pending_pence: string;
        available_pence: string;
        withdrawn_pence: string;
        held_pence: string;
      }>(
        `SELECT pending_pence, available_pence, withdrawn_pence, held_pence
         FROM creator_wallet_gbp WHERE user_id = $1`,
        [userId],
      ),
      pool.query<{
        gifts_pence: string;
        subscriptions_pence: string;
        rewards_pence: string;
      }>(
        `SELECT
           COALESCE(SUM(amount_pence) FILTER (WHERE reason IN ('gift_creator_pending', 'gift_creator')), 0)::text AS gifts_pence,
           COALESCE(SUM(amount_pence) FILTER (WHERE reason LIKE 'subscription%'), 0)::text AS subscriptions_pence,
           COALESCE(SUM(amount_pence) FILTER (WHERE reason LIKE 'reward%'), 0)::text AS rewards_pence
         FROM financial_ledger
         WHERE account = $1`,
        [account],
      ),
      pool.query<{
        reversed_pence: string;
        active_subscribers: string;
      }>(
        `SELECT
           COALESCE((
             SELECT SUM(amount_pence)
             FROM creator_earnings
             WHERE creator_id = $1 AND status = 'reversed'
           ), 0)::text AS reversed_pence,
           COALESCE((
             SELECT COUNT(*)
             FROM memberships
             WHERE creator_id = $1 AND status = 'active'
               AND (expires_at IS NULL OR expires_at > NOW())
           ), 0)::text AS active_subscribers`,
        [userId],
      ),
    ]);

    const giftsPence = penceFromDb(ledgerTotals.rows[0]?.gifts_pence ?? "0");
    const subscriptionsPence = penceFromDb(ledgerTotals.rows[0]?.subscriptions_pence ?? "0");
    const rewardsPence = penceFromDb(ledgerTotals.rows[0]?.rewards_pence ?? "0");
    const reversedPence = penceFromDb(creatorTotals.rows[0]?.reversed_pence ?? "0");
    const activeSubscribers = penceFromDb(creatorTotals.rows[0]?.active_subscribers ?? "0");
    const row = wallet.rows[0];
    if (!row) {
      return {
        ...ZERO_BALANCE,
        earnings_by_source: {
          gifts_pence: giftsPence,
          subscriptions_pence: subscriptionsPence,
          rewards_pence: rewardsPence,
          reversals_pence: reversedPence,
        },
        active_subscribers: activeSubscribers,
        total_earned: giftsPence + subscriptionsPence + rewardsPence,
      };
    }

    const pending = penceFromDb(row.pending_pence);
    const available = penceFromDb(row.available_pence);
    const withdrawn = penceFromDb(row.withdrawn_pence);
    const held = penceFromDb(row.held_pence);
    return {
      pending_coins: 0,
      available_coins: 0,
      locked_coins: 0,
      total_earned: giftsPence + subscriptionsPence + rewardsPence,
      total_withdrawn: withdrawn,
      gbp: {
        pending_pence: pending,
        available_pence: available,
        withdrawn_pence: withdrawn,
        reversed_pence: reversedPence,
        held_pence: held,
      },
      rewards: {
        qualified_views_30d: 0,
        current_reward_pence: 0,
        next_milestone_views: null,
        next_milestone_reward_pence: null,
      },
      earnings_by_source: {
        gifts_pence: giftsPence,
        subscriptions_pence: subscriptionsPence,
        rewards_pence: rewardsPence,
        reversals_pence: reversedPence,
      },
      active_subscribers: activeSubscribers,
    };
  } catch (error) {
    mapPayoutDbError(error);
  }
}

export async function listCreatorLedger(userId: string) {
  try {
    await assertNewPayoutTables();
    const { rows } = await getPool().query<{
      id: string;
      reason: string;
      amount_pence: string;
      created_at: Date;
    }>(
      `SELECT id::text AS id, reason, amount_pence::text AS amount_pence, created_at
       FROM financial_ledger
       WHERE account = $1
       ORDER BY created_at DESC, id DESC
       LIMIT 100`,
      [creatorAccount(userId)],
    );
    return {
      ledger: rows.map((row) => ({
        id: row.id,
        revenue_source: row.reason,
        creator_amount_pence: penceFromDb(row.amount_pence),
        status: "posted",
        created_at: row.created_at.toISOString(),
      })),
    };
  } catch (error) {
    mapPayoutDbError(error);
  }
}

export async function listCreatorWithdrawals(userId: string) {
  try {
    await assertNewPayoutTables();
    const { rows } = await getPool().query<{
      id: string;
      amount_pence: string;
      status: string;
      created_at: Date;
      provider_ref: string | null;
    }>(
      `SELECT id::text AS id, amount_pence::text AS amount_pence, status, created_at, provider_ref
       FROM withdrawals_gbp
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [userId],
    );
    return {
      withdrawals: rows.map((row) => ({
        id: row.id,
        amount_pence: penceFromDb(row.amount_pence),
        status: row.status,
        created_at: row.created_at.toISOString(),
        payout_provider_ref: row.provider_ref,
      })),
    };
  } catch (error) {
    mapPayoutDbError(error);
  }
}

export async function listPayoutMethods(userId: string) {
  try {
    await assertNewPayoutTables();
    const { rows } = await getPool().query<PayoutMethodRow>(
      `SELECT id::text AS id, type, details, is_default
       FROM payout_methods
       WHERE user_id = $1
       ORDER BY is_default DESC, created_at DESC`,
      [userId],
    );
    return { methods: rows.map(serializePayoutMethod) };
  } catch (error) {
    mapPayoutDbError(error);
  }
}

export async function savePayoutMethod(userId: string, body: unknown) {
  await assertNewPayoutTables();
  const parsed = parsePayoutMethodBody(body);
  try {
    await withTransaction(async (client) => {
      await client.query(`UPDATE payout_methods SET is_default = FALSE WHERE user_id = $1`, [userId]);
      await client.query(
        `INSERT INTO payout_methods (user_id, type, details, is_default)
         VALUES ($1, $2, $3::jsonb, TRUE)`,
        [userId, parsed.type, JSON.stringify(parsed.details)],
      );
    });
  } catch (error) {
    mapPayoutDbError(error);
  }
  return { ok: true as const };
}

type ExistingWithdrawal = {
  id: string;
  user_id: string;
  amount_pence: string;
  status: string;
};

async function existingWithdrawalByKey(
  client: { query: (sql: string, params: unknown[]) => Promise<{ rows: ExistingWithdrawal[] }> },
  idempotencyKey: string,
): Promise<ExistingWithdrawal | null> {
  const found = await client.query(
    `SELECT id::text AS id, user_id::text AS user_id, amount_pence::text AS amount_pence, status
     FROM withdrawals_gbp WHERE idempotency_key = $1`,
    [idempotencyKey],
  );
  return found.rows[0] ?? null;
}

function replayOrConflict(userId: string, amountPence: number, existing: ExistingWithdrawal) {
  if (existing.user_id !== userId || penceFromDb(existing.amount_pence) !== amountPence) {
    throw new AppError("idempotency_key_conflict", "Idempotency key already used", 409);
  }
  return {
    ok: true as const,
    id: existing.id,
    status: existing.status,
    already_exists: true,
  };
}

export async function requestCreatorWithdrawal(userId: string, body: unknown) {
  const { amountPence, idempotencyKey } = parseCreatorWithdrawBody(body);
  await assertNewPayoutTables();

  try {
    return await withTransaction(async (client) => {
      const methods = await client.query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM payout_methods WHERE user_id = $1`,
        [userId],
      );
      if (penceFromDb(methods.rows[0]?.n ?? "0") < 1) {
        throw new AppError("no_payout_method", "Add a payout method first", 400);
      }

      const wallet = await client.query<{ available_pence: string }>(
        `SELECT available_pence FROM creator_wallet_gbp WHERE user_id = $1 FOR UPDATE`,
        [userId],
      );
      const existing = await existingWithdrawalByKey(client, idempotencyKey);
      if (existing) return replayOrConflict(userId, amountPence, existing);

      const available = wallet.rows[0] ? penceFromDb(wallet.rows[0].available_pence) : 0;
      if (available < amountPence) {
        throw new AppError("insufficient_available", "Not enough available balance", 400);
      }

      const reserved = await client.query(
        `UPDATE creator_wallet_gbp
         SET available_pence = available_pence - $2,
             held_pence = held_pence + $2,
             updated_at = NOW()
         WHERE user_id = $1 AND available_pence >= $2`,
        [userId, amountPence],
      );
      if (!reserved.rowCount) {
        throw new AppError("insufficient_available", "Not enough available balance", 400);
      }

      const inserted = await client.query<{ id: string; status: string }>(
        `INSERT INTO withdrawals_gbp (user_id, amount_pence, status, idempotency_key)
         VALUES ($1, $2, 'pending', $3)
         RETURNING id::text AS id, status`,
        [userId, amountPence, idempotencyKey],
      );
      await client.query(
        `INSERT INTO financial_ledger (account, amount_pence, reason, idempotency_key, ref_type, ref_id)
         VALUES ($1, $2, 'withdrawal_hold', $3, 'withdrawal', $4)`,
        [creatorAccount(userId), amountPence, `withdrawal_hold:${idempotencyKey}`, inserted.rows[0].id],
      );
      return {
        ok: true as const,
        id: inserted.rows[0].id,
        status: inserted.rows[0].status,
        already_exists: false,
      };
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (!isUniqueViolation(error)) mapPayoutDbError(error);
    const replay = await existingWithdrawalByKey(getPool(), idempotencyKey);
    if (!replay) mapPayoutDbError(error);
    return replayOrConflict(userId, amountPence, replay);
  }
}

export async function rejectHeldWithdrawal(withdrawalId: string, creatorId: string) {
  return withTransaction(async (client) => {
    const row = await client.query<{
      id: string;
      user_id: string;
      amount_pence: string;
      status: string;
    }>(
      `SELECT id::text AS id, user_id::text AS user_id, amount_pence::text AS amount_pence, status
       FROM withdrawals_gbp WHERE id = $1 FOR UPDATE`,
      [withdrawalId],
    );
    const existing = row.rows[0];
    if (!existing || existing.user_id !== creatorId) {
      throw new AppError("not_found", "Withdrawal not found", 404);
    }
    if (existing.status !== "pending") {
      throw new AppError("validation_error", "Withdrawal cannot be rejected", 400);
    }
    const amount = penceFromDb(existing.amount_pence);
    const restored = await client.query(
      `UPDATE creator_wallet_gbp
       SET held_pence = GREATEST(held_pence - $2, 0),
           available_pence = available_pence + $2,
           updated_at = NOW()
       WHERE user_id = $1 AND held_pence >= $2`,
      [creatorId, amount],
    );
    if (!restored.rowCount) {
      throw new AppError("unavailable", "Held balance could not be restored", 503);
    }
    await client.query(
      `UPDATE withdrawals_gbp SET status = 'rejected', updated_at = NOW() WHERE id = $1`,
      [withdrawalId],
    );
    await client.query(
      `INSERT INTO financial_ledger (account, amount_pence, reason, idempotency_key, ref_type, ref_id)
       VALUES ($1, $2, 'withdrawal_reject_restore', $3, 'withdrawal', $4)`,
      [creatorAccount(creatorId), amount, `withdrawal_reject:${withdrawalId}`, withdrawalId],
    );
    return { ok: true as const, status: "rejected" as const };
  });
}
