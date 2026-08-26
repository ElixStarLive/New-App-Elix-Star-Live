import type { z } from "zod";
import { withTransaction } from "../../infra/postgres.js";
import { AppError } from "../../middleware/errors.js";
import type { withdrawalBodySchema } from "../../../shared/contracts/money.js";

export type WithdrawalBody = z.infer<typeof withdrawalBodySchema>;

/**
 * Moves pence from a creator's available balance to withdrawn and records the
 * matching financial ledger and withdrawal rows in one transaction.
 */
export async function withdrawCreatorGbp(userId: string, body: WithdrawalBody): Promise<void> {
  await withTransaction(async (client) => {
    const wallet = await client.query<{ available_pence: string }>(
      `SELECT available_pence FROM creator_wallet_gbp WHERE user_id = $1 FOR UPDATE`,
      [userId],
    );
    const available = Number(wallet.rows[0]?.available_pence ?? 0);
    if (available < body.amountPence) {
      throw new AppError("insufficient_balance", "Not enough available balance", 400);
    }
    await client.query(
      `UPDATE creator_wallet_gbp
       SET available_pence = available_pence - $2, withdrawn_pence = withdrawn_pence + $2, updated_at = NOW()
       WHERE user_id = $1`,
      [userId, body.amountPence],
    );
    await client.query(
      `INSERT INTO financial_ledger (account, amount_pence, reason, idempotency_key, ref_type, ref_id)
       VALUES ($1, $2, 'withdrawal', $3, 'withdrawal', $3)`,
      [`creator:${userId}`, -body.amountPence, body.idempotencyKey],
    );
    await client.query(
      `INSERT INTO withdrawals_gbp (user_id, amount_pence, status, idempotency_key)
       VALUES ($1, $2, 'pending', $3)`,
      [userId, body.amountPence, body.idempotencyKey],
    );
  });
}
