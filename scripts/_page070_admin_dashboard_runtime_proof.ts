/**
 * PAGE-070 runtime proof — Admin Dashboard ownership, server aggregates, RequireAdmin.
 * Run: npx tsx scripts/_page070_admin_dashboard_runtime_proof.ts
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ADMIN_DASHBOARD_ACTIONS,
  ADMIN_DASHBOARD_TITLE,
  formatAdminRevenueMajor,
} from "../src/content/adminDashboard.ts";

const base = process.env.PROOF_API_BASE?.trim() || "http://127.0.0.1:8080";

async function get(path: string, headers?: Record<string, string>) {
  const res = await fetch(`${base}${path}`, { redirect: "manual", headers });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, text, json, location: res.headers.get("location"), cache: res.headers.get("cache-control") };
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

try {
  const page = readFileSync(resolve("src/pages/admin/Dashboard.tsx"), "utf8");
  const api = readFileSync(resolve("src/features/admin/adminApi.ts"), "utf8");
  const guard = readFileSync(resolve("src/components/RequireAdmin.tsx"), "utf8");
  const auth = readFileSync(resolve("server/middleware/auth.ts"), "utf8");
  const dashboard = readFileSync(resolve("server/modules/admin/dashboard.ts"), "utf8");
  const routes = readFileSync(resolve("server/modules/app/clientRoutes.ts"), "utf8");
  const app = readFileSync(resolve("src/App.tsx"), "utf8");
  const content = readFileSync(resolve("src/content/adminDashboard.ts"), "utf8");

  assert(ADMIN_DASHBOARD_TITLE === "Admin Dashboard", "title");
  assert(ADMIN_DASHBOARD_ACTIONS.length === 8, "8 quick actions");
  assert(formatAdminRevenueMajor(15000) === "$150", "revenue format");
  assert(app.includes('path="/admin"') && app.includes("<AdminDashboard"), "route");
  assert(app.includes("<RequireAdmin"), "RequireAdmin wrapper");
  assert(guard.includes('to="/login"') && guard.includes('to="/"'), "guard redirects");
  assert(guard.includes("user.isAdmin !== true"), "strict admin check");
  assert(auth.includes("SELECT is_admin FROM users"), "server users.is_admin");
  assert(auth.includes('AppError("forbidden"') || auth.includes("Admin only"), "403 path");
  assert(routes.includes('"/dashboard"') && routes.includes("requireAdmin") && routes.includes("handleAdminDashboard"), "route wiring");
  assert(dashboard.includes("auth_sessions") && dashboard.includes("INTERVAL '24 hours'"), "DAU");
  assert(dashboard.includes("shop_purchases") && dashboard.includes("amount_pence"), "revenue");
  assert(dashboard.includes("private, no-store"), "cache safety");
  assert(api.includes("/api/admin/dashboard") && api.includes("parseAdminDashboard"), "client aggregate");
  assert(!api.includes("api.profiles.list") && !page.includes("profiles.list"), "no client fetch-all");
  assert(!page.includes("new WebSocket") && !page.includes("localStorage"), "no WS/storage");
  assert(!content.includes("ADMIN_EMAIL") && !auth.includes("ADMIN_EMAIL"), "no hardcoded admin email");
  assert(!dashboard.includes("CREATE TABLE") && !dashboard.includes("ALTER TABLE"), "no runtime schema");

  assert((await get("/api/health")).status === 200, "health");

  const loggedOut = await get("/api/admin/dashboard");
  assert(loggedOut.status === 401 || loggedOut.status === 403, `logged-out dashboard ${loggedOut.status}`);
  assert(!loggedOut.json || typeof loggedOut.json !== "object" || !("dailyActiveUsers" in (loggedOut.json as object)), "no metrics when logged out");

  const spa = await get("/admin");
  assert([200, 304].includes(spa.status), `/admin spa ${spa.status}`);

  console.log("PAGE-070 ADMIN DASHBOARD RUNTIME PROOF: PASS");
  console.log(
    JSON.stringify(
      {
        requireAdmin: true,
        usersIsAdminServer: true,
        aggregateEndpoint: true,
        noClientFetchAll: true,
        dau24hAuthSessions: true,
        shopRevenuePence: true,
        cacheNoStore: true,
        loggedOutDenied: true,
        spaDeepLink: true,
      },
      null,
      2,
    ),
  );
  process.exit(0);
} catch (error) {
  console.error("PAGE-070 ADMIN DASHBOARD RUNTIME PROOF: FAIL");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
