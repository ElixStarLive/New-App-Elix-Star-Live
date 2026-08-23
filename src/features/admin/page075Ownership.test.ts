import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ADMIN_PURCHASES_TAB_IAP, ADMIN_PURCHASES_TAB_SHOP, ADMIN_PURCHASES_TITLE } from "@/content/adminPurchases";

const page = readFileSync(resolve(process.cwd(), "src/pages/admin/Purchases.tsx"), "utf8");
const content = readFileSync(resolve(process.cwd(), "src/content/adminPurchases.ts"), "utf8");
const api = readFileSync(resolve(process.cwd(), "src/features/admin/adminApi.ts"), "utf8");
const purchases = readFileSync(resolve(process.cwd(), "server/modules/admin/purchases.ts"), "utf8");
const extra = readFileSync(resolve(process.cwd(), "server/modules/app/clientRoutes.ts"), "utf8");
const credit = readFileSync(resolve(process.cwd(), "server/modules/iap/credit.ts"), "utf8");
const reverse = readFileSync(resolve(process.cwd(), "server/modules/iap/reverse.ts"), "utf8");
const fulfill = readFileSync(resolve(process.cwd(), "server/modules/shop/fulfill.ts"), "utf8");
const auth = readFileSync(resolve(process.cwd(), "server/middleware/auth.ts"), "utf8");
const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
const dashboard = readFileSync(resolve(process.cwd(), "src/content/adminDashboard.ts"), "utf8");
const monetisation = readFileSync(resolve(process.cwd(), "src/pages/admin/Monetisation.tsx"), "utf8");
const economy = readFileSync(resolve(process.cwd(), "src/pages/admin/Economy.tsx"), "utf8");
const withdrawals = readFileSync(resolve(process.cwd(), "src/pages/admin/Withdrawals.tsx"), "utf8");
const ws = readFileSync(resolve(process.cwd(), "src/lib/wsClient.ts"), "utf8");

describe("PAGE-075 Admin Purchases ownership", () => {
  it("has one /admin/purchases owner behind the shared admin guard", () => {
    expect(app.match(/<Route path="\/admin\/purchases" /g)?.length).toBe(1);
    expect(app).toMatch(/<Route path="\/admin\/purchases" element=\{<AdminPurchases \/>\} \/>/);
    expect(app).toMatch(/<Route element=\{<RequireAdmin \/>\}>/);
    expect(ADMIN_PURCHASES_TITLE).toBe("Purchases");
    expect(ADMIN_PURCHASES_TAB_IAP).toBe("Coin IAP");
    expect(ADMIN_PURCHASES_TAB_SHOP).toBe("Shop (Stripe)");
    expect(page).toMatch(/ADMIN_PURCHASES_TITLE/);
    expect(page).toMatch(/ADMIN_PURCHASES_TAB_IAP/);
    expect(page).toMatch(/ADMIN_PURCHASES_TAB_SHOP/);
    expect(page).not.toMatch(/PageScaffold|AdminTablePage|LegalDocPage|history\.back|navigate\(-1\)|location\.reload|setTimeout\(|setInterval\(/);
    expect(page).not.toMatch(/WebSocket|LiveKit|localStorage|sessionStorage|impersonat/);
    expect(content).not.toMatch(/coming soon|lorem ipsum|PurchasesV2/);
  });

  it("reads canonical IAP and Shop tables without raw provider secrets", () => {
    expect(api).toMatch(/\/api\/admin\/iap-purchases/);
    expect(api).toMatch(/\/api\/admin\/shop-purchases/);
    expect(api).toMatch(/"raw_payload" in raw/);
    expect(api).toMatch(/"purchaseToken" in raw/);
    expect(page).not.toMatch(/raw_payload|purchaseToken|STRIPE_SECRET|client_secret/);
    expect(purchases).toMatch(/FROM processed_purchases/);
    expect(purchases).toMatch(/FROM shop_purchases/);
    expect(purchases).toMatch(/provider_txn_id AS transaction_id/);
    expect(purchases).toMatch(/buyer_id::text AS user_id/);
    expect(purchases).not.toMatch(/raw_payload|SELECT \*/);
    expect(purchases).not.toMatch(/new Map\(|updatedBy|adminId|ADMIN_EMAIL|creditVerifiedIap|verifyApple|consumePurchase/);
    expect(extra).toMatch(/handleAdminIapPurchases/);
    expect(extra).toMatch(/handleAdminShopPurchases/);
    expect(extra).toMatch(/\.get\("\/iap-purchases"/);
    expect(extra).toMatch(/\.get\("\/shop-purchases"/);
    expect(extra).not.toMatch(/SELECT \* FROM processed_purchases/);
    expect(auth).toMatch(/SELECT is_admin FROM users/);
    expect(dashboard).toMatch(/path: "\/admin\/purchases"/);
    expect(credit).toMatch(/processed_purchases/);
    expect(reverse).toMatch(/status = 'reversed'/);
    expect(fulfill).toMatch(/shop_purchases/);
    expect(ws).toMatch(/class WsClient/);
    expect(page).not.toMatch(/new WebSocket|reconnectOnForeground/);
  });

  it("does not take later admin pages or invent money mutations", () => {
    expect(page).not.toMatch(/Credit Coins|Retry Credit|Consume|Approve receipt|Capture|Refund|Mark paid/);
    expect(page).not.toMatch(/apiAdminPatchMonetisationConfig|apiAdminUpdateGiftPrice|apiAdminBanUser/);
    expect(page).not.toMatch(/withdrawals-gbp|Approve|Reject|feature-flags|Rising Stars/);
    expect(monetisation).not.toMatch(/apiFetchAdminIapPurchases|apiFetchAdminShopPurchases/);
    expect(economy).not.toMatch(/apiFetchAdminIapPurchases|apiFetchAdminShopPurchases/);
    expect(withdrawals).toMatch(/ADMIN_WITHDRAWALS_TITLE/);
    expect(withdrawals).not.toMatch(/apiFetchAdminIapPurchases|Rising Stars/);
    expect(purchases).not.toMatch(/UPDATE processed_purchases|UPDATE shop_purchases|UPDATE wallet_balances/);
    expect(purchases).not.toMatch(/INSERT INTO paid_coin_lots|creditVerifiedIap|refunds\.create/);
  });
});
