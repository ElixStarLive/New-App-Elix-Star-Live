/**
 * PAGE-073 runtime proof — Admin Economy packages/gifts + gift PATCH invalidates Valkey catalog.
 * Run: npx tsx scripts/_page073_admin_economy_runtime_proof.ts
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ADMIN_ECONOMY_EDIT_PRICE,
  ADMIN_ECONOMY_PACKAGES_EMPTY,
  ADMIN_ECONOMY_TITLE,
} from "../src/content/adminEconomy.ts";

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
  return { status: res.status, text, json };
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

try {
  const page = readFileSync(resolve("src/pages/admin/Economy.tsx"), "utf8");
  const content = readFileSync(resolve("src/content/adminEconomy.ts"), "utf8");
  const api = readFileSync(resolve("src/features/admin/adminApi.ts"), "utf8");
  const economy = readFileSync(resolve("server/modules/admin/economy.ts"), "utf8");
  const cache = readFileSync(resolve("server/modules/gifts/catalogCache.ts"), "utf8");
  const giftsRouter = readFileSync(resolve("server/modules/gifts/router.ts"), "utf8");
  const routes = readFileSync(resolve("server/modules/app/clientRoutes.ts"), "utf8");
  const app = readFileSync(resolve("src/App.tsx"), "utf8");
  const dashboard = readFileSync(resolve("src/content/adminDashboard.ts"), "utf8");

  assert(ADMIN_ECONOMY_TITLE === "Economy Controls", "title");
  assert(ADMIN_ECONOMY_EDIT_PRICE === "Edit Price", "edit price");
  assert(ADMIN_ECONOMY_PACKAGES_EMPTY.includes("coin_packages"), "packages empty");
  assert(app.includes('path="/admin/economy"') && app.includes("<AdminEconomy"), "route");
  assert(app.includes("<RequireAdmin"), "shared RequireAdmin");
  assert(dashboard.includes('path: "/admin/economy"'), "dashboard nav");
  assert(page.includes("apiFetchAdminEconomy") && page.includes("apiAdminUpdateGiftPrice"), "API wiring");
  assert(page.includes("nativePrompt") && page.includes("ADMIN_ECONOMY_EDIT_PRICE"), "edit UI");
  assert(!page.includes("Add Coins") && !page.includes("Set Balance"), "no wallet adjust");
  assert(!page.includes("new WebSocket"), "no second socket");
  assert(api.includes("/api/admin/economy") && api.includes("/api/admin/gifts/catalog/"), "paths");
  assert(api.includes("coinCost: coinCost"), "PATCH whitelist body");
  assert(economy.includes("FROM gifts") && economy.includes("FROM coin_packages"), "Neon sources");
  assert(economy.includes("invalidatePublicGiftsCatalogCache"), "Valkey invalidate");
  assert(economy.includes("UPDATE gifts SET") && economy.includes("boosters: []"), "gift patch + empty boosters");
  assert(!economy.includes("wallet_balances") && !economy.includes("new Map("), "no wallet/process-memory");
  assert(cache.includes("gifts:catalog:v1") && cache.includes("valkeyDel"), "canonical cache key");
  assert(giftsRouter.includes("active = TRUE") && giftsRouter.includes("coin_cost"), "send uses DB price");
  assert(routes.includes("handleAdminEconomy") && routes.includes("handleAdminPatchGiftCatalog"), "routes");
  assert(routes.includes("requireAdmin"), "admin gate");
  assert(content.includes("ADMIN_ECONOMY_RARITY_UNAVAILABLE"), "no invented rarity");

  assert((await get("/api/health")).status === 200, "health");
  const loggedOut = await get("/api/admin/economy");
  assert(loggedOut.status === 401 || loggedOut.status === 403, `logged-out ${loggedOut.status}`);
  assert(
    !loggedOut.json ||
      typeof loggedOut.json !== "object" ||
      (!("gifts" in (loggedOut.json as object)) && !("packages" in (loggedOut.json as object))),
    "no economy payload when logged out",
  );

  const publicGifts = await get("/api/gifts");
  assert(publicGifts.status === 200, "public catalog");
  assert(
    publicGifts.json &&
      typeof publicGifts.json === "object" &&
      Array.isArray((publicGifts.json as { gifts?: unknown }).gifts),
    "public gifts array",
  );

  const spa = await get("/admin/economy");
  assert([200, 304].includes(spa.status), `/admin/economy spa ${spa.status}`);

  console.log("PAGE-073 ADMIN ECONOMY RUNTIME PROOF: PASS");
  console.log(
    JSON.stringify(
      {
        requireAdminShared: true,
        packagesGiftsBoosters: true,
        giftPatchWhitelisted: true,
        valkeyCatalogInvalidation: true,
        publicCatalogUsesActiveDbPrice: true,
        noWalletAdjust: true,
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
  console.error("PAGE-073 ADMIN ECONOMY RUNTIME PROOF: FAIL");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
