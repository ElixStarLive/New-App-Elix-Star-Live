import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(resolve(process.cwd(), "src/pages/PurchaseCoins.tsx"), "utf8");
const modal = readFileSync(resolve(process.cwd(), "src/components/BuyCoinsModal.tsx"), "utf8");
const live = readFileSync(resolve(process.cwd(), "src/features/live/LiveRoomScreen.tsx"), "utf8");
const api = readFileSync(resolve(process.cwd(), "src/features/iap/iapApi.ts"), "utf8");
const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
const index = readFileSync(resolve(process.cwd(), "server/index.ts"), "utf8");
const credit = readFileSync(resolve(process.cwd(), "server/modules/iap/credit.ts"), "utf8");
const iapRouter = readFileSync(resolve(process.cwd(), "server/modules/iap/router.ts"), "utf8");
const walletRouter = readFileSync(resolve(process.cwd(), "server/modules/wallet/router.ts"), "utf8");
const shopCheckout = readFileSync(resolve(process.cwd(), "server/modules/shop/checkout.ts"), "utf8");

describe("PAGE-038 Purchase Coins ownership", () => {
  it("owns /purchase-coins with one Apple/Google verify path and no Stripe coins", () => {
    expect(app.match(/path="\/purchase-coins"/g)?.length).toBe(1);
    expect(page).toMatch(/RoyceBackIcon/);
    expect(page).toMatch(/Get Coins/);
    expect(page).toMatch(/Purchase Coins in the App/);
    expect(page).toMatch(/purchaseCoinProduct/);
    expect(page).not.toMatch(/location\.reload|PurchaseCoinsV2|IAPFixed|setTimeout\(/);
    expect(page).not.toMatch(/\/api\/shop\/checkout|openStripeCheckoutUrl/);
    expect(modal).toMatch(/export function BuyCoinsModal/);
    expect(modal).toMatch(/purchaseCoinProduct/);
    expect(modal).toMatch(/Recharge Coins/);
    expect(modal).not.toMatch(/\/api\/shop\/checkout|openStripeCheckoutUrl|testCoins|coin_balance/);
    expect(live).toMatch(/BuyCoinsModal/);
    expect(live).toMatch(/Top Up/);
    expect(api).toMatch(/\/api\/coin-packages/);
    expect(api).toMatch(/\/api\/verify-purchase/);
    expect(api).toMatch(/purchaseLock/);
    expect(api).not.toMatch(/\/api\/iap\/verify|\/api\/wallet\/iap\/verify|data\.products/);
    expect(api).not.toMatch(/stripe|Stripe|sk_live|APPLE_IAP_KEY|GOOGLE_SERVICE_ACCOUNT/);
    expect(index).toMatch(/app\.get\("\/api\/coin-packages"/);
    expect(index).toMatch(/app\.post\("\/api\/verify-purchase"/);
    expect(index).not.toMatch(/app\.use\("\/api\/iap"/);
    expect(index).not.toMatch(/\/api\/iap\/verify/);
    expect(index).not.toMatch(/\/api\/chat/);
    expect(iapRouter).not.toMatch(/router\.(get|post)\("/);
    expect(walletRouter).not.toMatch(/iap\/verify/);
    expect(credit).toMatch(/processed_purchases/);
    expect(credit).toMatch(/insertPaidCoinLot/);
    expect(credit).toMatch(/bucket: "paid"/);
    expect(credit).toMatch(/Transaction belongs to another account/);
    expect(shopCheckout).not.toMatch(/paid_coin_lots|coin_packages|verify-purchase/);
  });
});
