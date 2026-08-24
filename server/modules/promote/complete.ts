import type { PoolClient } from "pg";
import { getPool, withTransaction } from "../../infra/postgres.js";
import { AppError } from "../../middleware/errors.js";
import { env } from "../../infra/env.js";
import { requireValkey } from "../../infra/valkey.js";
import { verifyAppleReceipt, verifyGooglePurchase } from "../../infra/iapVerify.js";
import { promoteCompleteBodySchema } from "../../../shared/contracts/promote.js";
import { lookupPromoteProduct } from "./catalog.js";

const PROMOTE_LIMIT = 10;
const PROMOTE_WINDOW_SEC = 60 * 60;

export type PromoteCompleteResult = {
  success: true;
  ok: true;
  deduplicated: boolean;
};

async function assertPromoteVelocity(userId: string): Promise<void> {
  if (!env().valkeyUrl) {
    if (env().isProduction) {
      throw new AppError("unavailable", "Rate limiter requires Valkey", 503);
    }
    return;
  }
  const key = `iap:promote:${userId}`;
  const count = await requireValkey().incr(key);
  if (count === 1) await requireValkey().expire(key, PROMOTE_WINDOW_SEC);
  if (count > PROMOTE_LIMIT) {
    throw new AppError("rate_limited", "Too many promote attempts", 429);
  }
}

export async function completePromotePurchase(
  userId: string,
  rawBody: unknown,
): Promise<PromoteCompleteResult> {
  await assertPromoteVelocity(userId);
  const body = promoteCompleteBodySchema.parse(rawBody);
  const sku = lookupPromoteProduct(body.productId);
  if (!sku) throw new AppError("validation_error", "Invalid promote product", 400);
  if (body.provider === "google" && !body.receipt.trim()) {
    throw new AppError("validation_error", "Google purchase token is required", 400);
  }

  const coinSku = await getPool().query(
    `SELECT 1 FROM coin_packages WHERE provider = $1 AND product_id = $2`,
    [body.provider, sku.productId],
  );
  if (coinSku.rows[0]) {
    throw new AppError("validation_error", "Coin products cannot be used for promote", 400);
  }
  const membershipSku = await getPool().query(
    `SELECT 1 FROM membership_products WHERE provider = $1 AND product_id = $2`,
    [body.provider, sku.productId],
  );
  if (membershipSku.rows[0]) {
    throw new AppError("validation_error", "Membership products cannot be used for promote", 400);
  }

  const verified =
    body.provider === "apple"
      ? await verifyAppleReceipt(body.receipt, sku.productId, 0)
      : await verifyGooglePurchase(body.receipt, sku.productId, 0);

  return withTransaction(async (client: PoolClient) => {
    const coinReplay = await client.query(
      `SELECT 1 FROM processed_purchases WHERE provider = $1 AND provider_txn_id = $2`,
      [body.provider, verified.providerTxnId],
    );
    if (coinReplay.rows[0]) {
      throw new AppError("validation_error", "This transaction was already used for coins", 400);
    }

    const existing = await client.query<{ user_id: string }>(
      `SELECT user_id FROM promote_purchases WHERE provider = $1 AND provider_txn_id = $2 FOR UPDATE`,
      [body.provider, verified.providerTxnId],
    );
    if (existing.rows[0]) {
      if (existing.rows[0].user_id !== userId) {
        throw new AppError("forbidden", "Transaction belongs to another account", 403);
      }
      return { success: true as const, ok: true as const, deduplicated: true };
    }

    let inserted: { id: string } | undefined;
    try {
      const wrote = await client.query<{ id: string }>(
        `INSERT INTO promote_purchases
           (user_id, provider, product_id, provider_txn_id, content_type, content_id, goal, amount_pence)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [
          userId,
          body.provider,
          sku.productId,
          verified.providerTxnId,
          body.contentType,
          body.contentId?.trim() ?? "",
          sku.goal,
          sku.amountPence,
        ],
      );
      inserted = wrote.rows[0];
    } catch (err) {
      const code = err && typeof err === "object" && "code" in err ? String((err as { code: string }).code) : "";
      if (code !== "23505") throw err;
      const raced = await client.query<{ user_id: string }>(
        `SELECT user_id FROM promote_purchases WHERE provider = $1 AND provider_txn_id = $2`,
        [body.provider, verified.providerTxnId],
      );
      if (raced.rows[0]?.user_id && raced.rows[0].user_id !== userId) {
        throw new AppError("forbidden", "Transaction belongs to another account", 403);
      }
      return { success: true as const, ok: true as const, deduplicated: true };
    }
    if (!inserted) throw new AppError("unavailable", "Promote purchase could not be recorded", 503);

    await client.query(
      `INSERT INTO financial_ledger (account, amount_pence, reason, idempotency_key, ref_type, ref_id)
       VALUES ('platform', $1, 'promote_iap', $2, 'promote', $3)`,
      [sku.amountPence, `promote:${inserted.id}`, inserted.id],
    );
    await client.query(
      `UPDATE platform_wallet_gbp SET available_pence = available_pence + $1 WHERE id = 1`,
      [sku.amountPence],
    );
    return { success: true as const, ok: true as const, deduplicated: false };
  });
}
