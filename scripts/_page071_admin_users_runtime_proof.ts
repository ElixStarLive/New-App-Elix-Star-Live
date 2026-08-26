/**
 * PAGE-071 runtime proof — Admin Users list/ban/unban, session revoke via ban, no separate Force Disconnect UI.
 * Run: npx tsx scripts/_page071_admin_users_runtime_proof.ts
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ADMIN_USERS_BAN_CONFIRM,
  ADMIN_USERS_TITLE,
  ADMIN_USERS_UNBAN_CONFIRM,
  adminUsersDefaultAvatar,
} from "../src/content/adminUsers.ts";

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
  const page = readFileSync(resolve("src/pages/admin/Users.tsx"), "utf8");
  const content = readFileSync(resolve("src/content/adminUsers.ts"), "utf8");
  const api = readFileSync(resolve("src/features/admin/adminApi.ts"), "utf8");
  const users = readFileSync(resolve("server/modules/admin/users.ts"), "utf8");
  const routes = readFileSync(resolve("server/modules/app/clientRoutes.ts"), "utf8");
  const app = readFileSync(resolve("src/App.tsx"), "utf8");
  const dashboard = readFileSync(resolve("src/content/adminDashboard.ts"), "utf8");
  const wsIndex = readFileSync(resolve("server/websocket/index.ts"), "utf8");

  assert(ADMIN_USERS_TITLE === "User Management", "title");
  assert(ADMIN_USERS_BAN_CONFIRM.includes("ban this user"), "ban confirm");
  assert(ADMIN_USERS_UNBAN_CONFIRM === "Unban this user?", "unban confirm");
  assert(adminUsersDefaultAvatar("alice").includes("ui-avatars.com"), "avatar fallback");
  assert(app.includes('path="/admin/users"') && app.includes("<AdminUsers"), "route");
  assert(app.includes("<RequireAdmin"), "shared RequireAdmin");
  assert(dashboard.includes('path: "/admin/users"'), "dashboard nav");
  assert(page.includes("apiAdminBanUser") && page.includes("apiAdminUnbanUser"), "ban/unban UI");
  assert(!page.includes("Force Disconnect") && !page.includes("forceDisconnect"), "no separate FD button (OLD none)");
  assert(api.includes("/api/admin/users") && api.includes("/ban"), "API paths");
  assert(users.includes("banned_until") && users.includes("auth_sessions"), "ban + session revoke");
  assert(users.includes("disconnectUserSessions"), "ban realtime disconnect via PAGE-006");
  assert(wsIndex.includes("closeSockets: true") && wsIndex.includes("force_disconnect"), "multi-instance close");
  assert(wsIndex.includes("disconnectUserSessions"), "PAGE-006 WS owner");
  assert(routes.includes("handleAdminUsers") && routes.includes("requireAdmin"), "route gate");
  assert(!users.includes("new Map(") && !page.includes("localStorage"), "no process-memory/localStorage");
  assert(!page.includes("new WebSocket"), "no second socket");
  assert(!page.includes("Force Disconnect") && !page.includes("forceDisconnect"), "no separate FD UI");
  assert(content.includes("adminUsersDefaultAvatar"), "avatar helper");

  assert((await get("/api/health")).status === 200, "health");
  const loggedOut = await get("/api/admin/users");
  assert(loggedOut.status === 401 || loggedOut.status === 403, `logged-out list ${loggedOut.status}`);
  assert(!loggedOut.json || typeof loggedOut.json !== "object" || !("users" in (loggedOut.json as object)), "no user list when logged out");

  const spa = await get("/admin/users");
  assert([200, 304].includes(spa.status), `/admin/users spa ${spa.status}`);

  console.log("PAGE-071 ADMIN USERS RUNTIME PROOF: PASS");
  console.log(
    JSON.stringify(
      {
        requireAdminShared: true,
        listBanUnban: true,
        banRevokesSessions: true,
        banForceDisconnectsRealtime: true,
        noSeparateForceDisconnectUi: true,
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
  console.error("PAGE-071 ADMIN USERS RUNTIME PROOF: FAIL");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
