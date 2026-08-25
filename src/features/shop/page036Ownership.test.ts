import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(resolve(process.cwd(), "src/pages/Shop.tsx"), "utf8");
const api = readFileSync(resolve(process.cwd(), "src/features/shop/shopApi.ts"), "utf8");
const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
const checkout = readFileSync(resolve(process.cwd(), "server/modules/shop/checkout.ts"), "utf8");
const catalog = readFileSync(resolve(process.cwd(), "server/modules/shop/catalog.ts"), "utf8");
const webhook = readFileSync(resolve(process.cwd(), "server/modules/webhooks/handlers.ts"), "utf8");
const index = readFileSync(resolve(process.cwd(), "server/index.ts"), "utf8");

describe("PAGE-036 Shop ownership", () => {
  it("owns /shop with one Stripe checkout and no IAP or coins", () => {
    expect(app.match(/path="\/shop"/g)?.length).toBe(1);
    expect(app).toMatch(/path="\/shop\/:itemId"/);
    expect(page).toMatch(/apiListShopItems/);
    expect(page).toMatch(/apiShopCheckout/);
    expect(page).toMatch(/Checkout with Stripe/);
    expect(page).toMatch(/RoyceBackIcon/);
    expect(page).toMatch(/ShopBasketIcon/);
    expect(page).not.toMatch(/new WebSocket|ShopV2|ShopFixed|location\.reload|verify-purchase|StoreKit|Play Billing|coin_balance|testCoins|apiStartShopCheckout/);
    expect(api).toMatch(/\/api\/shop\/checkout/);
    expect(api).toMatch(/idempotencyKey/);
    expect(api).not.toMatch(/sk_live|sk_test|STRIPE_SECRET|webhook secret/);
    expect(checkout).toMatch(/CLIENT_URL/);
    expect(checkout).toMatch(/purchase=success/);
    expect(checkout).toMatch(/purchase=cancelled/);
    expect(checkout).toMatch(/Checkout URLs are server-owned/);
    expect(checkout).toMatch(/unit_amount: item\.price_pence/);
    expect(catalog).toMatch(/seller_id = \$2/);
    expect(catalog).toMatch(/sellerId: row\.seller_id/);
    expect(catalog).not.toMatch(/user_id: row\.seller_id/);
    expect(catalog).not.toMatch(/image_url: row\.image_url/);
    expect(catalog).not.toMatch(/req\.query\.user_id/);
    expect(checkout).toMatch(/paymentStatus: session\.payment_status/);
    expect(checkout).not.toMatch(/payment_status: session\.payment_status/);
    expect(webhook).toMatch(/fulfillShopCheckoutSession/);
    expect(index).toMatch(/app\.use\("\/api\/shop", shopRouter\)/);
    expect(index).not.toMatch(/shopCheckout/);
  });
});
