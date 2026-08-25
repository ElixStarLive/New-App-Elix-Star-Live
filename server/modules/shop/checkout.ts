import Stripe from "stripe";
import type { Response } from "express";
import { getPool } from "../../infra/postgres.js";
import { env } from "../../infra/env.js";
import { AppError } from "../../middleware/errors.js";
import type { AuthedRequest } from "../../middleware/auth.js";
import { SHOP_STRIPE_GBP_MIN_PENCE } from "../../../shared/contracts/shop.js";
import { parseShopCheckoutLines, shopCheckoutIdempotencyKey } from "./lines.js";

function shopClientOrigin(): string {
  const clientUrl = (env().CLIENT_URL || "").trim().replace(/\/$/, "");
  if (env().isProduction) {
    if (!clientUrl.startsWith("https://") || /127\.0\.0\.1|localhost/i.test(clientUrl)) {
      throw new AppError("unavailable", "CLIENT_URL must be a public https origin", 503);
    }
    return clientUrl;
  }
  return clientUrl || "http://localhost:5173";
}

type ShopItemPriceRow = {
  id: string;
  seller_id: string;
  title: string;
  description: string;
  price_pence: number;
  image_url: string | null;
};

async function loadCheckoutItems(ids: string[]): Promise<ShopItemPriceRow[]> {
  
  const { rows } = await getPool().query<ShopItemPriceRow>(
    `SELECT id, seller_id, title, description, price_pence, image_url
     FROM shop_items
     WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL AND is_active = TRUE`,
    [ids],
  );
  return rows;
}

export async function createShopCheckout(req: AuthedRequest, res: Response): Promise<void> {
  const buyerId = req.userId as string;
  if (typeof req.body?.success_url === "string" || typeof req.body?.cancel_url === "string") {
    throw new AppError("validation_error", "Checkout URLs are server-owned", 400);
  }
  
  const lines = parseShopCheckoutLines(req.body);
  const idempotency = shopCheckoutIdempotencyKey(buyerId, (req.body as { idempotencyKey?: unknown }).idempotencyKey);
  if (idempotency) {
    const existing = await getPool().query<{ url: string; stripe_session_id: string }>(
      `SELECT url, stripe_session_id FROM shop_checkout_intents
       WHERE buyer_id = $1 AND idempotency_key = $2`,
      [buyerId, idempotency],
    );
    if (existing.rows[0]) {
      res.json({ url: existing.rows[0].url, sessionId: existing.rows[0].stripe_session_id });
      return;
    }
  }

  const ids = lines.map((line) => line.id);
  const rows = await loadCheckoutItems(ids);
  const byId = new Map(rows.map((row) => [row.id, row]));
  const stripeLines: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
  let totalPence = 0;
  for (const line of lines) {
    const item = byId.get(line.id);
    if (!item) throw new AppError("not_found", "An item is no longer available", 404);
    if (item.seller_id === buyerId) throw new AppError("validation_error", "Cannot buy your own item", 400);
    if (!Number.isFinite(item.price_pence) || item.price_pence < 1) {
      throw new AppError("validation_error", "An item has no valid price", 400);
    }
    totalPence += item.price_pence * line.quantity;
    stripeLines.push({
      price_data: {
        currency: "gbp",
        product_data: {
          name: item.title,
          description: item.description || "Shop item on Elix Star Live",
          ...(item.image_url ? { images: [item.image_url] } : {}),
        },
        unit_amount: item.price_pence,
      },
      quantity: line.quantity,
    });
  }
  if (totalPence < SHOP_STRIPE_GBP_MIN_PENCE) {
    throw new AppError(
      "validation_error",
      `Order total is below Stripe’s minimum for GBP (£${(SHOP_STRIPE_GBP_MIN_PENCE / 100).toFixed(2)}). Increase the basket total to continue.`,
      400,
    );
  }

  const key = env().STRIPE_SECRET_KEY;
  if (!key) throw new AppError("unavailable", "Shop checkout is not configured", 503);
  const origin = shopClientOrigin();
  const stripe = new Stripe(key);
  const paymentConfig = (process.env.STRIPE_SHOP_PAYMENT_METHOD_CONFIGURATION || "").trim();
  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      line_items: stripeLines,
      success_url: `${origin}/shop?purchase=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/shop?purchase=cancelled`,
      client_reference_id: buyerId,
      shipping_address_collection: { allowed_countries: ["GB"] },
      ...(paymentConfig ? { payment_method_configuration: paymentConfig } : {}),
      metadata: {
        type: "shop_item",
        userId: buyerId,
        itemId: lines[0]!.id,
        sellerId: byId.get(lines[0]!.id)!.seller_id,
        itemIds: lines.map((line) => line.id).join(","),
        itemQtys: lines.map((line) => String(line.quantity)).join(","),
        order_total_pence: String(totalPence),
      },
    },
    idempotency ? { idempotencyKey: idempotency } : undefined,
  );
  if (!session.url || !session.id) throw new AppError("unavailable", "Checkout session was not created", 503);

  for (const line of lines) {
      const item = byId.get(line.id)!;
      await getPool().query(
        `INSERT INTO shop_purchases (buyer_id, item_id, seller_id, stripe_session_id, status, quantity, amount_pence)
         VALUES ($1, $2, $3, $4, 'pending', $5, $6)
         ON CONFLICT (stripe_session_id, item_id) DO NOTHING`,
        [buyerId, line.id, item.seller_id, session.id, line.quantity, item.price_pence * line.quantity],
      );
    }
    if (idempotency) {
      await getPool().query(
        `INSERT INTO shop_checkout_intents (buyer_id, idempotency_key, stripe_session_id, url)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (buyer_id, idempotency_key) DO NOTHING`,
        [buyerId, idempotency, session.id, session.url],
      );
    }
  res.json({ url: session.url, sessionId: session.id });
}

export async function getShopCheckoutSession(req: AuthedRequest, res: Response): Promise<void> {
  const key = env().STRIPE_SECRET_KEY;
  if (!key) throw new AppError("unavailable", "Payments not configured", 503);
  const sessionId = String(req.params.sessionId || "").trim();
  if (!sessionId.startsWith("cs_")) throw new AppError("validation_error", "Invalid session id", 400);
  const stripe = new Stripe(key);
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  const owner =
    (typeof session.client_reference_id === "string" && session.client_reference_id) ||
    (typeof session.metadata?.userId === "string" && session.metadata.userId) ||
    "";
  if (!owner || owner !== req.userId) {
    throw new AppError("forbidden", "Session does not belong to this account", 403);
  }
  let recordedPaid = false;
  const local = await getPool().query<{ status: string }>(
      `SELECT status FROM shop_purchases WHERE stripe_session_id = $1 AND buyer_id = $2`,
      [session.id, req.userId],
    );
    recordedPaid = local.rows.some((row) => row.status === "paid");
  res.json({
    sessionId: session.id,
    status: session.status,
    payment_status: session.payment_status,
    paid: recordedPaid || session.payment_status === "paid",
  });
}
