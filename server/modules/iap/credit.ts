import type { PoolClient } from "pg";
import { getPool, withTransaction } from "../../infra/postgres.js";
import { isLiveNeonSchema } from "../../infra/liveSchema.js";
import { AppError } from "../../middleware/errors.js";
import { iapVerifyBodySchema } from "../../../shared/contracts/money.js";
import { applyWalletDelta, balancesFromRow, type WalletRow } from "../wallet/ledger.js";
import { verifyAppleReceipt, verifyGooglePurchase } from "../../infra/iapVerify.js";
import { insertPaidCoinLot } from "./reverse.js";
import { assertIapVerifyVelocity } from "./velocity.js";
import { canonicalIapProductId, decideIapReplay } from "./replay.js";

export type IapCreditResult = {
  coins: number;
  paidCoins: number;
  promoCoins: number;
  starterCoins: number;
  deduplicated: boolean;
};

async function readWallet(client: PoolClient, userId: string, live: boolean) {
  if (live) {
    const { rows } = await client.query<WalletRow>(
      `SELECT
         COALESCE((SELECT coin_balance FROM elix_wallet_balances WHERE user_id = $1), 0)::text AS paid_coins,
         COALESCE((SELECT balance FROM promotional_coin_balances WHERE user_id = $1), 0)::text AS promo_coins,
         COALESCE((SELECT balance FROM starter_coin_balances WHERE user_id = $1), 0)::text AS starter_coins`,
      [userId],
    );
    return balancesFromRow(rows[0] ?? { paid_coins: "0", promo_coins: "0", starter_coins: "0" });
  }
  const { rows } = await client.query<WalletRow>(
    `SELECT paid_coins, promo_coins, starter_coins FROM wallet_balances WHERE user_id = $1`,
    [userId],
  );
  if (!rows[0]) throw new AppError("not_found", "Wallet not found", 404);
  return balancesFromRow(rows[0]);
}

async function creditLivePaidBalance(
  client: PoolClient,
  params: { userId: string; coins: number },
): Promise<void> {
  const credited = await client.query<{ coin_balance: string }>(
    `INSERT INTO elix_wallet_balances (user_id, coin_balance, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (user_id) DO UPDATE
       SET coin_balance = elix_wallet_balances.coin_balance + EXCLUDED.coin_balance,
           updated_at = NOW()
     RETURNING coin_balance`,
    [params.userId, params.coins],
  );
  if (!credited.rows[0]) throw new AppError("unavailable", "Wallet credit failed", 503);
}

export async function creditVerifiedIap(userId: string, rawBody: unknown): Promise<IapCreditResult> {
  await assertIapVerifyVelocity(userId);
  const body = iapVerifyBodySchema.parse(rawBody);
  if (body.userId && body.userId !== userId) {
    throw new AppError("forbidden", "Transaction belongs to another account", 403);
  }
  const productId = canonicalIapProductId(body);
  if (!productId) throw new AppError("validation_error", "productId is required", 400);

  const live = await isLiveNeonSchema();
  const pkg = live
    ? await getPool().query<{ coins: number; price_pence: number }>(
        `SELECT coins, COALESCE(price_pence, 0)::int AS price_pence
           FROM elix_coin_packages
          WHERE provider = $1 AND product_id = $2 AND active = TRUE`,
        [body.provider, productId],
      )
    : await getPool().query<{ coins: number; price_pence: number }>(
        `SELECT coins, price_pence FROM coin_packages WHERE provider = $1 AND product_id = $2 AND active = TRUE`,
        [body.provider, productId],
      );
  if (!pkg.rows[0]) throw new AppError("validation_error", "Unknown product", 400);

  const verified =
    body.provider === "apple"
      ? await verifyAppleReceipt(body.receipt, productId, pkg.rows[0].coins)
      : await verifyGooglePurchase(body.receipt, productId, pkg.rows[0].coins);
  if (verified.productId !== productId || verified.coins !== pkg.rows[0].coins) {
    throw new AppError("validation_error", "Product mismatch", 400);
  }

  return withTransaction(async (client: PoolClient) => {
    const purchaseTable = live ? "elix_processed_purchases" : "processed_purchases";
    const existing = await client.query<{ user_id: string; status: string; coins: number }>(
      `SELECT user_id, status, coins
       FROM ${purchaseTable}
       WHERE provider = $1 AND provider_txn_id = $2
       FOR UPDATE`,
      [body.provider, verified.providerTxnId],
    );
    const decision = decideIapReplay(
      existing.rows[0]
        ? { userId: existing.rows[0].user_id, status: existing.rows[0].status, coins: existing.rows[0].coins }
        : null,
      userId,
    );
    if (decision.action === "forbidden") {
      throw new AppError("forbidden", "Transaction belongs to another account", 403);
    }
    if (decision.action === "conflict") {
      throw new AppError("duplicate", "Purchase already processed", 409);
    }
    if (decision.action === "idempotent") {
      const wallet = await readWallet(client, userId, live);
      return { coins: decision.coins, deduplicated: true, ...wallet };
    }

    let inserted: { id: string } | undefined;
    try {
      const wrote = await client.query<{ id: string }>(
        `INSERT INTO ${purchaseTable} (user_id, provider, product_id, provider_txn_id, coins, status, raw_payload)
         VALUES ($1, $2, $3, $4, $5, 'credited', $6::jsonb)
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
      inserted = wrote.rows[0];
    } catch (err) {
      const code = err && typeof err === "object" && "code" in err ? String((err as { code: string }).code) : "";
      if (code !== "23505") throw err;
      const raced = await client.query<{ user_id: string; status: string; coins: number }>(
        `SELECT user_id, status, coins FROM ${purchaseTable} WHERE provider = $1 AND provider_txn_id = $2`,
        [body.provider, verified.providerTxnId],
      );
      const racedDecision = decideIapReplay(
        raced.rows[0]
          ? { userId: raced.rows[0].user_id, status: raced.rows[0].status, coins: raced.rows[0].coins }
          : null,
        userId,
      );
      if (racedDecision.action === "forbidden") {
        throw new AppError("forbidden", "Transaction belongs to another account", 403);
      }
      if (racedDecision.action === "idempotent") {
        const wallet = await readWallet(client, userId, live);
        return { coins: racedDecision.coins, deduplicated: true, ...wallet };
      }
      throw new AppError("duplicate", "Purchase already processed", 409);
    }
    if (!inserted) throw new AppError("unavailable", "Purchase could not be recorded", 503);

    if (live) {
      await creditLivePaidBalance(client, {
        userId,
        coins: verified.coins,
      });
      await client.query(
        `INSERT INTO elix_paid_coin_lots (
           user_id, provider, provider_txn_id, product_id, coins_original, coins_remaining, gross_pence, settlement_status
         ) VALUES ($1, $2, $3, $4, $5, $5, $6, 'settled')
         ON CONFLICT (provider, provider_txn_id) DO NOTHING`,
        [
          userId,
          body.provider,
          verified.providerTxnId,
          verified.productId,
          verified.coins,
          Number(pkg.rows[0]!.price_pence ?? 0),
        ],
      );
    } else {
      await applyWalletDelta(client, {
        userId,
        bucket: "paid",
        delta: verified.coins,
        reason: "iap_credit",
        idempotencyKey: inserted.id,
        refType: "purchase",
        refId: inserted.id,
      });
      await insertPaidCoinLot(client, {
        userId,
        provider: body.provider,
        providerTxnId: verified.providerTxnId,
        productId: verified.productId,
        coins: verified.coins,
        grossPence: Number(pkg.rows[0]!.price_pence ?? 0),
      });
    }
    const wallet = await readWallet(client, userId, live);
    return { coins: verified.coins, deduplicated: false, ...wallet };
  });
}
