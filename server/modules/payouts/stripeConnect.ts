import Stripe from "stripe";
import { env } from "../../infra/env.js";
import { getPool } from "../../infra/postgres.js";
import { AppError } from "../../middleware/errors.js";

export type PayoutAccountStatus = {
  ok: true;
  accountId: string | null;
  onboardingUrl: null;
  payouts_enabled: boolean;
  charges_enabled: boolean;
  verificationStatus: string;
  status: string;
};

function stripeClient(): Stripe | null {
  const key = env().STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key);
}

function clientOrigin(): string {
  return env().CLIENT_URL || "http://localhost:5173";
}

function payoutReturnUrls() {
  const origin = clientOrigin().replace(/\/$/, "");
  return {
    refresh_url: `${origin}/settings/payout?payout_refresh=1`,
    return_url: `${origin}/settings/payout?payout_return=1`,
  };
}

async function sessionAccountId(userId: string): Promise<string | null> {
  const { rows } = await getPool().query<{ stripe_account_id: string | null }>(
    `SELECT stripe_account_id FROM payout_accounts WHERE user_id = $1`,
    [userId],
  );
  return rows[0]?.stripe_account_id ?? null;
}

export async function getPayoutAccountStatus(userId: string): Promise<PayoutAccountStatus> {
  const accountId = await sessionAccountId(userId);
  const stripe = stripeClient();
  if (!accountId) {
    return {
      ok: true,
      accountId: null,
      onboardingUrl: null,
      payouts_enabled: false,
      charges_enabled: false,
      verificationStatus: "none",
      status: stripe ? "absent" : "stripe_not_configured",
    };
  }
  if (!stripe) {
    return {
      ok: true,
      accountId,
      onboardingUrl: null,
      payouts_enabled: false,
      charges_enabled: false,
      verificationStatus: "unknown",
      status: "stripe_not_configured",
    };
  }
  try {
    const account = await stripe.accounts.retrieve(accountId);
    const payoutsEnabled = account.payouts_enabled === true;
    const chargesEnabled = account.charges_enabled === true;
    const submitted = account.details_submitted === true;
    const verificationStatus = payoutsEnabled ? "verified" : submitted ? "pending" : "none";
    const status = payoutsEnabled ? "ready" : submitted ? "restricted" : "onboarding_required";
    return {
      ok: true,
      accountId,
      onboardingUrl: null,
      payouts_enabled: payoutsEnabled,
      charges_enabled: chargesEnabled,
      verificationStatus,
      status,
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("unavailable", "Stripe Connect status is unavailable", 503);
  }
}

export async function createConnectOnboardingLink(userId: string): Promise<{
  ok: true;
  onboardingUrl: string;
  payouts_enabled: false;
}> {
  const stripe = stripeClient();
  if (!stripe) {
    throw new AppError("unavailable", "Stripe Connect is not configured", 503);
  }
  let accountId = await sessionAccountId(userId);
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
      [userId, accountId],
    );
  }
  const urls = payoutReturnUrls();
  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: urls.refresh_url,
    return_url: urls.return_url,
    type: "account_onboarding",
  });
  if (!link.url || !/^https:\/\//i.test(link.url)) {
    throw new AppError("unavailable", "Connect onboarding was not created", 503);
  }
  return { ok: true, onboardingUrl: link.url, payouts_enabled: false };
}
