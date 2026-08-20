import { Router } from "express";
import { getPool, withTransaction } from "../../infra/postgres.js";
import { requireAuth, type AuthedRequest } from "../../middleware/auth.js";
import { AppError } from "../../middleware/errors.js";
import { verifyAppleReceipt, verifyGooglePurchase } from "../../infra/iapVerify.js";
import { iapVerifyBodySchema } from "../../../shared/contracts/money.js";

const router = Router();

router.get("/status", requireAuth, async (req: AuthedRequest, res) => {
  const creatorId = typeof req.query.creatorId === "string" ? req.query.creatorId : "";
  if (!creatorId) throw new AppError("validation_error", "creatorId required", 400);
  const { rows } = await getPool().query<{ status: string; expires_at: Date | null }>(
    `SELECT status, expires_at FROM memberships
     WHERE creator_id = $1 AND subscriber_id = $2
     ORDER BY created_at DESC LIMIT 1`,
    [creatorId, req.userId],
  );
  const row = rows[0];
  const active = Boolean(row && row.status === "active" && (!row.expires_at || row.expires_at > new Date()));
  res.json({ subscribed: active, expiresAt: row?.expires_at?.toISOString() ?? null });
});

router.post("/iap-complete", requireAuth, async (req: AuthedRequest, res) => {
  const creatorId = typeof req.body?.creatorId === "string" ? req.body.creatorId : "";
  if (!creatorId) throw new AppError("validation_error", "creatorId required", 400);
  if (creatorId === req.userId) throw new AppError("validation_error", "Cannot subscribe to yourself", 400);
  const body = iapVerifyBodySchema.parse({
    provider: req.body?.provider,
    productId: req.body?.productId,
    receipt: req.body?.receipt,
  });
  const coinSku = await getPool().query(
    `SELECT 1 FROM coin_packages WHERE provider = $1 AND product_id = $2`,
    [body.provider, body.productId],
  );
  if (coinSku.rows[0]) {
    throw new AppError("validation_error", "Coin products cannot be used for membership", 400);
  }
  const sku = await getPool().query<{ duration_days: number }>(
    `SELECT duration_days FROM membership_products WHERE provider = $1 AND product_id = $2`,
    [body.provider, body.productId],
  );
  if (!sku.rows[0]) throw new AppError("validation_error", "Unknown membership product", 400);
  const verified =
    body.provider === "apple"
      ? await verifyAppleReceipt(body.receipt, body.productId, 0)
      : await verifyGooglePurchase(body.receipt, body.productId, 0);
  await withTransaction(async (client) => {
    const purchase = await client.query<{ id: string }>(
      `INSERT INTO membership_purchases (subscriber_id, creator_id, provider, product_id, provider_txn_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (provider, provider_txn_id) DO NOTHING
       RETURNING id`,
      [req.userId, creatorId, body.provider, verified.productId, verified.providerTxnId],
    );
    if (!purchase.rows[0]) {
      throw new AppError("duplicate", "Membership purchase already processed", 409);
    }
    const coinReplay = await client.query(
      `SELECT 1 FROM processed_purchases WHERE provider = $1 AND provider_txn_id = $2`,
      [body.provider, verified.providerTxnId],
    );
    if (coinReplay.rows[0]) {
      throw new AppError("validation_error", "This transaction was already used for coins", 400);
    }
    await client.query(
      `INSERT INTO memberships (creator_id, subscriber_id, provider, product_id, status, expires_at)
       VALUES ($1, $2, $3, $4, 'active', NOW() + ($5 || ' days')::interval)
       ON CONFLICT (creator_id, subscriber_id)
       DO UPDATE SET status = 'active', provider = EXCLUDED.provider, product_id = EXCLUDED.product_id,
                     expires_at = GREATEST(COALESCE(memberships.expires_at, NOW()), NOW()) + ($5 || ' days')::interval`,
      [creatorId, req.userId, body.provider, verified.productId, String(sku.rows[0].duration_days)],
    );
  });
  res.json({ ok: true });
});

export default router;
