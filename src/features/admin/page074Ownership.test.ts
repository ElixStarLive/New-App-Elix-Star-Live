import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ADMIN_MONETISATION_FORYOU_UNAVAILABLE, ADMIN_MONETISATION_TITLE } from "@/content/adminMonetisation";

const page = readFileSync(resolve(process.cwd(), "src/pages/admin/Monetisation.tsx"), "utf8");
const content = readFileSync(resolve(process.cwd(), "src/content/adminMonetisation.ts"), "utf8");
const api = readFileSync(resolve(process.cwd(), "src/features/admin/adminApi.ts"), "utf8");
const monetisation = readFileSync(resolve(process.cwd(), "server/modules/admin/monetisation.ts"), "utf8");
const extra = readFileSync(resolve(process.cwd(), "server/modules/app/clientRoutes.ts"), "utf8");
const settle = readFileSync(resolve(process.cwd(), "server/modules/gifts/settle.ts"), "utf8");
const reverse = readFileSync(resolve(process.cwd(), "server/modules/iap/reverse.ts"), "utf8");
const auth = readFileSync(resolve(process.cwd(), "server/middleware/auth.ts"), "utf8");
const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
const dashboard = readFileSync(resolve(process.cwd(), "src/content/adminDashboard.ts"), "utf8");
const economy = readFileSync(resolve(process.cwd(), "src/pages/admin/Economy.tsx"), "utf8");
const purchases = readFileSync(resolve(process.cwd(), "src/pages/admin/Purchases.tsx"), "utf8");
const withdrawals = readFileSync(resolve(process.cwd(), "src/pages/admin/Withdrawals.tsx"), "utf8");
const users = readFileSync(resolve(process.cwd(), "src/pages/admin/Users.tsx"), "utf8");
const reports = readFileSync(resolve(process.cwd(), "src/pages/admin/Reports.tsx"), "utf8");
const ws = readFileSync(resolve(process.cwd(), "src/lib/wsClient.ts"), "utf8");

describe("PAGE-074 Admin Monetisation ownership", () => {
  it("has one /admin/monetisation owner behind the shared admin guard", () => {
    expect(app.match(/<Route path="\/admin\/monetisation" /g)?.length).toBe(1);
    expect(app).toMatch(/<Route path="\/admin\/monetisation" element=\{<AdminMonetisation \/>\} \/>/);
    expect(app).toMatch(/<Route element=\{<RequireAdmin \/>\}>/);
    expect(ADMIN_MONETISATION_TITLE).toBe("Monetisation");
    expect(ADMIN_MONETISATION_FORYOU_UNAVAILABLE).toBe("For You config unavailable (migrate first)");
    expect(page).toMatch(/ADMIN_MONETISATION_TITLE/);
    expect(page).toMatch(/ADMIN_MONETISATION_GIFTS_TITLE/);
    expect(page).toMatch(/ADMIN_MONETISATION_REWARDS_TITLE/);
    expect(page).toMatch(/ADMIN_MONETISATION_DASHBOARD_TITLE/);
    expect(page).toMatch(/ADMIN_MONETISATION_REPORT_TITLE/);
    expect(page).toMatch(/ADMIN_MONETISATION_RECONCILE_TITLE/);
    expect(page).toMatch(/ADMIN_MONETISATION_FRAUD_TITLE/);
    expect(page).toMatch(/ADMIN_MONETISATION_FORYOU_TITLE/);
    expect(page).toMatch(/ADMIN_MONETISATION_WITHDRAWALS_TITLE/);
    expect(page).not.toMatch(/PageScaffold|AdminTablePage|LegalDocPage|history\.back|navigate\(-1\)|location\.reload|setTimeout\(|setInterval\(/);
    expect(page).not.toMatch(/WebSocket|LiveKit|localStorage|sessionStorage|impersonat/);
    expect(content).not.toMatch(/coming soon|lorem ipsum|MonetisationV2/);
  });

  it("uses Neon monetisation_config and users.is_admin only", () => {
    expect(api).toMatch(/\/api\/admin\/monetisation/);
    expect(api).toMatch(/\/api\/admin\/monetisation\/config/);
    expect(api).toMatch(/method: "PATCH"/);
    expect(api).toMatch(/body: JSON\.stringify\(\{ field, value, reason \}\)/);
    expect(monetisation).toMatch(/FROM monetisation_config/);
    expect(monetisation).toMatch(/WHERE id = 1/);
    expect(monetisation).toMatch(/gift_creator_pct/);
    expect(monetisation).toMatch(/gift_platform_pct/);
    expect(monetisation).toMatch(/gift_settlement_hours/);
    expect(monetisation).toMatch(/req\.userId/);
    expect(monetisation).not.toMatch(/new Map\(|updatedBy|adminId|ADMIN_EMAIL|elix_foryou|elix_fraud|elix_reconciliation/);
    expect(monetisation).not.toMatch(/invalidate|VALKEY|valkey/);
    expect(extra).toMatch(/handleAdminMonetisation/);
    expect(extra).toMatch(/handleAdminPatchMonetisationConfig/);
    expect(extra).toMatch(/\.patch\("\/monetisation\/config"/);
    expect(extra).not.toMatch(/SUM\(coins\).*processed_purchases GROUP BY provider/);
    expect(extra).not.toMatch(/\/settlements\/|\/reconciliation\/run|\/foryou-sweep|financial-reports\/import/);
    expect(auth).toMatch(/SELECT is_admin FROM users/);
    expect(dashboard).toMatch(/path: "\/admin\/monetisation"/);
    expect(app.indexOf("<Route element={<RequireAdmin")).toBeGreaterThan(app.indexOf("<Route element={<RequireAuth"));
    expect(settle).toMatch(/FROM monetisation_config WHERE id = 1/);
    expect(reverse).toMatch(/reverse/);
    expect(ws).toMatch(/class WsClient/);
    expect(page).not.toMatch(/new WebSocket|reconnectOnForeground/);
    expect(page).not.toMatch(/withdrawals-gbp\/.*\/status|mark-paid-manual|submit-provider/);
  });

  it("does not take PAGE-073/075/076/078 ownership or invent money mutations", () => {
    expect(page).not.toMatch(/apiAdminUpdateGiftPrice|Edit Price|apiAdminBanUser|apiAdminResolveReport/);
    expect(page).not.toMatch(/Approve|Reject|Submit Stripe|Manual offline|Run now|Run sweep|Import/);
    expect(page).not.toMatch(/feature-flags|Starter Coins|daily rewards|Rising Stars/);
    expect(economy).not.toMatch(/apiAdminPatchMonetisationConfig|giftCreatorPct/);
    expect(purchases).not.toMatch(/apiAdminPatchMonetisationConfig|giftCreatorPct/);
    expect(withdrawals).toMatch(/ADMIN_WITHDRAWALS_TITLE/);
    expect(withdrawals).not.toMatch(/apiAdminPatchMonetisationConfig|Rising Stars/);
    expect(users).not.toMatch(/apiAdminPatchMonetisationConfig/);
    expect(reports).not.toMatch(/apiAdminPatchMonetisationConfig/);
    expect(monetisation).not.toMatch(/UPDATE creator_wallet_gbp|UPDATE paid_coin_lots|UPDATE withdrawals_gbp/);
    expect(monetisation).not.toMatch(/INSERT INTO creator_earnings|reverseIap|settleGift/);
  });
});
