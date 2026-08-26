/**
 * PAGE-038 runtime proof — coin packages + verify-purchase authority (Apple/Google only).
 * Run: npx tsx scripts/_page038_purchase_coins_runtime_proof.ts
 * Android/iOS store purchase PASS requires real Play Billing / StoreKit sandbox on device.
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

const { closeValkey, requireValkey } = await import("../server/infra/valkey.ts");
const { getPool } = await import("../server/infra/postgres.ts");

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
  const username = `p38${stamp}${Math.random().toString(36).slice(2, 7)}`.slice(0, 12);
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

try {
  const page = readFileSync(resolve("src/pages/PurchaseCoins.tsx"), "utf8");
  const modal = readFileSync(resolve("src/components/BuyCoinsModal.tsx"), "utf8");
  const api = readFileSync(resolve("src/features/iap/iapApi.ts"), "utf8");
  const credit = readFileSync(resolve("server/modules/iap/credit.ts"), "utf8");
  const app = readFileSync(resolve("src/App.tsx"), "utf8");

  assert(app.includes('path="/purchase-coins"'), "route");
  assert(page.includes("purchaseCoinProduct") && page.includes("Purchase Coins in the App"), "page IAP-only");
  assert(modal.includes("BuyCoinsModal") && modal.includes("purchaseCoinProduct"), "modal shares IAP owner");
  assert(api.includes("/api/coin-packages") && api.includes("/api/verify-purchase"), "canonical APIs");
  assert(api.includes("purchaseLock"), "duplicate tap lock");
  assert(!api.includes("/api/shop/checkout") && !page.includes("openStripeCheckoutUrl"), "no Stripe coins");
  assert(credit.includes("processed_purchases") && credit.includes("insertPaidCoinLot"), "Neon economic writers");
  assert(credit.includes("Transaction belongs to another account"), "foreign replay 403");
  assert(app.includes("reconcileOwnedCoinPurchases"), "PAGE-006 foreground reconcile");

  await requireValkey().ping();
  const health = await json("/api/health");
  assert(health.status === 200, `health ${health.status}`);

  const buyer = await register("a");
  const other = await register("b");

  const packages = await json("/api/coin-packages?provider=google");
  assert(packages.status === 200, `packages → ${packages.status}`);
  const rows = (packages.body as { packages?: Array<{ productId?: string; coins?: number; provider?: string }> }).packages || [];
  assert(rows.length > 0, "catalog not empty");
  assert(rows.every((row) => row.provider === "google" && typeof row.productId === "string" && (row.coins ?? 0) > 0), "google packages well-formed");

  const applePackages = await json("/api/coin-packages?provider=apple");
  assert(applePackages.status === 200, `apple packages → ${applePackages.status}`);

  const unauth = await json("/api/verify-purchase", {
    method: "POST",
    body: JSON.stringify({ provider: "google", productId: rows[0]!.productId, receipt: "fake" }),
  });
  assert(unauth.status === 401, `unauth verify → ${unauth.status}`);

  const forgedUser = await json("/api/verify-purchase", {
    method: "POST",
    headers: { Authorization: `Bearer ${buyer.token}` },
    body: JSON.stringify({
      provider: "google",
      productId: rows[0]!.productId,
      receipt: "not-a-real-purchase-token",
      userId: other.id,
      coins: 999999,
    }),
  });
  assert(forgedUser.status === 403, `foreign userId claim → ${forgedUser.status}`);

  const forgedReceipt = await json("/api/verify-purchase", {
    method: "POST",
    headers: { Authorization: `Bearer ${buyer.token}` },
    body: JSON.stringify({
      provider: "google",
      productId: rows[0]!.productId,
      receipt: "not-a-real-purchase-token",
      coins: 999999,
    }),
  });
  assert([400, 502, 503].includes(forgedReceipt.status), `forged receipt → ${forgedReceipt.status}`);

  const wrongSku = await json("/api/verify-purchase", {
    method: "POST",
    headers: { Authorization: `Bearer ${buyer.token}` },
    body: JSON.stringify({
      provider: "google",
      productId: "not-a-real-sku",
      receipt: "not-a-real-purchase-token",
    }),
  });
  assert(wrongSku.status === 400, `unknown sku → ${wrongSku.status}`);

  const stripeAlias = await json("/api/shop/checkout", {
    method: "POST",
    headers: { Authorization: `Bearer ${buyer.token}` },
    body: JSON.stringify({ itemId: rows[0]!.productId, quantity: 1 }),
  });
  assert([400, 404].includes(stripeAlias.status), `stripe coin alias rejected → ${stripeAlias.status}`);

  const wallet = await json("/api/wallet", {
    headers: { Authorization: `Bearer ${buyer.token}` },
  });
  assert(wallet.status === 200, `wallet → ${wallet.status}`);
  const walletBody = wallet.body as Record<string, unknown>;
  assert(walletBody.testCoins === undefined, "test coins not in wallet");
  assert(typeof walletBody.coin_balance === "number", "paid balance field");
  assert(typeof walletBody.starter_balance === "number", "starter separate");
  assert(typeof walletBody.promotional_balance === "number", "promo separate");

  const lots = await getPool()!.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM paid_coin_lots WHERE user_id = $1`,
    [buyer.id],
  );
  assert(Number(lots.rows[0]?.n) === 0, "no paid lots without verified IAP");

  console.log("PAGE-038 runtime proof PASS");
  console.log(
    JSON.stringify(
      {
        catalog: true,
        verifyAuth: true,
        foreignUserClaim403: true,
        forgedReceiptRejected: true,
        wrongSkuRejected: true,
        noStripeCoinPath: true,
        walletSeparation: true,
        androidDeviceIap: "NOT_RUN",
        iosDeviceIap: "NOT_RUN",
        apiBase: base,
        packageCountGoogle: rows.length,
      },
      null,
      2,
    ),
  );
} catch (err) {
  console.error("PAGE-038 runtime proof FAIL", err);
  process.exitCode = 1;
} finally {
  try {
    await closeValkey();
  } catch {
    /* ignore */
  }
  try {
    await getPool()?.end();
  } catch {
    /* ignore */
  }
}
