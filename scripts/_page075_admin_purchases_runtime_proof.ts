/**
 * PAGE-075 runtime proof — Admin Purchases read-only IAP + Shop ledgers, no secrets/mutations.
 * Run: npx tsx scripts/_page075_admin_purchases_runtime_proof.ts
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ADMIN_PURCHASES_SUBTITLE,
  ADMIN_PURCHASES_TAB_IAP,
  ADMIN_PURCHASES_TAB_SHOP,
  ADMIN_PURCHASES_TITLE,
} from "../src/content/adminPurchases.ts";

const base = process.env.PROOF_API_BASE?.trim() || "http://127.0.0.1:8080";

async function get(path: string) {
  const res = await fetch(`${base}${path}`, { redirect: "manual" });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, text, json, cache: res.headers.get("cache-control") };
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

try {
  const page = readFileSync(resolve("src/pages/admin/Purchases.tsx"), "utf8");
  const content = readFileSync(resolve("src/content/adminPurchases.ts"), "utf8");
  const api = readFileSync(resolve("src/features/admin/adminApi.ts"), "utf8");
  const purchases = readFileSync(resolve("server/modules/admin/purchases.ts"), "utf8");
  const routes = readFileSync(resolve("server/modules/app/clientRoutes.ts"), "utf8");
  const app = readFileSync(resolve("src/App.tsx"), "utf8");
  const dashboard = readFileSync(resolve("src/content/adminDashboard.ts"), "utf8");
  const credit = readFileSync(resolve("server/modules/iap/credit.ts"), "utf8");
  const fulfill = readFileSync(resolve("server/modules/shop/fulfill.ts"), "utf8");

  assert(ADMIN_PURCHASES_TITLE === "Purchases", "title");
  assert(ADMIN_PURCHASES_TAB_IAP === "Coin IAP", "iap tab");
  assert(ADMIN_PURCHASES_TAB_SHOP === "Shop (Stripe)", "shop tab");
  assert(ADMIN_PURCHASES_SUBTITLE.includes("separate ledgers"), "subtitle");
  assert(app.includes('path="/admin/purchases"') && app.includes("<AdminPurchases"), "route");
  assert(app.includes("<RequireAdmin"), "shared RequireAdmin");
  assert(dashboard.includes('path: "/admin/purchases"'), "dashboard nav");
  assert(page.includes("apiFetchAdminIapPurchases") && page.includes("apiFetchAdminShopPurchases"), "API");
  assert(!page.includes("Refund") && !page.includes("Credit Coins") && !page.includes("Mark paid"), "read-only");
  assert(!page.includes("new WebSocket") && !page.includes("raw_payload") && !page.includes("purchaseToken"), "no secrets/ws");
  assert(api.includes("/api/admin/iap-purchases") && api.includes("/api/admin/shop-purchases"), "paths");
  assert(purchases.includes("FROM processed_purchases") && purchases.includes("FROM shop_purchases"), "Neon owners");
  assert(purchases.includes('source: "iap"') && purchases.includes('source: "shop"'), "ledger sources");
  assert(!purchases.includes("SELECT *") && !purchases.includes("raw_payload"), "minimized columns");
  assert(!purchases.includes("UPDATE processed_purchases") && !purchases.includes("UPDATE shop_purchases"), "no mutations");
  assert(routes.includes("handleAdminIapPurchases") && routes.includes("handleAdminShopPurchases"), "routes");
  assert(routes.includes("requireAdmin"), "admin gate");
  assert(credit.includes("processed_purchases"), "IAP credit owner");
  assert(fulfill.includes("shop_purchases"), "Shop fulfill owner");
  assert(content.includes("Read-only IAP + Shop"), "scope");
  assert(page.includes("prev.length === 0") || page.includes("!prev || prev.length === 0"), "keep rows on error");

  assert((await get("/api/health")).status === 200, "health");
  for (const path of ["/api/admin/iap-purchases", "/api/admin/shop-purchases"]) {
    const loggedOut = await get(path);
    assert(loggedOut.status === 401 || loggedOut.status === 403, `${path} logged-out ${loggedOut.status}`);
    assert(
      !loggedOut.json || typeof loggedOut.json !== "object" || !("data" in (loggedOut.json as object)),
      `${path} no data when logged out`,
    );
  }

  const spa = await get("/admin/purchases");
  assert([200, 304].includes(spa.status), `/admin/purchases spa ${spa.status}`);

  console.log("PAGE-075 ADMIN PURCHASES RUNTIME PROOF: PASS");
  console.log(
    JSON.stringify(
      {
        requireAdminShared: true,
        iapAndShopSeparate: true,
        readOnly: true,
        noProviderSecrets: true,
        processedPurchasesIap: true,
        shopPurchasesStripe: true,
        keepRowsOnError: true,
        noSecondWebSocket: true,
        loggedOutDenied: true,
        spaDeepLink: true,
      },
      null,
      2,
    ),
  );
  process.exit(0);
} catch (error) {
  console.error("PAGE-075 ADMIN PURCHASES RUNTIME PROOF: FAIL");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
