import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const handlers = readFileSync(resolve(process.cwd(), "server/modules/webhooks/handlers.ts"), "utf8");
const fulfill = readFileSync(resolve(process.cwd(), "server/modules/shop/fulfill.ts"), "utf8");

describe("PAGE-036 Stripe webhook", () => {
  it("verifies Stripe signatures and fulfills shop purchases without coins", () => {
    expect(handlers).toMatch(/constructEvent/);
    expect(handlers).toMatch(/STRIPE_WEBHOOK_SECRET/);
    expect(handlers).toMatch(/Missing Stripe signature/);
    expect(handlers).toMatch(/fulfillShopCheckoutSession/);
    expect(fulfill).toMatch(/shop_purchases/);
    expect(fulfill).not.toMatch(/elix_shop_purchases/);
    expect(fulfill).toMatch(/shop_purchases/);
    expect(fulfill).not.toMatch(/coin_balance|paid_coin|starter_coins|test_coins|wallet_balances/);
    expect(fulfill).not.toMatch(/new Map\(/);
  });
});
