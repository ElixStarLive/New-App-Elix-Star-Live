import type { PoolClient } from "pg";
import { withTransaction } from "../../infra/postgres.js";
import { AppError } from "../../middleware/errors.js";
import { applyWalletDelta } from "../wallet/ledger.js";

export async function insertPaidCoinLot(
  client: PoolClient,
  params: {
    userId: string;
    provider: string;
    providerTxnId: string;
    productId: string;
    coins: number;
    grossPence: number;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO paid_coin_lots (
       user_id, provider, provider_txn_id, product_id, coins_original, coins_remaining, gross_pence, settlement_status
     ) VALUES ($1, $2, $3, $4, $5, $5, $6, 'settled')
     ON CONFLICT (provider, provider_txn_id) DO NOTHING`,
    [
      params.userId,
      params.provider,
      params.providerTxnId,
      params.productId,
      params.coins,
      params.grossPence,
    ],
  );
}

export async function reverseIapPurchase(
  provider: string,
  providerTxnId: string,
): Promise<{ reversed: boolean; duplicate: boolean }> {
  return withTransaction(async (client) => {
    const purchase = await client.query<{
      id: string;
      user_id: string;
      coins: number;
      status: string;
      product_id: string;
      provider_txn_id: string;
    }>(
      `SELECT id, user_id, coins, status, product_id, provider_txn_id
       FROM processed_purchases
       WHERE provider = $1 AND (
         provider_txn_id = $2
         OR COALESCE(raw_payload->>'purchaseToken', '') = $2
         OR COALESCE(raw_payload->>'receipt', '') = $2
       )
       FOR UPDATE`,
      [provider, providerTxnId],
    );
    const row = purchase.rows[0];
    if (!row) {
      throw new AppError("not_found", "Purchase not found for refund", 404);
    }
    if (row.status === "reversed") {
      return { reversed: true, duplicate: true };
    }

    const lots = await client.query<{ id: string; coins_remaining: string }>(
      `SELECT id, coins_remaining
       FROM paid_coin_lots
       WHERE provider = $1 AND provider_txn_id = $2
       FOR UPDATE`,
      [provider, row.provider_txn_id],
    );
    let unusedCoins = 0;
    for (const lot of lots.rows) {
      unusedCoins += Number(lot.coins_remaining);
      await client.query(
        `UPDATE paid_coin_lots SET coins_remaining = 0, settlement_status = 'reversed' WHERE id = $1`,
        [lot.id],
      );
    }

    if (unusedCoins > 0) {
      const remaining = await client.query<{ n: string }>(
            `SELECT COALESCE(paid_coins, 0)::text AS n FROM wallet_balances WHERE user_id = $1 FOR UPDATE`,
            [row.user_id],
          );
      const debit = Math.min(Number(remaining.rows[0]?.n ?? 0), unusedCoins);
      if (debit > 0) {
        await applyWalletDelta(client, {
          userId: row.user_id,
          bucket: "paid",
          delta: -debit,
          reason: "iap_refund",
          idempotencyKey: `iap_refund:${provider}:${row.id}`,
          refType: "purchase",
          refId: row.id,
        });
      }
    }

    const earnings = await client.query<{
        id: string;
        creator_id: string;
        amount_pence: string;
        status: string;
      }>(
        `SELECT e.id, e.creator_id, e.amount_pence, e.status
         FROM creator_earnings e
         JOIN gift_transactions g ON g.id = e.gift_txn_id
         WHERE g.sender_id = $1
           AND e.status IN ('pending', 'available')
           AND e.created_at >= (SELECT created_at FROM processed_purchases WHERE id = $2)
         FOR UPDATE`,
        [row.user_id, row.id],
      );
      for (const earning of earnings.rows) {
        const amount = Number(earning.amount_pence);
        if (earning.status === "pending") {
          await client.query(
            `UPDATE creator_wallet_gbp
             SET pending_pence = GREATEST(pending_pence - $2, 0), updated_at = NOW()
             WHERE user_id = $1`,
            [earning.creator_id, amount],
          );
        } else {
          await client.query(
            `UPDATE creator_wallet_gbp
             SET available_pence = GREATEST(available_pence - $2, 0), updated_at = NOW()
             WHERE user_id = $1`,
            [earning.creator_id, amount],
          );
        }
        await client.query(`UPDATE creator_earnings SET status = 'reversed' WHERE id = $1`, [earning.id]);
      }

      const membershipSku = await client.query(
        `SELECT 1 FROM membership_products WHERE provider = $1 AND product_id = $2`,
        [provider, row.product_id],
      );
      if (membershipSku.rows[0]) {
        await client.query(
          `UPDATE memberships SET status = 'expired', expires_at = NOW()
           WHERE subscriber_id = $1 AND provider = $2 AND product_id = $3 AND status = 'active'`,
          [row.user_id, provider, row.product_id],
        );
      }

    await client.query(`UPDATE processed_purchases SET status = 'reversed' WHERE id = $1`, [row.id]);
    await client.query(
        `INSERT INTO financial_ledger (account, amount_pence, reason, idempotency_key, ref_type, ref_id)
         VALUES ('platform', 0, 'iap_refund', $1, 'purchase', $2)
         ON CONFLICT (idempotency_key) DO NOTHING`,
        [`iap_refund_ledger:${row.id}`, row.id],
      );
    return { reversed: true, duplicate: false };
  });
}
