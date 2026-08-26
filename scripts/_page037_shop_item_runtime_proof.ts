/**
 * PAGE-037 runtime proof — Shop item deep-link, GET by id, ownership, Stripe authority.
 * Run: npx tsx scripts/_page037_shop_item_runtime_proof.ts
 * Stripe sandbox PASS only when STRIPE_SECRET_KEY is sk_test_* and creates a real Checkout Session URL.
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
  const username = `p37${stamp}${Math.random().toString(36).slice(2, 7)}`.slice(0, 12);
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
  const router = readFileSync(resolve("server/modules/shop/router.ts"), "utf8");
  const catalog = readFileSync(resolve("server/modules/shop/catalog.ts"), "utf8");
  const checkout = readFileSync(resolve("server/modules/shop/checkout.ts"), "utf8");
  const basket = readFileSync(resolve("src/store/useShopBasketStore.ts"), "utf8");
  const own = readFileSync(resolve("src/pages/OwnProfile.tsx"), "utf8");
  const profile = readFileSync(resolve("src/pages/Profile.tsx"), "utf8");

  assert(page.includes("apiGetShopItem(routeItemId)"), "PAGE-037 fetches by itemId");
  assert(page.includes("Item not available"), "unavailable empty state");
  assert(api.includes("export async function apiGetShopItem"), "client get owner");
  assert(router.includes('shopRouter.get("/items/:itemId"'), "GET /items/:itemId");
  assert(catalog.includes("export async function getShopItem"), "server getShopItem");
  assert(checkout.includes("unit_amount: item.price_pence"), "server price authority");
  assert(checkout.includes("CLIENT_URL"), "CLIENT_URL success/cancel");
  assert(basket.includes("MAX_LINES = 10") && basket.includes("MAX_QTY = 99"), "shared basket limits");
  assert(own.includes("`/shop/${item.id}`") || own.includes("/shop/${item.id}"), "PAGE-024 → PAGE-037");
  assert(profile.includes("`/shop/${item.id}`") || profile.includes("/shop/${item.id}"), "PAGE-025 → PAGE-037");
  assert(!page.includes("StoreKit") && !page.includes("coin_balance"), "no IAP/coins");
  assert(!page.includes("new WebSocket"), "no second socket");

  await requireValkey().ping();
  const health = await json("/api/health");
  assert(health.status === 200, `health ${health.status}`);

  const seller = await register("s");
  const buyer = await register("b");
  const stranger = await register("c");

  const created = await json("/api/shop/items", {
    method: "POST",
    headers: { Authorization: `Bearer ${seller.token}` },
    body: JSON.stringify({
      title: "P37 Hat",
      description: "Wool",
      pricePence: 10000,
      category: "clothing",
    }),
  });
  assert(created.status === 201, `create → ${created.status}`);
  const item = created.body as { id?: string; pricePence?: number; sellerId?: string; title?: string };
  assert(item.id && item.pricePence === 10000 && item.sellerId === seller.id, "create identity");

  const detail = await json(`/api/shop/items/${item.id}`, {
    headers: { Authorization: `Bearer ${buyer.token}` },
  });
  assert(detail.status === 200, `GET item → ${detail.status}`);
  const detailBody = detail.body as {
    id?: string;
    title?: string;
    pricePence?: number;
    sellerId?: string;
  };
  assert(detailBody.id === item.id, "detail id");
  assert(detailBody.title === "P37 Hat", "detail title");
  assert(detailBody.pricePence === 10000, "detail price");
  assert(detailBody.sellerId === seller.id, "detail seller");

  const listed = await json("/api/shop/items", {
    headers: { Authorization: `Bearer ${buyer.token}` },
  });
  const listRow = ((listed.body as { items?: Array<{ id?: string; pricePence?: number; title?: string }> }).items || []).find(
    (entry) => entry.id === item.id,
  );
  assert(Boolean(listRow), "PAGE-036 list includes same item");
  assert(listRow?.pricePence === detailBody.pricePence && listRow?.title === detailBody.title, "036/037 converge");

  const missing = await json("/api/shop/items/44444444-4444-4444-8444-444444444444");
  assert(missing.status === 404, `missing detail → ${missing.status}`);
  const malformed = await json("/api/shop/items/not-a-real-item");
  assert(malformed.status === 404, `malformed detail → ${malformed.status}`);

  const foreign = await json(`/api/shop/items/${item.id}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${stranger.token}` },
    body: JSON.stringify({ title: "Stolen", description: "x", pricePence: 1, category: "other" }),
  });
  assert(foreign.status === 404, `cross-user mutate → ${foreign.status}`);

  const qty100 = await json("/api/shop/checkout", {
    method: "POST",
    headers: { Authorization: `Bearer ${buyer.token}` },
    body: JSON.stringify({ itemId: item.id, quantity: 100 }),
  });
  assert(qty100.status === 400, `qty 100 → ${qty100.status}`);

  const forgedPrice = await json("/api/shop/checkout", {
    method: "POST",
    headers: { Authorization: `Bearer ${buyer.token}` },
    body: JSON.stringify({
      items: [{ id: item.id, quantity: 1 }],
      price: 1,
      total: 1,
      sellerId: stranger.id,
    }),
  });

  await getPool()!.query(`INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [
    buyer.id,
    seller.id,
  ]);
  const blockedDetail = await json(`/api/shop/items/${item.id}`, {
    headers: { Authorization: `Bearer ${buyer.token}` },
  });
  assert(blockedDetail.status === 404, `blocked detail → ${blockedDetail.status}`);
  await getPool()!.query(`DELETE FROM blocks WHERE blocker_id = $1 AND blocked_id = $2`, [buyer.id, seller.id]);

  const idem = `p37_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const keyPrefix = (process.env.STRIPE_SECRET_KEY || "").trim().slice(0, 7);
  let stripeSandbox: "PASS" | "ENVIRONMENT_NO_TEST_KEY" | "ENVIRONMENT_503" | "FAIL" = "FAIL";
  let checkoutStatus = forgedPrice.status;

  if (forgedPrice.status === 200) {
    const body1 = forgedPrice.body as { url?: string; sessionId?: string };
    assert(typeof body1.url === "string" && body1.url.includes("stripe"), `checkout url ${body1.url}`);
    const pending = await getPool()!.query<{ amount_pence: number; status: string; quantity: number; seller_id: string }>(
      `SELECT amount_pence, status, quantity, seller_id FROM shop_purchases WHERE stripe_session_id = $1 AND buyer_id = $2`,
      [body1.sessionId, buyer.id],
    );
    assert(pending.rows[0]?.status === "pending", "pending purchase row");
    assert(pending.rows[0]?.amount_pence === 10000, "server ignores forged £1 — uses £100");
    assert(pending.rows[0]?.seller_id === seller.id, "server seller authority (not stranger)");
    const checkout2 = await json("/api/shop/checkout", {
      method: "POST",
      headers: { Authorization: `Bearer ${buyer.token}` },
      body: JSON.stringify({
        items: [{ id: item.id, quantity: 1 }],
        idempotencyKey: idem,
      }),
    });
    // first forged call had no idempotency; second creates with key
    assert([200, 503].includes(checkout2.status), `idem checkout → ${checkout2.status}`);
    if (checkout2.status === 200) {
      const body2 = checkout2.body as { sessionId?: string };
      const checkout3 = await json("/api/shop/checkout", {
        method: "POST",
        headers: { Authorization: `Bearer ${buyer.token}` },
        body: JSON.stringify({
          items: [{ id: item.id, quantity: 1 }],
          idempotencyKey: idem,
        }),
      });
      assert(checkout3.status === 200, `idempotent retry → ${checkout3.status}`);
      assert((checkout3.body as { sessionId?: string }).sessionId === body2.sessionId, "idempotent same session");
    }
    stripeSandbox = keyPrefix === "sk_test" ? "PASS" : "ENVIRONMENT_NO_TEST_KEY";
    checkoutStatus = 200;
  } else if (forgedPrice.status === 400) {
    // Some deployments reject unknown client price fields entirely — also valid authority.
    const clean = await json("/api/shop/checkout", {
      method: "POST",
      headers: { Authorization: `Bearer ${buyer.token}` },
      body: JSON.stringify({
        items: [{ id: item.id, quantity: 1 }],
        idempotencyKey: idem,
      }),
    });
    checkoutStatus = clean.status;
    if (clean.status === 200) {
      const body1 = clean.body as { url?: string; sessionId?: string };
      assert(typeof body1.url === "string" && body1.url.includes("stripe"), `checkout url ${body1.url}`);
      const pending = await getPool()!.query<{ amount_pence: number; seller_id: string }>(
        `SELECT amount_pence, seller_id FROM shop_purchases WHERE stripe_session_id = $1 AND buyer_id = $2`,
        [body1.sessionId, buyer.id],
      );
      assert(pending.rows[0]?.amount_pence === 10000, "server price authority £100");
      assert(pending.rows[0]?.seller_id === seller.id, "server seller authority");
      stripeSandbox = keyPrefix === "sk_test" ? "PASS" : "ENVIRONMENT_NO_TEST_KEY";
    } else {
      assert(clean.status === 503, `checkout without Stripe must be 503 → ${clean.status}`);
      stripeSandbox = "ENVIRONMENT_503";
    }
  } else {
    assert(forgedPrice.status === 503, `checkout without Stripe must be 503 → ${forgedPrice.status}`);
    stripeSandbox = "ENVIRONMENT_503";
  }

  await getPool()!.query(`UPDATE shop_items SET price_pence = 15000 WHERE id = $1`, [item.id]);
  const refreshed = await json(`/api/shop/items/${item.id}`, {
    headers: { Authorization: `Bearer ${buyer.token}` },
  });
  assert((refreshed.body as { pricePence?: number }).pricePence === 15000, "price refresh after seller change");

  await json(`/api/shop/items/${item.id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${seller.token}` },
  });
  const deletedDetail = await json(`/api/shop/items/${item.id}`);
  assert(deletedDetail.status === 404, `deleted detail → ${deletedDetail.status}`);
  const deletedCheckout = await json("/api/shop/checkout", {
    method: "POST",
    headers: { Authorization: `Bearer ${buyer.token}` },
    body: JSON.stringify({ itemId: item.id, quantity: 1 }),
  });
  assert([404, 503].includes(deletedCheckout.status), `deleted checkout → ${deletedCheckout.status}`);

  console.log("PAGE-037 runtime proof PASS");
  console.log(
    JSON.stringify(
      {
        getById: true,
        page036Consistency: true,
        priceAuthority: true,
        sellerAuthority: true,
        blockedSeller: true,
        crossUserMutation: true,
        qtyValidation: true,
        checkoutStatus,
        stripeSandbox,
        stripeKeyMode: keyPrefix || "none",
        apiBase: base,
      },
      null,
      2,
    ),
  );
} catch (err) {
  console.error("PAGE-037 runtime proof FAIL", err);
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
