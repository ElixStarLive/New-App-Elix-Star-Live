import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(resolve(process.cwd(), "src/pages/Shop.tsx"), "utf8");
const api = readFileSync(resolve(process.cwd(), "src/features/shop/shopApi.ts"), "utf8");
const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
const nav = readFileSync(resolve(process.cwd(), "src/lib/settingsNav.ts"), "utf8");
const router = readFileSync(resolve(process.cwd(), "server/modules/shop/router.ts"), "utf8");

describe("PAGE-037 Shop item ownership", () => {
  it("reuses PAGE-036 Shop on /shop/:itemId with one canonical route itemId", () => {
    expect(app.match(/path="\/shop\/:itemId"/g)?.length).toBe(1);
    expect(app).not.toMatch(/path="\/product\//);
    expect(app).not.toMatch(/path="\/store\//);
    expect(app).not.toMatch(/path="\/shop\/item\//);
    expect(page).toMatch(/useParams/);
    expect(page).toMatch(/canonicalShopRouteItemId\(params\.itemId\)/);
    expect(page).toMatch(/selectShopItemByCanonicalId\(catalog, routeItemId\)/);
    expect(page).not.toMatch(/itemId \|\| productId/);
    expect(page).not.toMatch(/selectedItem\?\.id/);
    expect(page).not.toMatch(/ShopItemV2|ShopItemFixed|location\.reload|setTimeout\(/);
    expect(page).not.toMatch(/verify-purchase|StoreKit|Play Billing|testCoins|coin_balance/);
    expect(api).toMatch(/export function canonicalShopRouteItemId/);
    expect(api).toMatch(/export function selectShopItemByCanonicalId/);
    expect(api).toMatch(/\/api\/shop\/checkout/);
    expect(api).not.toMatch(/\/api\/shop\/:itemId\/checkout/);
    expect(router).toMatch(/shopRouter\.post\("\/checkout"/);
    expect(router).not.toMatch(/shopRouter\.post\("\/:itemId\/checkout"/);
    expect(nav).toMatch(/export const SHOP_HOME = "\/shop"/);
    expect(nav).toMatch(/if \(path === SHOP_HOME\) return SHOP_EXIT_TO/);
    expect(nav).toMatch(/if \(path\.startsWith\(`\$\{SHOP_HOME\}\/`\)\) return SHOP_HOME/);
  });
});
