import type { Request, Response } from "express";
import Stripe from "stripe";
import { WebhookReceiver } from "livekit-server-sdk";
import { getPool } from "../../infra/postgres.js";
import { env } from "../../infra/env.js";
import { logger } from "../../infra/logger.js";
import { AppError } from "../../middleware/errors.js";
import { reverseIapPurchase } from "../iap/reverse.js";
import { verifyAppleSignedJws } from "../../infra/iapVerify.js";

export async function handleStripeWebhook(req: Request, res: Response): Promise<void> {
  const secret = env().STRIPE_WEBHOOK_SECRET;
  const key = env().STRIPE_SECRET_KEY;
  if (!secret || !key) {
    throw new AppError("unavailable", "Stripe webhooks are not configured", 503);
  }
  const signature = req.headers["stripe-signature"];
  if (typeof signature !== "string") {
    throw new AppError("validation_error", "Missing Stripe signature", 400);
  }
  const stripe = new Stripe(key);
  const payload = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body));
  const event = stripe.webhooks.constructEvent(payload, signature, secret);
  const inserted = await getPool().query(
    `INSERT INTO processed_webhook_events (provider, event_id) VALUES ('stripe', $1)
     ON CONFLICT DO NOTHING RETURNING event_id`,
    [event.id],
  );
  if (!inserted.rows[0]) {
    res.json({ received: true, duplicate: true });
    return;
  }
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as { id?: string };
    if (session.id) {
      await getPool().query(
        `UPDATE shop_purchases SET status = 'paid' WHERE stripe_session_id = $1`,
        [session.id],
      );
    }
  }
  if (event.type === "account.updated") {
    const account = event.data.object as { id?: string; details_submitted?: boolean };
    if (account.id && account.details_submitted) {
      await getPool().query(
        `UPDATE payout_accounts SET onboarded_at = NOW() WHERE stripe_account_id = $1 AND onboarded_at IS NULL`,
        [account.id],
      );
    }
  }
  res.json({ received: true });
}

export async function handleLivekitWebhook(req: Request, res: Response): Promise<void> {
  const cfg = env();
  if (!cfg.LIVEKIT_API_KEY || !cfg.LIVEKIT_API_SECRET) {
    throw new AppError("unavailable", "LiveKit webhooks are not configured", 503);
  }
  const receiver = new WebhookReceiver(cfg.LIVEKIT_API_KEY, cfg.LIVEKIT_API_SECRET);
  const body = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : JSON.stringify(req.body);
  const auth = typeof req.headers.authorization === "string" ? req.headers.authorization : "";
  const event = await receiver.receive(body, auth);
  if (event.event === "room_finished" && event.room?.name) {
    await getPool().query(
      `UPDATE live_streams SET status = 'ended', ended_at = NOW()
       WHERE room_id = $1 AND status = 'live'`,
      [event.room.name],
    );
  }
  res.json({ ok: true });
}

export async function handleAppleNotification(req: Request, res: Response): Promise<void> {
  const secret = process.env.APPLE_IAP_NOTIFICATION_SECRET?.trim();
  if (env().isProduction && !secret) {
    throw new AppError("unavailable", "Apple IAP notifications are not configured", 503);
  }
  if (secret && req.query.token !== secret) {
    throw new AppError("forbidden", "Invalid Apple notification token", 403);
  }
  const signedPayload = typeof req.body?.signedPayload === "string" ? req.body.signedPayload : "";
  if (!signedPayload) {
    throw new AppError("validation_error", "signedPayload required", 400);
  }
  const payload = await verifyAppleSignedJws(signedPayload);
  const notificationType = typeof payload.notificationType === "string" ? payload.notificationType : "";
  const eventId = typeof payload.notificationUUID === "string" ? payload.notificationUUID : null;
  if (eventId) {
    const inserted = await getPool().query(
      `INSERT INTO processed_webhook_events (provider, event_id) VALUES ('apple', $1)
       ON CONFLICT DO NOTHING RETURNING event_id`,
      [eventId],
    );
    if (!inserted.rows[0]) {
      res.json({ ok: true, duplicate: true });
      return;
    }
  }
  const data = payload.data && typeof payload.data === "object" ? (payload.data as Record<string, unknown>) : {};
  const signedTxn = typeof data.signedTransactionInfo === "string" ? data.signedTransactionInfo : "";
  if (
    (notificationType === "REFUND" || notificationType === "REVOKE") &&
    signedTxn
  ) {
    const txn = await verifyAppleSignedJws(signedTxn);
    const txnId = typeof txn.transactionId === "string" ? txn.transactionId : "";
    if (!txnId) throw new AppError("validation_error", "Refund is missing transaction id", 400);
    await reverseIapPurchase("apple", txnId);
  }
  logger.info({ notificationType }, "apple iap notification");
  res.json({ ok: true });
}

export async function handleGoogleRtdn(req: Request, res: Response): Promise<void> {
  const secret = process.env.GOOGLE_RTDN_WEBHOOK_SECRET?.trim();
  if (env().isProduction && !secret) {
    throw new AppError("unavailable", "Google Play notifications are not configured", 503);
  }
  if (secret && req.query.token !== secret) {
    throw new AppError("forbidden", "Invalid Google notification token", 403);
  }
  const encoded = typeof req.body?.message?.data === "string" ? req.body.message.data : "";
  if (!encoded) {
    throw new AppError("validation_error", "Pub/Sub message data required", 400);
  }
  let decoded: Record<string, unknown>;
  try {
    decoded = JSON.parse(Buffer.from(encoded, "base64").toString("utf8")) as Record<string, unknown>;
  } catch {
    throw new AppError("validation_error", "Invalid Google notification payload", 400);
  }
  const oneTime =
    decoded.oneTimeProductNotification && typeof decoded.oneTimeProductNotification === "object"
      ? (decoded.oneTimeProductNotification as Record<string, unknown>)
      : null;
  const purchaseToken = typeof oneTime?.purchaseToken === "string" ? oneTime.purchaseToken : "";
  const notificationType = Number(oneTime?.notificationType ?? 0);
  if (purchaseToken && (notificationType === 2 || notificationType === 3)) {
    await reverseIapPurchase("google", purchaseToken);
  }
  logger.info({ notificationType }, "google play rtdn");
  res.json({ ok: true });
}
