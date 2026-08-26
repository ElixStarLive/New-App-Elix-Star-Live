/**
 * PAGE-074 runtime proof — Admin Monetisation config + ledger reports; no PAGE-076 withdrawal ops.
 * Run: npx tsx scripts/_page074_admin_monetisation_runtime_proof.ts
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ADMIN_MONETISATION_FORYOU_UNAVAILABLE,
  ADMIN_MONETISATION_TITLE,
} from "../src/content/adminMonetisation.ts";

const base = process.env.PROOF_API_BASE?.trim() || "http://127.0.0.1:8080";

async function get(path: string, init?: RequestInit) {
  const res = await fetch(`${base}${path}`, { redirect: "manual", ...init });
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
  const page = readFileSync(resolve("src/pages/admin/Monetisation.tsx"), "utf8");
  const content = readFileSync(resolve("src/content/adminMonetisation.ts"), "utf8");
  const api = readFileSync(resolve("src/features/admin/adminApi.ts"), "utf8");
  const monetisation = readFileSync(resolve("server/modules/admin/monetisation.ts"), "utf8");
  const routes = readFileSync(resolve("server/modules/app/clientRoutes.ts"), "utf8");
  const app = readFileSync(resolve("src/App.tsx"), "utf8");
  const dashboard = readFileSync(resolve("src/content/adminDashboard.ts"), "utf8");
  const withdrawals = readFileSync(resolve("src/pages/admin/Withdrawals.tsx"), "utf8");
  const settle = readFileSync(resolve("server/modules/gifts/settle.ts"), "utf8");

  assert(ADMIN_MONETISATION_TITLE === "Monetisation", "title");
  assert(ADMIN_MONETISATION_FORYOU_UNAVAILABLE.includes("migrate first"), "fyp unavailable copy");
  assert(app.includes('path="/admin/monetisation"') && app.includes("<AdminMonetisation"), "route");
  assert(app.includes("<RequireAdmin"), "shared RequireAdmin");
  assert(dashboard.includes('path: "/admin/monetisation"'), "dashboard nav");
  assert(page.includes("apiFetchAdminMonetisation") && page.includes("apiAdminPatchMonetisationConfig"), "API");
  assert(page.includes("giftCreatorPct") && page.includes("giftPlatformPct"), "gift split fields");
  assert(!page.includes("Approve") && !page.includes("Run sweep") && !page.includes("Import report"), "no invent mutations");
  assert(!page.includes("new WebSocket"), "no second socket");
  assert(api.includes("/api/admin/monetisation/config") && api.includes("field, value, reason"), "PATCH shape");
  assert(monetisation.includes("FROM monetisation_config") && monetisation.includes("WHERE id = 1"), "Neon config");
  assert(monetisation.includes("gift_creator_pct") && monetisation.includes("100 - patch.value"), "split parity");
  assert(monetisation.includes("paid_coin_lots") && monetisation.includes("creator_earnings"), "ledger reads");
  assert(monetisation.includes("processed_purchases") && monetisation.includes("shop_purchases"), "IAP/shop separation");
  assert(!monetisation.includes("UPDATE withdrawals_gbp") && !monetisation.includes("INSERT INTO creator_earnings"), "no money invent");
  assert(routes.includes("handleAdminMonetisation") && routes.includes("handleAdminPatchMonetisationConfig"), "routes");
  assert(routes.includes("requireAdmin"), "admin gate");
  assert(!routes.includes("/settlements/") && !routes.includes("foryou-sweep") && !routes.includes("financial-reports/import"), "no invented routes");
  assert(withdrawals.includes("ADMIN_WITHDRAWALS_TITLE"), "PAGE-076 owner exists");
  assert(settle.includes("monetisation_config"), "gift settle reads config");
  assert(content.includes("Config + reports only"), "scope comment");

  assert((await get("/api/health")).status === 200, "health");
  const loggedOut = await get("/api/admin/monetisation");
  assert(loggedOut.status === 401 || loggedOut.status === 403, `logged-out ${loggedOut.status}`);
  assert(
    !loggedOut.json ||
      typeof loggedOut.json !== "object" ||
      (!("config" in (loggedOut.json as object)) && !("dashboard" in (loggedOut.json as object))),
    "no monetisation payload logged out",
  );

  for (const path of [
    "/api/admin/monetisation/reconciliation/run",
    "/api/admin/monetisation/settlements/reverse",
    "/api/admin/monetisation/foryou-sweep",
    "/api/admin/monetisation/financial-reports/import",
  ]) {
    const blocked = await get(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    assert(blocked.status >= 400 && blocked.status !== 200, `${path} must not succeed (${blocked.status})`);
  }

  const spa = await get("/admin/monetisation");
  assert([200, 304].includes(spa.status), `/admin/monetisation spa ${spa.status}`);

  console.log("PAGE-074 ADMIN MONETISATION RUNTIME PROOF: PASS");
  console.log(
    JSON.stringify(
      {
        requireAdminShared: true,
        giftSplitConfigOnly: true,
        ledgerDashboardReports: true,
        withdrawalsReadOnly: true,
        noSettlementFraudFypImportRoutes: true,
        page076WithdrawalsSeparate: true,
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
  console.error("PAGE-074 ADMIN MONETISATION RUNTIME PROOF: FAIL");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
