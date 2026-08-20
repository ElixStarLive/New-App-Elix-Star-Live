import type { PoolClient } from "pg";
import { getPool, withTransaction } from "../../infra/postgres.js";
import { AppError } from "../../middleware/errors.js";
import { iapVerifyBodySchema } from "../../../shared/contracts/money.js";
import { applyWalletDelta } from "../wallet/ledger.js";
import { verifyAppleReceipt, verifyGooglePurchase } from "../../infra/iapVerify.js";
import { insertPaidCoinLot } from "./reverse.js";

export async function creditVerifiedIap(userId: string, rawBody: unknown): Promise<number> {
  const body = iapVerifyBodySchema.parse(rawBody);
  const pkg = await getPool().query<{ coins: number }>(
    `SELECT coins FROM coin_packages WHERE provider = $1 AND product_id = $2 AND active = TRUE`,
    [body.provider, body.productId],
  );
  if (!pkg.rows[0]) throw new AppError("validation_error", "Unknown product", 400);
  const verified =
    body.provider === "apple"
      ? await verifyAppleReceipt(body.receipt, body.productId, pkg.rows[0].coins)
      : await verifyGooglePurchase(body.receipt, body.productId, pkg.rows[0].coins);
  if (verified.productId !== body.productId || verified.coins !== pkg.rows[0].coins) {
    throw new AppError("validation_error", "Product mismatch", 400);
  }
  return withTransaction(async (client: PoolClient) => {
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO processed_purchases (user_id, provider, product_id, provider_txn_id, coins, status, raw_payload)
       VALUES ($1, $2, $3, $4, $5, 'credited', $6::jsonb)
       ON CONFLICT (provider, provider_txn_id) DO NOTHING
       RETURNING id`,
      [
        userId,
        body.provider,
        verified.productId,
        verified.providerTxnId,
        verified.coins,
        JSON.stringify({
          purchaseToken: body.provider === "google" ? body.receipt : null,
          receipt: body.provider === "google" ? body.receipt : null,
        }),
      ],
    );
    if (!inserted.rows[0]) {
      throw new AppError("duplicate", "Purchase already processed", 409);
    }
    await applyWalletDelta(client, {
      userId,
      bucket: "paid",
      delta: verified.coins,
      reason: "iap_credit",
      idempotencyKey: inserted.rows[0].id,
      refType: "purchase",
      refId: inserted.rows[0].id,
    });
    const price = await client.query<{ price_pence: number }>(
      `SELECT price_pence FROM coin_packages WHERE provider = $1 AND product_id = $2`,
      [body.provider, verified.productId],
    );
    await insertPaidCoinLot(client, {
      userId,
      provider: body.provider,
      providerTxnId: verified.providerTxnId,
      productId: verified.productId,
      coins: verified.coins,
      grossPence: Number(price.rows[0]?.price_pence ?? 0),
    });
    return verified.coins;
  });
}
