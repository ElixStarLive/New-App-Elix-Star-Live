import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ADMIN_DASHBOARD_ACTIONS, ADMIN_DASHBOARD_TITLE } from "@/content/adminDashboard";

const page = readFileSync(resolve(process.cwd(), "src/pages/admin/Dashboard.tsx"), "utf8");
const content = readFileSync(resolve(process.cwd(), "src/content/adminDashboard.ts"), "utf8");
const api = readFileSync(resolve(process.cwd(), "src/features/admin/adminApi.ts"), "utf8");
const guard = readFileSync(resolve(process.cwd(), "src/components/RequireAdmin.tsx"), "utf8");
const settings = readFileSync(resolve(process.cwd(), "src/pages/Settings.tsx"), "utf8");
const auth = readFileSync(resolve(process.cwd(), "server/middleware/auth.ts"), "utf8");
const dashboard = readFileSync(resolve(process.cwd(), "server/modules/admin/dashboard.ts"), "utf8");
const extra = readFileSync(resolve(process.cwd(), "server/modules/app/clientRoutes.ts"), "utf8");
const misc = readFileSync(resolve(process.cwd(), "server/modules/misc/routers.ts"), "utf8");
const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
const nav = readFileSync(resolve(process.cwd(), "src/lib/settingsNav.ts"), "utf8");
const shell = readFileSync(resolve(process.cwd(), "src/lib/appShell.ts"), "utf8");
const ws = readFileSync(resolve(process.cwd(), "src/lib/wsClient.ts"), "utf8");

describe("PAGE-070 Admin Dashboard ownership", () => {
  it("has one /admin owner behind RequireAdmin", () => {
    expect(app.match(/<Route path="\/admin" /g)?.length).toBe(1);
    expect(app).toMatch(/<Route path="\/admin" element=\{<AdminDashboard \/>\} \/>/);
    expect(app).toMatch(/<Route element=\{<RequireAdmin \/>\}>/);
    expect(ADMIN_DASHBOARD_TITLE).toBe("Admin Dashboard");
    expect(ADMIN_DASHBOARD_ACTIONS.map((item) => item.path)).toEqual([
      "/admin/users",
      "/admin/reports",
      "/admin/economy",
      "/admin/monetisation",
      "/admin/purchases",
      "/admin/withdrawals",
      "/admin/rising-stars",
      "/admin/progression",
    ]);
    expect(page).toMatch(/ADMIN_DASHBOARD_TITLE/);
    expect(page).toMatch(/Daily Active Users/);
    expect(page).not.toMatch(/PageScaffold|LegalDocPage|history\.back|navigate\(-1\)|location\.reload|setTimeout\(/);
    expect(page).not.toMatch(/WebSocket|LiveKit|localStorage|sessionStorage/);
    expect(content).not.toMatch(/AdminDashboardV2|coming soon|lorem ipsum/);
  });

  it("uses server aggregates and users.is_admin only", () => {
    expect(api).toMatch(/\/api\/admin\/dashboard/);
    expect(api).toMatch(/parseAdminDashboard/);
    expect(api).not.toMatch(/profiles\.list|videos\.list|\/api\/live\/streams/);
    expect(dashboard).toMatch(/INTERVAL '24 hours'/);
    expect(dashboard).toMatch(/auth_sessions/);
    expect(dashboard).toMatch(/shop_purchases/);
    expect(dashboard).toMatch(/auth_sessions/);
    expect(dashboard).not.toMatch(/elix_auth_users|elix_auth_sessions|isLiveNeonSchema/);
    expect(dashboard).not.toMatch(/SUM\(coins\)|processed_purchases|new Map\(/);
    expect(extra).toMatch(/\/stats\/dau/);
    expect(extra).toMatch(/handleAdminDashboard/);
    expect(misc).not.toMatch(/adminRouter\.get\("\/stats"/);
    expect(auth).toMatch(/SELECT is_admin FROM users/);
    expect(auth).not.toMatch(/ADMIN_EMAIL|email ===|username === ['"]admin['"]/);
    expect(guard).toMatch(/user\.isAdmin !== true/);
    expect(guard).toMatch(/\/login/);
    expect(guard).toMatch(/to="\/"/);
    expect(settings).toMatch(/user\?\.isAdmin === true/);
    expect(settings).toMatch(/go\("\/admin"\)/);
    expect(app.indexOf("<Route element={<RequireAdmin")).toBeGreaterThan(app.indexOf("<Route element={<RequireAuth"));
    expect(dashboard).toMatch(/private, no-store/);
    expect(extra).toMatch(/requireAdmin/);
    expect(extra).toMatch(/handleAdminDashboard/);
    expect(nav).toMatch(/path === "\/admin"/);
    // PAGE-006: admin keeps bottom nav (not a shell-hidden path).
    expect(shell).not.toMatch(/pathname === "\/admin"|pathname\.startsWith\("\/admin"\)/);
    expect(ws).toMatch(/class WsClient/);
    expect(page).not.toMatch(/reconnectOnForeground|new WebSocket/);
  });

  it("does not implement later admin child pages", () => {
    expect(page).not.toMatch(/apiBanUser|apiResolveReport|gift catalog|feature-flags|withdrawals-gbp/);
    expect(page).not.toMatch(/AdminTablePage|Ban|Unban|Resolve/);
    expect(content).not.toMatch(/\/api\/admin\/users|\/api\/admin\/reports/);
  });
});
