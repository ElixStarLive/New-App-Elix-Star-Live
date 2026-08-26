/**
 * PAGE-076 runtime proof — Admin Withdrawals manual review rail on withdrawals_gbp.
 * Run: npx tsx scripts/_page076_admin_withdrawals_runtime_proof.ts
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ADMIN_WITHDRAWAL_ACTION_LABELS,
  ADMIN_WITHDRAWAL_TABS,
  ADMIN_WITHDRAWALS_SUBTITLE,
  ADMIN_WITHDRAWALS_TITLE,
} from "../src/content/adminWithdrawals.ts";

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
  const page = readFileSync(resolve("src/pages/admin/Withdrawals.tsx"), "utf8");
  const content = readFileSync(resolve("src/content/adminWithdrawals.ts"), "utf8");
  const api = readFileSync(resolve("src/features/admin/adminApi.ts"), "utf8");
  const withdrawals = readFileSync(resolve("server/modules/admin/withdrawals.ts"), "utf8");
  const service = readFileSync(resolve("server/modules/payouts/service.ts"), "utf8");
  const routes = readFileSync(resolve("server/modules/app/clientRoutes.ts"), "utf8");
  const app = readFileSync(resolve("src/App.tsx"), "utf8");
  const dashboard = readFileSync(resolve("src/content/adminDashboard.ts"), "utf8");
  const monetisation = readFileSync(resolve("server/modules/admin/monetisation.ts"), "utf8");
  const purchases = readFileSync(resolve("server/modules/admin/purchases.ts"), "utf8");

  assert(ADMIN_WITHDRAWALS_TITLE === "Withdrawals", "title");
  assert(ADMIN_WITHDRAWALS_SUBTITLE.includes("Manual review only"), "subtitle");
  assert(ADMIN_WITHDRAWAL_TABS.includes("pending") && ADMIN_WITHDRAWAL_TABS.includes("all"), "tabs");
  assert(ADMIN_WITHDRAWAL_ACTION_LABELS["mark-paid"] === "Mark paid manually", "mark-paid label");
  assert(app.includes('path="/admin/withdrawals"') && app.includes("<AdminWithdrawals"), "route");
  assert(app.includes("<RequireAdmin"), "shared RequireAdmin");
  assert(dashboard.includes('path: "/admin/withdrawals"'), "dashboard nav");
  assert(page.includes("apiFetchAdminWithdrawals") && page.includes("apiAdminWithdrawalAction"), "API");
  assert(!page.includes("Chargeback") && !page.includes("Unfreeze") && !page.includes("Submit Stripe"), "no invented UI");
  assert(!page.includes("new WebSocket"), "no second WS");
  assert(page.includes("prev.length === 0") || page.includes("!prev || prev.length === 0"), "keep rows on error");
  assert(api.includes("/api/admin/withdrawals"), "list path");
  assert(withdrawals.includes("FROM withdrawals_gbp") && withdrawals.includes("FOR UPDATE"), "Neon lock");
  assert(withdrawals.includes("hold_to_withdrawn") && withdrawals.includes("hold_to_available"), "money effects");
  assert(withdrawals.includes("paid_manually") && withdrawals.includes("under_review"), "statuses");
  assert(withdrawals.includes("handleAdminChargeback") && withdrawals.includes("handleAdminUnfreeze"), "sibling APIs");
  assert(!withdrawals.includes("payouts.create") && !withdrawals.includes("sk_live"), "no Stripe rail");
  assert(service.includes("held_pence = held_pence + $2") && service.includes("withdrawal_hold:"), "PAGE-045 hold");
  assert(routes.includes("handleAdminWithdrawals") && routes.includes("requireAdmin"), "gated routes");
  assert(routes.includes('/withdrawals/:id/mark-paid') && routes.includes("/chargeback"), "action routes");
  assert(!monetisation.includes("UPDATE withdrawals_gbp"), "PAGE-074 no mutate withdrawals");
  assert(!purchases.includes("UPDATE withdrawals_gbp"), "PAGE-075 no mutate withdrawals");
  assert(content.includes("required for reject & cancel"), "note label");

  assert((await get("/api/health")).status === 200, "health");
  for (const path of [
    "/api/admin/withdrawals",
    "/api/admin/withdrawals/00000000-0000-4000-8000-000000000001/approve",
  ]) {
    const method = path.includes("/approve") ? "POST" : "GET";
    const loggedOut = await fetch(`${base}${path}`, {
      method,
      headers: method === "POST" ? { "Content-Type": "application/json" } : undefined,
      body: method === "POST" ? "{}" : undefined,
      redirect: "manual",
    });
    assert(loggedOut.status === 401 || loggedOut.status === 403, `${path} logged-out ${loggedOut.status}`);
    const text = await loggedOut.text();
    assert(!text.includes('"withdrawals"') || text.includes("error"), `${path} no privileged list`);
  }
  const spa = await get("/admin/withdrawals");
  assert([200, 304].includes(spa.status), `/admin/withdrawals spa ${spa.status}`);

  console.log("PAGE-076 ADMIN WITHDRAWALS RUNTIME PROOF: PASS");
  console.log(
    JSON.stringify(
      {
        requireAdminShared: true,
        withdrawalsGbpOwner: true,
        page045HoldOwner: true,
        manualMarkPaidOnly: true,
        noStripeOnPage076: true,
        chargebackUnfreezeApiOnly: true,
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
  console.error("PAGE-076 ADMIN WITHDRAWALS RUNTIME PROOF: FAIL");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
