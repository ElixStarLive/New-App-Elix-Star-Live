/**
 * PAGE-045 runtime proof — creator GBP Neon ownership, 60/40 paid gift, zero leakage,
 * withdrawal reservation, cross-account isolation. Stripe Connect onboard only when sk_test.
 * Run: npx tsx scripts/_page045_creator_payout_runtime_proof.ts
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

delete process.env.TEST_DATABASE_URL;
if (process.env.NODE_ENV === "test") process.env.NODE_ENV = "development";

process.env.VALKEY_URL = process.env.VALKEY_URL || "redis://127.0.0.1:6379";
process.env.REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";

const { resetEnvCache } = await import("../server/infra/env.ts");
resetEnvCache();

const { getPool, withTransaction } = await import("../server/infra/postgres.ts");
const { matureCreatorEarnings } = await import("../server/modules/gifts/settle.ts");
const {
  creatorBalanceSchema,
  creatorLedgerResponseSchema,
  creatorWithdrawalsResponseSchema,
  creatorPayoutAccountSchema,
  creatorOnboardResponseSchema,
} = await import("../shared/contracts/money.ts");

const base = process.env.PROOF_API_BASE?.trim() || "http://127.0.0.1:8080";

async function json(path: string, init: RequestInit = {}) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  const res = await fetch(`${base}${path}`, { ...init, headers });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function accessToken(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const session = (body as { session?: { access_token?: unknown } }).session;
  if (!session || typeof session !== "object") return "";
  return typeof session.access_token === "string" ? session.access_token : "";
}

async function register(stamp: string) {
  const username = `p45${stamp}${Math.random().toString(36).slice(2, 7)}`.slice(0, 12);
  const email = `${username}@example.com`;
  const password = "password12";
  const registered = await json("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      email,
      username,
      password,
      ageConfirmed13Plus: true,
      consentVersion: "2026-07-21",
    }),
  });
  assert(registered.status === 201, `register ${username} → ${registered.status}`);
  const id = String((registered.body as { user?: { id?: string } })?.user?.id ?? "");
  assert(Boolean(id), "register missing user id");
  await getPool()!.query(`UPDATE users SET email_confirmed_at = NOW() WHERE id = $1`, [id]);
  const login = await json("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  assert(login.status === 200, `login ${username} → ${login.status}`);
  const token = accessToken(login.body);
  assert(Boolean(token), "login missing access_token");
  return { id, token, username };
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

try {
  const page = readFileSync(resolve("src/pages/CreatorPayout.tsx"), "utf8");
  const api = readFileSync(resolve("src/features/creator/creatorPayoutApi.ts"), "utf8");
  const session = readFileSync(resolve("src/features/creator/creatorPayoutSession.ts"), "utf8");
  const service = readFileSync(resolve("server/modules/payouts/service.ts"), "utf8");
  const connect = readFileSync(resolve("server/modules/payouts/stripeConnect.ts"), "utf8");
  const settings = readFileSync(resolve("src/pages/Settings.tsx"), "utf8");
  const wallet = readFileSync(resolve("server/modules/wallet/router.ts"), "utf8");
  const app = readFileSync(resolve("src/App.tsx"), "utf8");

  assert(app.includes('path="/settings/payout"'), "route");
  assert(page.includes('title="Creator Payout"') && page.includes("SettingsOptionSheet"), "sheet");
  assert(settings.includes('go("/settings/payout")'), "settings handoff");
  assert(api.includes("/api/creator/balance") && api.includes("/api/creator/withdraw-gbp"), "apis");
  assert(session.includes("++generation") && session.includes("reloadSilent"), "stale gen");
  assert(service.includes("held_pence = held_pence + $2") && service.includes("FOR UPDATE"), "atomic hold");
  assert(service.includes("'pending'") && !service.includes("withdrawn_pence = withdrawn_pence + $2"), "request≠paid");
  assert(connect.includes("/settings/payout?payout_return=1"), "return urls");
  assert(connect.includes("void req.body") || !connect.includes("req.body"), "no body account spoof");
  assert(/router\.get\(\s*["']\/["']/.test(wallet), "wallet get owner");
  assert(!/withdraw-gbp|router\.post\(\s*["']\/withdraw["']/.test(wallet), "wallet separation");
  assert(!page.includes("localStorage") && !page.includes("* 0.6"), "no client 60/40");

  const health = await json("/api/health");
  assert(health.status === 200, `health ${health.status}`);
  assert((await json("/api/creator/balance")).status === 401, "unauth balance");
  assert((await json("/api/creator/withdraw-gbp", { method: "POST", body: "{}" })).status === 401, "unauth withdraw");
  assert((await json("/api/payouts/withdraw", { method: "POST" })).status === 404, "no duplicate withdraw");

  const creator = await register("a");
  const viewer = await register("b");
  const other = await register("c");

  const empty = await json("/api/creator/balance", { headers: auth(creator.token) });
  assert(empty.status === 200, `empty → ${empty.status}`);
  assert(creatorBalanceSchema.safeParse(empty.body).success, "balance schema");
  assert((empty.body as { gbp: { available_pence: number } }).gbp.available_pence === 0, "zero available");

  const stream = await getPool()!.query<{ id: string }>(
    `INSERT INTO live_streams (host_id, room_id, title) VALUES ($1, $2, 'p45-proof') RETURNING id::text AS id`,
    [creator.id, `p45-${creator.id}`],
  );
  const streamId = stream.rows[0].id;

  const starterGift = await json("/api/gifts/send", {
    method: "POST",
    headers: auth(viewer.token),
    body: JSON.stringify({
      giftId: "rose",
      recipientId: creator.id,
      streamId,
      idempotencyKey: crypto.randomUUID(),
      bucket: "starter",
    }),
  });
  assert(starterGift.status === 200, `starter gift → ${starterGift.status}`);
  assert(
    ((await json("/api/creator/balance", { headers: auth(creator.token) })).body as { gbp: { available_pence: number; pending_pence: number } })
      .gbp.pending_pence === 0,
    "starter £0",
  );

  await getPool()!.query(`UPDATE wallet_balances SET promo_coins = promo_coins + 10 WHERE user_id = $1`, [viewer.id]);
  const promoGift = await json("/api/gifts/send", {
    method: "POST",
    headers: auth(viewer.token),
    body: JSON.stringify({
      giftId: "rose",
      recipientId: creator.id,
      streamId,
      idempotencyKey: crypto.randomUUID(),
      bucket: "promo",
    }),
  });
  assert(promoGift.status === 200, `promo gift → ${promoGift.status}`);
  assert(
    ((await json("/api/creator/balance", { headers: auth(creator.token) })).body as { gbp: { pending_pence: number } }).gbp
      .pending_pence === 0,
    "promo £0",
  );

  await getPool()!.query(`UPDATE wallet_balances SET paid_coins = paid_coins + 10 WHERE user_id = $1`, [viewer.id]);
  await getPool()!.query(
    `INSERT INTO paid_coin_lots (
       user_id, provider, provider_txn_id, product_id, coins_original, coins_remaining, gross_pence, settlement_status
     ) VALUES ($1, 'google', $2, 'coins1000', 10, 10, 1000, 'settled')`,
    [viewer.id, `p45-lot-${viewer.id}`],
  );
  const paidGift = await json("/api/gifts/send", {
    method: "POST",
    headers: auth(viewer.token),
    body: JSON.stringify({
      giftId: "rose",
      recipientId: creator.id,
      streamId,
      idempotencyKey: crypto.randomUUID(),
      bucket: "paid",
    }),
  });
  assert(paidGift.status === 200, `paid gift → ${paidGift.status}`);
  const afterPaid = await json("/api/creator/balance", { headers: auth(creator.token) });
  assert(
    (afterPaid.body as { gbp: { pending_pence: number; available_pence: number } }).gbp.pending_pence === 60,
    "60% pending",
  );
  assert((afterPaid.body as { gbp: { available_pence: number } }).gbp.available_pence === 0, "locked until mature");
  assert(
    (afterPaid.body as { earnings_by_source: { gifts_pence: number } }).earnings_by_source.gifts_pence === 60,
    "gift earnings 60",
  );

  const platform = await getPool()!.query<{ available_pence: string }>(
    `SELECT available_pence::text FROM platform_wallet_gbp WHERE id = 1`,
  );
  assert(Number(platform.rows[0]?.available_pence ?? 0) >= 40, "platform 40%");

  await getPool()!.query(`UPDATE creator_earnings SET available_at = NOW() WHERE creator_id = $1`, [creator.id]);
  await withTransaction(async (client) => {
    await matureCreatorEarnings(client);
  });
  const matured = await json("/api/creator/balance", { headers: auth(creator.token) });
  assert(
    (matured.body as { gbp: { available_pence: number; pending_pence: number } }).gbp.available_pence === 60,
    "available after mature",
  );
  assert((matured.body as { gbp: { pending_pence: number } }).gbp.pending_pence === 0, "pending cleared");

  const ledger = await json("/api/creator/ledger", { headers: auth(creator.token) });
  assert(creatorLedgerResponseSchema.safeParse(ledger.body).success, "ledger schema");
  assert(
    ((ledger.body as { ledger: Array<{ revenue_source: string }> }).ledger ?? []).some((row) =>
      row.revenue_source.includes("gift_creator"),
    ),
    "ledger has gift_creator",
  );

  const noMethod = await json("/api/creator/withdraw-gbp", {
    method: "POST",
    headers: auth(creator.token),
    body: JSON.stringify({ amount_pence: 60, idempotency_key: "p45-proof-no-method" }),
  });
  assert(noMethod.status === 400, `no method → ${noMethod.status}`);

  const saveMethod = await json("/api/creator/payout-method", {
    method: "POST",
    headers: auth(creator.token),
    body: JSON.stringify({
      type: "bank",
      details: { account_name: "Creator A", iban_or_account: "GB82WEST12345698765432" },
    }),
  });
  assert(saveMethod.status === 200, `save method → ${saveMethod.status}`);

  const over = await json("/api/creator/withdraw-gbp", {
    method: "POST",
    headers: auth(creator.token),
    body: JSON.stringify({ amount_pence: 61, idempotency_key: "p45-proof-over" }),
  });
  assert(over.status === 400, `over → ${over.status}`);

  const key = `p45-proof-wd-${crypto.randomUUID()}`;
  const withdraw = await json("/api/creator/withdraw-gbp", {
    method: "POST",
    headers: auth(creator.token),
    body: JSON.stringify({
      amount_pence: 60,
      idempotency_key: key,
      userId: other.id,
      stripeAccountId: "acct_forged",
    }),
  });
  assert(withdraw.status === 200, `withdraw → ${withdraw.status}`);
  assert((withdraw.body as { status: string; already_exists: boolean }).status === "pending", "pending not paid");
  const replay = await json("/api/creator/withdraw-gbp", {
    method: "POST",
    headers: auth(creator.token),
    body: JSON.stringify({ amount_pence: 60, idempotency_key: key }),
  });
  assert((replay.body as { already_exists: boolean }).already_exists === true, "idempotent replay");

  const reserved = await json("/api/creator/balance", { headers: auth(creator.token) });
  assert((reserved.body as { gbp: { available_pence: number } }).gbp.available_pence === 0, "available reserved");
  assert((reserved.body as { gbp: { held_pence: number } }).gbp.held_pence === 60, "held 60");
  assert((reserved.body as { gbp: { withdrawn_pence: number } }).gbp.withdrawn_pence === 0, "not paid yet");

  const history = await json("/api/creator/withdrawals-gbp", { headers: auth(creator.token) });
  assert(creatorWithdrawalsResponseSchema.safeParse(history.body).success, "withdrawals schema");
  assert(
    ((history.body as { withdrawals: Array<{ amount_pence: number; status: string }> }).withdrawals ?? []).some(
      (row) => row.amount_pence === 60 && row.status === "pending",
    ),
    "history pending 60",
  );

  await getPool()!.query(`UPDATE creator_wallet_gbp SET available_pence = 5000 WHERE user_id = $1`, [creator.id]);
  const [left, right] = await Promise.all([
    json("/api/creator/withdraw-gbp", {
      method: "POST",
      headers: auth(creator.token),
      body: JSON.stringify({ amount_pence: 5000, idempotency_key: `p45-conc-a-${crypto.randomUUID()}` }),
    }),
    json("/api/creator/withdraw-gbp", {
      method: "POST",
      headers: auth(creator.token),
      body: JSON.stringify({ amount_pence: 5000, idempotency_key: `p45-conc-b-${crypto.randomUUID()}` }),
    }),
  ]);
  assert([left.status, right.status].sort().join(",") === "200,400", "concurrent one wins");

  const isolated = await json("/api/creator/balance", { headers: auth(other.token) });
  assert((isolated.body as { gbp: { available_pence: number } }).gbp.available_pence === 0, "other balance 0");
  assert(
    JSON.stringify((await json("/api/creator/withdrawals-gbp", { headers: auth(other.token) })).body) ===
      JSON.stringify({ withdrawals: [] }),
    "other no withdrawals",
  );

  const foreignWithdraw = await json("/api/creator/withdraw-gbp", {
    method: "POST",
    headers: auth(other.token),
    body: JSON.stringify({ amount_pence: 60, idempotency_key: `p45-foreign-${crypto.randomUUID()}`, userId: creator.id }),
  });
  assert([400, 403].includes(foreignWithdraw.status) || foreignWithdraw.status === 400, "foreign withdraw rejected");

  const acct = await json("/api/creator/payout-account", { headers: auth(creator.token) });
  assert(acct.status === 200, `account → ${acct.status}`);
  assert(creatorPayoutAccountSchema.safeParse(acct.body).success, "account schema");
  assert((acct.body as { payouts_enabled: boolean }).payouts_enabled === false, "not fake ready");

  const stripeKey = (process.env.STRIPE_SECRET_KEY || "").trim();
  let stripeSandbox = false;
  if (stripeKey.startsWith("sk_test_")) {
    const onboard = await json("/api/creator/payout-account/onboard", {
      method: "POST",
      headers: auth(creator.token),
      body: JSON.stringify({ accountId: "acct_forged", stripeAccountId: "acct_forged" }),
    });
    assert(onboard.status === 200, `onboard → ${onboard.status}`);
    assert(creatorOnboardResponseSchema.safeParse(onboard.body).success, "onboard schema");
    assert((onboard.body as { payouts_enabled: boolean }).payouts_enabled === false, "onboard not ready");
    assert(
      /^https:\/\//i.test((onboard.body as { onboardingUrl: string }).onboardingUrl),
      "onboarding url https",
    );
    const mapped = await getPool()!.query<{ stripe_account_id: string }>(
      `SELECT stripe_account_id FROM payout_accounts WHERE user_id = $1`,
      [creator.id],
    );
    assert(Boolean(mapped.rows[0]?.stripe_account_id), "neon stripe mapping");
    assert(mapped.rows[0]?.stripe_account_id !== "acct_forged", "forged id rejected");
    stripeSandbox = true;
  } else {
    // Never create Connect accounts with sk_live_ during PAGE-045 proof.
    assert(
      ((await json("/api/creator/payout-account", { headers: auth(creator.token) })).body as { payouts_enabled: boolean })
        .payouts_enabled === false,
      "Connect not marked ready without sandbox onboard",
    );
  }

  const walletSep = await json("/api/wallet", { headers: auth(viewer.token) });
  assert(walletSep.status === 200, "wallet ok");
  assert((walletSep.body as { gbp?: unknown }).gbp === undefined, "wallet has no gbp");

  const logout = await json("/api/auth/logout", { method: "POST", headers: auth(creator.token) });
  assert(logout.status === 200, `logout → ${logout.status}`);
  assert((await json("/api/creator/balance", { headers: auth(creator.token) })).status === 401, "post-logout 401");

  await getPool()!.query(`DELETE FROM withdrawals_gbp WHERE user_id = $1`, [creator.id]);
  await getPool()!.query(`DELETE FROM creator_wallet_gbp WHERE user_id = $1`, [creator.id]);

  console.log("PAGE-045 CREATOR PAYOUT RUNTIME PROOF: PASS");
  console.log(
    JSON.stringify(
      {
        paidGiftSixtyForty: true,
        noPromoStarterCash: true,
        neonWithdrawalHold: true,
        concurrentProtected: true,
        crossAccountIsolated: true,
        walletGbpSeparated: true,
        stripeSandbox,
        stripeKeyMode: stripeKey.startsWith("sk_test_")
          ? "test"
          : stripeKey.startsWith("sk_live_")
            ? "live"
            : "absent",
      },
      null,
      2,
    ),
  );
  if (!stripeSandbox) {
    console.error("PAGE-045 STRIPE CONNECT SANDBOX: FAIL (requires sk_test_; live key not used for Connect create)");
    process.exit(2);
  }
  process.exit(0);
} catch (error) {
  console.error("PAGE-045 CREATOR PAYOUT RUNTIME PROOF: FAIL");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
