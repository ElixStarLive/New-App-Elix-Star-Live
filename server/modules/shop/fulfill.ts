import Stripe from "stripe";
import { getPool } from "../../infra/postgres.js";
import { logger } from "../../infra/logger.js";

export async function fulfillShopCheckoutSession(
  session: Stripe.Checkout.Session,
  stripe: Stripe | null,
): Promise<void> {
  if (session.payment_status && session.payment_status !== "paid") return;
  const metadata = session.metadata ?? {};
  if (metadata.type && metadata.type !== "shop_item") return;
  const idsCsv = metadata.itemIds || metadata.itemId || "";
  const itemIds = Array.from(new Set(idsCsv.split(",").map((part) => part.trim()).filter(Boolean)));
  const buyerId =
    (typeof session.client_reference_id === "string" && session.client_reference_id) ||
    metadata.userId ||
    "";
  if (itemIds.length === 0 || !buyerId) return;

  

  await getPool().query(
    `UPDATE shop_purchases SET status = 'paid'
     WHERE stripe_session_id = $1 AND buyer_id = $2 AND status <> 'paid'`,
    [session.id, buyerId],
  );

  for (const itemId of itemIds) {
    const inserted = await getPool().query(
      `INSERT INTO shop_purchases (buyer_id, item_id, seller_id, stripe_session_id, status, quantity, amount_pence)
       SELECT $2, id, seller_id, $1, 'paid', 1, price_pence
       FROM shop_items WHERE id = $3
       ON CONFLICT (stripe_session_id, item_id) DO UPDATE SET status = 'paid'`,
      [session.id, buyerId, itemId],
    );
    if (!inserted.rowCount) continue;
    const claimed = await getPool().query(
      `UPDATE shop_items SET is_active = FALSE
       WHERE id = $1 AND is_active = TRUE AND deleted_at IS NULL`,
      [itemId],
    );
    if ((claimed.rowCount ?? 0) > 0) continue;
    const pi = session.payment_intent;
    const paymentIntentId = typeof pi === "string" ? pi : pi?.id;
    if (stripe && paymentIntentId) {
      try {
        await stripe.refunds.create(
          { payment_intent: paymentIntentId, reason: "duplicate" },
          { idempotencyKey: `shop-double-sale-refund-${session.id}-${itemId}` },
        );
      } catch (error) {
        logger.error({ err: error, itemId, sessionId: session.id }, "shop double-sale refund failed");
      }
    }
  }
}
