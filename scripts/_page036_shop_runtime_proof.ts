/**
 * PAGE-036 runtime proof — Shop catalog, ownership, basket limits, Stripe checkout authority.
 * Run: npx tsx scripts/_page036_shop_runtime_proof.ts
 * Stripe sandbox PASS only when STRIPE_SECRET_KEY creates a real Checkout Session URL.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Do not inherit vitest harness overrides that strip Stripe secrets.
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
  const username = `p36${stamp}${Math.random().toString(36).slice(2, 7)}`.slice(0, 12);
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
  const page = readFileSync(resolve("src/pages/Shop.tsx"), "utf8");
  const api = readFileSync(resolve("src/features/shop/shopApi.ts"), "utf8");
  const checkout = readFileSync(resolve("server/modules/shop/checkout.ts"), "utf8");
  const catalog = readFileSync(resolve("server/modules/shop/catalog.ts"), "utf8");
  const basket = readFileSync(resolve("src/store/useShopBasketStore.ts"), "utf8");
  const app = readFileSync(resolve("src/App.tsx"), "utf8");

  assert(app.includes('path="/shop"'), "route /shop");
  assert(app.includes('path="/shop/:itemId"'), "route item handoff");
  assert(page.includes("Checkout with Stripe"), "Stripe checkout CTA");
  assert(page.includes("apiShopCheckout"), "checkout API");
  assert(page.includes("wsClient.on(\"stream_started\""), "PAGE-006 live refresh");
  assert(!page.includes("new WebSocket"), "no second socket");
  assert(!page.includes("StoreKit") && !page.includes("coin_balance"), "no IAP/coins");
  assert(api.includes("/api/shop/checkout"), "canonical checkout path");
  assert(checkout.includes("unit_amount: item.price_pence"), "server price authority");
  assert(checkout.includes("CLIENT_URL"), "CLIENT_URL success/cancel");
  assert(checkout.includes("isBlockedEitherWay"), "checkout block gate");
  assert(catalog.includes("FROM blocks b"), "catalog block filter");
  assert(basket.includes("MAX_LINES = 10"), "max 10 lines");
  assert(basket.includes("MAX_QTY = 99"), "qty 1-99");

  await requireValkey().ping();
  const health = await json("/api/health");
  assert(health.status === 200, `health ${health.status}`);

  const startGone = await json("/api/shop/start", { method: "POST", body: "{}" });
  assert(startGone.status === 404, "no alternate shop start");

  const seller = await register("s");
  const buyer = await register("b");
  const stranger = await register("c");

  const created = await json("/api/shop/items", {
    method: "POST",
    headers: { Authorization: `Bearer ${seller.token}` },
    body: JSON.stringify({
      title: "Runtime Hat",
      description: "Wool",
      pricePence: 1250,
      category: "clothing",
    }),
  });
  assert(created.status === 201, `create → ${created.status}`);
  const item = created.body as { id?: string; pricePence?: number; sellerId?: string; title?: string };
  assert(item.id && item.pricePence === 1250 && item.sellerId === seller.id, "create identity");

  const listed = await json("/api/shop/items", {
    headers: { Authorization: `Bearer ${buyer.token}` },
  });
  assert(listed.status === 200, `list → ${listed.status}`);
  const items = (listed.body as { items?: Array<{ id?: string; pricePence?: number; title?: string }> }).items || [];
  const row = items.find((entry) => entry.id === item.id);
  assert(Boolean(row), "buyer sees seller item");
  assert(row?.pricePence === 1250 && row?.title === "Runtime Hat", "catalog price/title");

  const foreign = await json(`/api/shop/items/${item.id}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${stranger.token}` },
    body: JSON.stringify({ title: "Stolen", description: "x", pricePence: 1, category: "other" }),
  });
  assert(foreign.status === 404, `cross-user mutate → ${foreign.status}`);

  const qtyBad = await json("/api/shop/checkout", {
    method: "POST",
    headers: { Authorization: `Bearer ${buyer.token}` },
    body: JSON.stringify({ itemId: item.id, quantity: 0, price: 0.01 }),
  });
  assert(qtyBad.status === 400, `qty 0 → ${qtyBad.status}`);

  const ownBuy = await json("/api/shop/checkout", {
    method: "POST",
    headers: { Authorization: `Bearer ${seller.token}` },
    body: JSON.stringify({ itemId: item.id, quantity: 1 }),
  });
  assert(ownBuy.status === 400, `own buy → ${ownBuy.status}`);

  const evilUrls = await json("/api/shop/checkout", {
    method: "POST",
    headers: { Authorization: `Bearer ${buyer.token}` },
    body: JSON.stringify({
      items: [{ id: item.id, quantity: 1 }],
      price: 0.01,
      success_url: "https://evil.example/ok",
      cancel_url: "https://evil.example/no",
    }),
  });
  assert(evilUrls.status === 400, `client URLs rejected → ${evilUrls.status}`);

  await getPool()!.query(`INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [
    buyer.id,
    seller.id,
  ]);
  const blockedList = await json("/api/shop/items", {
    headers: { Authorization: `Bearer ${buyer.token}` },
  });
  const blockedItems =
    (blockedList.body as { items?: Array<{ id?: string }> }).items || [];
  assert(!blockedItems.some((entry) => entry.id === item.id), "blocked seller hidden from buyer catalog");

  const blockedCheckout = await json("/api/shop/checkout", {
    method: "POST",
    headers: { Authorization: `Bearer ${buyer.token}` },
    body: JSON.stringify({ items: [{ id: item.id, quantity: 1 }] }),
  });
  assert([403, 404].includes(blockedCheckout.status), `blocked checkout → ${blockedCheckout.status}`);

  await getPool()!.query(`DELETE FROM blocks WHERE blocker_id = $1 AND blocked_id = $2`, [buyer.id, seller.id]);

  const idem = `p36_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const keyPrefix = (process.env.STRIPE_SECRET_KEY || "").trim().slice(0, 7);
  const checkout1 = await json("/api/shop/checkout", {
    method: "POST",
    headers: { Authorization: `Bearer ${buyer.token}` },
    body: JSON.stringify({
      items: [{ id: item.id, quantity: 2 }],
      price: 0.01,
      idempotencyKey: idem,
    }),
  });
  let stripeSandbox: "PASS" | "ENVIRONMENT_NO_TEST_KEY" | "ENVIRONMENT_503" | "FAIL" = "FAIL";
  if (checkout1.status === 200) {
    const body1 = checkout1.body as { url?: string; sessionId?: string };
    assert(typeof body1.url === "string" && body1.url.includes("stripe"), `checkout url ${body1.url}`);
    assert(typeof body1.sessionId === "string" && body1.sessionId.startsWith("cs_"), "session id");
    const checkout2 = await json("/api/shop/checkout", {
      method: "POST",
      headers: { Authorization: `Bearer ${buyer.token}` },
      body: JSON.stringify({
        items: [{ id: item.id, quantity: 2 }],
        idempotencyKey: idem,
      }),
    });
    assert(checkout2.status === 200, `idempotent retry → ${checkout2.status}`);
    const body2 = checkout2.body as { url?: string; sessionId?: string };
    assert(body2.sessionId === body1.sessionId && body2.url === body1.url, "idempotent same session");
    const pending = await getPool()!.query<{ amount_pence: number; status: string; quantity: number }>(
      `SELECT amount_pence, status, quantity FROM shop_purchases WHERE stripe_session_id = $1 AND buyer_id = $2`,
      [body1.sessionId, buyer.id],
    );
    assert(pending.rows[0]?.status === "pending", "pending purchase row");
    assert(pending.rows[0]?.quantity === 2, "qty persisted");
    assert(pending.rows[0]?.amount_pence === 2500, "server price × qty (not client £0.01)");
    // PAGE-036 requires Stripe TEST/SANDBOX proof — live keys are not sandbox PASS.
    stripeSandbox = keyPrefix === "sk_test" ? "PASS" : "ENVIRONMENT_NO_TEST_KEY";
  } else {
    assert(checkout1.status === 503, `checkout without Stripe must be 503 → ${checkout1.status}`);
    stripeSandbox = "ENVIRONMENT_503";
  }

  await json(`/api/shop/items/${item.id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${seller.token}` },
  });
  const afterDelete = await json("/api/shop/checkout", {
    method: "POST",
    headers: { Authorization: `Bearer ${buyer.token}` },
    body: JSON.stringify({ itemId: item.id, quantity: 1 }),
  });
  assert([404, 503].includes(afterDelete.status), `deleted checkout → ${afterDelete.status}`);

  console.log("PAGE-036 runtime proof PASS");
  console.log(
    JSON.stringify(
      {
        catalog: true,
        ownership: true,
        priceAuthority: true,
        blockedSeller: true,
        noClientUrls: true,
        idempotency: checkout1.status === 200,
        stripeSandbox,
        stripeKeyMode: keyPrefix || "none",
        apiBase: base,
      },
      null,
      2,
    ),
  );
} catch (err) {
  console.error("PAGE-036 runtime proof FAIL", err);
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
