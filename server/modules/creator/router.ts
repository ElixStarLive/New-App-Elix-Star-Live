import { Router } from "express";
import Stripe from "stripe";
import { getPool } from "../../infra/postgres.js";
import { requireAuth, type AuthedRequest } from "../../middleware/auth.js";
import { AppError } from "../../middleware/errors.js";
import { env } from "../../infra/env.js";
import { withdrawalBodySchema } from "../../../shared/contracts/money.js";
import { withdrawCreatorGbp } from "../wallet/withdrawGbp.js";

const router = Router();

router.get("/balance", requireAuth, async (req: AuthedRequest, res) => {
  const { rows } = await getPool().query<{
    pending_pence: string;
    available_pence: string;
    withdrawn_pence: string;
  }>(
    `SELECT pending_pence, available_pence, withdrawn_pence FROM creator_wallet_gbp WHERE user_id = $1`,
    [req.userId],
  );
  res.json({
    pendingPence: Number(rows[0]?.pending_pence ?? 0),
    availablePence: Number(rows[0]?.available_pence ?? 0),
    withdrawnPence: Number(rows[0]?.withdrawn_pence ?? 0),
  });
});

router.post("/payout-account/onboard", requireAuth, async (req: AuthedRequest, res) => {
  const key = env().STRIPE_SECRET_KEY;
  if (!key) throw new AppError("unavailable", "Stripe Connect is not configured", 503);
  const stripe = new Stripe(key);
  const existing = await getPool().query<{ stripe_account_id: string | null }>(
    `SELECT stripe_account_id FROM payout_accounts WHERE user_id = $1`,
    [req.userId],
  );
  let accountId = existing.rows[0]?.stripe_account_id ?? null;
  if (!accountId) {
    const account = await stripe.accounts.create({
      type: "express",
      country: "GB",
      capabilities: { transfers: { requested: true } },
    });
    accountId = account.id;
    await getPool().query(
      `INSERT INTO payout_accounts (user_id, stripe_account_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET stripe_account_id = EXCLUDED.stripe_account_id`,
      [req.userId, accountId],
    );
  }
  const origin = env().CLIENT_URL || "http://localhost:5173";
  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${origin}/settings/payout`,
    return_url: `${origin}/settings/payout`,
    type: "account_onboarding",
  });
  if (!link.url) throw new AppError("unavailable", "Connect onboarding was not created", 503);
  res.json({ url: link.url });
});

router.post("/withdraw-gbp", requireAuth, async (req: AuthedRequest, res) => {
  const body = withdrawalBodySchema.parse(req.body);
  const account = await getPool().query<{ stripe_account_id: string | null; onboarded_at: Date | null }>(
    `SELECT stripe_account_id, onboarded_at FROM payout_accounts WHERE user_id = $1`,
    [req.userId],
  );
  if (!account.rows[0]?.stripe_account_id) {
    throw new AppError("validation_error", "Connect your payout account first", 400);
  }
  await withdrawCreatorGbp(req.userId as string, body);
  res.json({ ok: true });
});

export default router;
