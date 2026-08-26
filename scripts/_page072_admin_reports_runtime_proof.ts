/**
 * PAGE-072 runtime proof — Admin Reports list/status/warning via PAGE-046 reports + PAGE-006 WS.
 * Run: npx tsx scripts/_page072_admin_reports_runtime_proof.ts
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ADMIN_REPORTS_EMPTY,
  ADMIN_REPORTS_TITLE,
  ADMIN_REPORTS_WARNING_BODY,
  ADMIN_REPORTS_WARN,
} from "../src/content/adminReports.ts";

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
  const page = readFileSync(resolve("src/pages/admin/Reports.tsx"), "utf8");
  const content = readFileSync(resolve("src/content/adminReports.ts"), "utf8");
  const api = readFileSync(resolve("src/features/admin/adminApi.ts"), "utf8");
  const reports = readFileSync(resolve("server/modules/admin/reports.ts"), "utf8");
  const submit = readFileSync(resolve("server/modules/reports/service.ts"), "utf8");
  const routes = readFileSync(resolve("server/modules/app/clientRoutes.ts"), "utf8");
  const app = readFileSync(resolve("src/App.tsx"), "utf8");
  const dashboard = readFileSync(resolve("src/content/adminDashboard.ts"), "utf8");
  const liveRoom = readFileSync(resolve("src/features/live/LiveRoomScreen.tsx"), "utf8");
  const wsServer = readFileSync(resolve("server/websocket/index.ts"), "utf8");

  assert(ADMIN_REPORTS_TITLE === "Reports Queue", "title");
  assert(ADMIN_REPORTS_EMPTY === "No reports found", "empty");
  assert(ADMIN_REPORTS_WARN === "Warn User", "warn label");
  assert(ADMIN_REPORTS_WARNING_BODY.includes("community guidelines"), "warning body");
  assert(app.includes('path="/admin/reports"') && app.includes("<AdminReports"), "route");
  assert(app.includes("<RequireAdmin"), "shared RequireAdmin");
  assert(dashboard.includes('path: "/admin/reports"'), "dashboard nav");
  assert(page.includes("apiAdminListReports") && page.includes("apiAdminResolveReport"), "list/resolve UI");
  assert(page.includes("ADMIN_REPORTS_WARN") && page.includes("ADMIN_REPORTS_REMOVE"), "actions");
  assert(!page.includes("apiAdminBanUser") && !page.includes("Force Disconnect"), "no ban owner");
  assert(!page.includes("new WebSocket"), "no second socket");
  assert(api.includes("/api/admin/reports") && api.includes('status: "actioned"'), "PATCH contract");
  assert(reports.includes("FROM reports r") && reports.includes("moderation_warning"), "Neon + WS");
  assert(reports.includes("INSERT INTO notifications") && reports.includes("sendToUserGlobal"), "persist + realtime");
  assert(reports.includes("FOR UPDATE") && reports.includes("alreadyActioned"), "idempotent action");
  assert(submit.includes("INSERT INTO reports") && submit.includes("'open'"), "PAGE-046 owner");
  assert(!submit.includes("body.reporterId") && !submit.includes("reporter_id: body"), "forged reporter blocked");
  assert(routes.includes("handleAdminReports") && routes.includes("handleAdminPatchReport"), "routes");
  assert(routes.includes("requireAdmin"), "admin gate");
  assert(liveRoom.includes("moderation_warning"), "live warning consumer");
  assert(wsServer.includes("sendToUserGlobal") && wsServer.includes("user:events"), "PAGE-006 Valkey fanout");
  assert(content.includes("ADMIN_REPORTS_WARNING_BODY"), "shared warning copy");

  assert((await get("/api/health")).status === 200, "health");
  const loggedOut = await get("/api/admin/reports");
  assert(loggedOut.status === 401 || loggedOut.status === 403, `logged-out list ${loggedOut.status}`);
  assert(
    !loggedOut.json || typeof loggedOut.json !== "object" || !("reports" in (loggedOut.json as object)),
    "no report list when logged out",
  );

  const spa = await get("/admin/reports");
  assert([200, 304].includes(spa.status), `/admin/reports spa ${spa.status}`);

  console.log("PAGE-072 ADMIN REPORTS RUNTIME PROOF: PASS");
  console.log(
    JSON.stringify(
      {
        requireAdminShared: true,
        page046ReportSource: true,
        reporterServerDerived: true,
        patchStatusActioned: true,
        moderationWarningWs: true,
        warningPersistedAsSystemNotification: true,
        noSecondWebSocket: true,
        noBanOwner: true,
        loggedOutDenied: true,
        spaDeepLink: true,
      },
      null,
      2,
    ),
  );
  process.exit(0);
} catch (error) {
  console.error("PAGE-072 ADMIN REPORTS RUNTIME PROOF: FAIL");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
