import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ADMIN_ECONOMY_PACKAGES_EMPTY,
  ADMIN_ECONOMY_TITLE,
} from "@/content/adminEconomy";

const page = readFileSync(resolve(process.cwd(), "src/pages/admin/Economy.tsx"), "utf8");
const content = readFileSync(resolve(process.cwd(), "src/content/adminEconomy.ts"), "utf8");
const api = readFileSync(resolve(process.cwd(), "src/features/admin/adminApi.ts"), "utf8");
const economy = readFileSync(resolve(process.cwd(), "server/modules/admin/economy.ts"), "utf8");
const extra = readFileSync(resolve(process.cwd(), "server/modules/app/clientRoutes.ts"), "utf8");
const gifts = readFileSync(resolve(process.cwd(), "server/modules/gifts/router.ts"), "utf8");
const catalog = readFileSync(resolve(process.cwd(), "server/modules/gifts/catalog.ts"), "utf8");
const cache = readFileSync(resolve(process.cwd(), "server/modules/gifts/catalogCache.ts"), "utf8");
const settle = readFileSync(resolve(process.cwd(), "server/modules/gifts/settle.ts"), "utf8");
const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
const dashboard = readFileSync(resolve(process.cwd(), "src/content/adminDashboard.ts"), "utf8");
const users = readFileSync(resolve(process.cwd(), "src/pages/admin/Users.tsx"), "utf8");
const reports = readFileSync(resolve(process.cwd(), "src/pages/admin/Reports.tsx"), "utf8");
const auth = readFileSync(resolve(process.cwd(), "server/middleware/auth.ts"), "utf8");
const ws = readFileSync(resolve(process.cwd(), "src/lib/wsClient.ts"), "utf8");
const monetisation = readFileSync(resolve(process.cwd(), "src/pages/admin/Monetisation.tsx"), "utf8");

describe("PAGE-073 Admin Economy ownership", () => {
  it("has one /admin/economy owner behind the shared admin guard", () => {
    expect(app.match(/<Route path="\/admin\/economy" /g)?.length).toBe(1);
    expect(app).toMatch(/<Route path="\/admin\/economy" element=\{<AdminEconomy \/>\} \/>/);
    expect(app).toMatch(/<Route element=\{<RequireAdmin \/>\}>/);
    expect(ADMIN_ECONOMY_TITLE).toBe("Economy Controls");
    expect(ADMIN_ECONOMY_PACKAGES_EMPTY).toBe("No coin packages found in coin_packages.");
    expect(page).toMatch(/ADMIN_ECONOMY_TITLE/);
    expect(page).toMatch(/ADMIN_ECONOMY_GIFTS_TITLE/);
    expect(page).toMatch(/ADMIN_ECONOMY_EDIT_PRICE/);
    expect(page).toMatch(/nativePrompt/);
    expect(page).not.toMatch(/PageScaffold|AdminTablePage|LegalDocPage|history\.back|navigate\(-1\)|location\.reload|setTimeout\(|setInterval\(/);
    expect(page).not.toMatch(/WebSocket|LiveKit|localStorage|sessionStorage|impersonat|Add Coins|Remove Coins|Set Balance/);
    expect(content).not.toMatch(/coming soon|lorem ipsum|EconomyV2/);
  });

  it("uses the established admin economy and gift PATCH contract on users.is_admin", () => {
    expect(api).toMatch(/\/api\/admin\/economy/);
    expect(api).toMatch(/\/api\/admin\/gifts\/catalog\//);
    expect(api).toMatch(/method: "PATCH"/);
    expect(api).toMatch(/body: JSON\.stringify\(\{ coin_cost: coinCost \}\)/);
    expect(economy).toMatch(/ADMIN_GIFT_COIN_COST_MAX = 10_000_000/);
    expect(economy).toMatch(/FROM gifts/);
    expect(economy).toMatch(/FROM coin_packages/);
    expect(economy).toMatch(/boosters: \[\]/);
    expect(economy).toMatch(/invalidatePublicGiftsCatalogCache/);
    expect(economy).toMatch(/UPDATE gifts SET/);
    expect(economy).toMatch(/WHERE id = /);
    expect(economy).not.toMatch(/wallet_balances|paid_coins|promo_coins|starter_coins|elix_gifts|new Map\(/);
    expect(economy).not.toMatch(/updatedBy|adminId|is_admin =/);
    expect(extra).toMatch(/handleAdminEconomy/);
    expect(extra).toMatch(/handleAdminPatchGiftCatalog/);
    expect(extra).toMatch(/\.patch\("\/gifts\/catalog\/:giftId"/);
    expect(extra).not.toMatch(/SUM\(paid_coins\)/);
    expect(auth).toMatch(/SELECT is_admin FROM users/);
    expect(dashboard).toMatch(/path: "\/admin\/economy"/);
    expect(gifts).toMatch(/loadPublicGiftsCatalog/);
    expect(gifts).toMatch(/SELECT id, coin_cost/);
    expect(gifts).toMatch(/WHERE id = \$1 AND active = TRUE/);
    expect(catalog).toMatch(/FROM gifts/);
    expect(catalog).toMatch(/active = TRUE/);
    expect(cache).toMatch(/elix:gifts:catalog:v1/);
    expect(cache).not.toMatch(/new Map\(/);
    expect(settle).toMatch(/gift_creator_pct/);
    expect(ws).toMatch(/class WsClient/);
    expect(page).not.toMatch(/new WebSocket|reconnectOnForeground/);
  });

  it("does not implement later admin child pages or user/report mutations", () => {
    expect(page).not.toMatch(/apiAdminBanUser|apiAdminResolveReport|feature-flags|withdrawals-gbp/);
    expect(page).not.toMatch(/AdminTablePage|Monetisation|Rising Stars|Starter Coins & XP/);
    expect(page).not.toMatch(/creator split|gift_creator_pct|IAP & Shop/);
    expect(users).not.toMatch(/ADMIN_ECONOMY_TITLE|apiAdminUpdateGiftPrice|Edit Price/);
    expect(reports).not.toMatch(/ADMIN_ECONOMY_TITLE|apiAdminUpdateGiftPrice|Edit Price/);
    expect(monetisation).not.toMatch(/AdminTablePage|apiAdminUpdateGiftPrice|Edit Price/);
  });
});
