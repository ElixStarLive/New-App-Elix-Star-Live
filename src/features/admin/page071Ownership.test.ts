import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ADMIN_USERS_BAN_CONFIRM, ADMIN_USERS_TITLE, ADMIN_USERS_UNBAN_CONFIRM } from "@/content/adminUsers";

const page = readFileSync(resolve(process.cwd(), "src/pages/admin/Users.tsx"), "utf8");
const content = readFileSync(resolve(process.cwd(), "src/content/adminUsers.ts"), "utf8");
const api = readFileSync(resolve(process.cwd(), "src/features/admin/adminApi.ts"), "utf8");
const users = readFileSync(resolve(process.cwd(), "server/modules/admin/users.ts"), "utf8");
const extra = readFileSync(resolve(process.cwd(), "server/modules/app/clientRoutes.ts"), "utf8");
const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
const dashboard = readFileSync(resolve(process.cwd(), "src/content/adminDashboard.ts"), "utf8");
const reports = readFileSync(resolve(process.cwd(), "src/pages/admin/Reports.tsx"), "utf8");
const ws = readFileSync(resolve(process.cwd(), "src/lib/wsClient.ts"), "utf8");
const wsServer = readFileSync(resolve(process.cwd(), "server/websocket/index.ts"), "utf8");
const auth = readFileSync(resolve(process.cwd(), "server/middleware/auth.ts"), "utf8");

describe("PAGE-071 Admin Users ownership", () => {
  it("has one /admin/users owner behind the shared admin guard", () => {
    expect(app.match(/<Route path="\/admin\/users" /g)?.length).toBe(1);
    expect(app).toMatch(/<Route path="\/admin\/users" element=\{<AdminUsers \/>\} \/>/);
    expect(app).toMatch(/<Route element=\{<RequireAdmin \/>\}>/);
    expect(ADMIN_USERS_TITLE).toBe("User Management");
    expect(ADMIN_USERS_BAN_CONFIRM).toContain("ban this user");
    expect(ADMIN_USERS_UNBAN_CONFIRM).toBe("Unban this user?");
    expect(page).toMatch(/ADMIN_USERS_TITLE/);
    expect(page).toMatch(/ADMIN_USERS_SEARCH_PLACEHOLDER/);
    expect(page).toMatch(/window\.confirm/);
    expect(page).not.toMatch(/PageScaffold|LegalDocPage|history\.back|navigate\(-1\)|location\.reload|setTimeout\(|setInterval\(/);
    expect(page).not.toMatch(/WebSocket|LiveKit|localStorage|sessionStorage|impersonat|password|wallet|coins/);
    expect(content).not.toMatch(/coming soon|lorem ipsum|UsersV2/);
  });

  it("uses the established users/ban/unban contract on users.is_admin", () => {
    expect(api).toMatch(/\/api\/admin\/users/);
    expect(api).toMatch(/method: "POST"/);
    expect(api).toMatch(/method: "DELETE"/);
    expect(api).not.toMatch(/body: JSON\.stringify\(\{ banned \}\)/);
    expect(users).toMatch(/ADMIN_USERS_LIMIT = 500/);
    expect(users).toMatch(/LIMIT \$\{ADMIN_USERS_LIMIT\}/);
    expect(users).toMatch(/auth_sessions/);
    expect(users).toMatch(/banned_until/);
    expect(users).toMatch(/disconnectUserSessions/);
    expect(users).not.toMatch(/new Map\(|profiles SET banned[^_]/);
    expect(wsServer).toMatch(/closeSockets: true/);
    expect(wsServer).toMatch(/force_disconnect/);
    expect(wsServer).toMatch(/USER_EVENT_CHANNEL|user:events/);
    expect(extra).toMatch(/handleAdminUsers/);
    expect(extra).toMatch(/handleAdminBan/);
    expect(extra).toMatch(/handleAdminUnban/);
    expect(extra).toMatch(/\.delete\("\/users\/:userId\/ban"/);
    expect(extra).toMatch(/requireAdmin/);
    expect(auth).toMatch(/SELECT is_admin FROM users/);
    expect(dashboard).toMatch(/path: "\/admin\/users"/);
    expect(app.indexOf("<Route element={<RequireAdmin")).toBeGreaterThan(app.indexOf("<Route element={<RequireAuth"));
    expect(ws).toMatch(/class WsClient/);
    expect(page).not.toMatch(/new WebSocket|reconnectOnForeground/);
    expect(page).not.toMatch(/Force Disconnect|forceDisconnect/);
    expect(content).toMatch(/adminUsersDefaultAvatar/);
  });

  it("does not implement later admin child pages", () => {
    expect(page).not.toMatch(/apiResolveReport|\/admin\/reports|gift catalog|feature-flags|withdrawals-gbp/);
    expect(page).not.toMatch(/AdminTablePage|Monetisation|Rising Stars|Economy Controls|Edit Price|apiAdminUpdateGiftPrice/);
    expect(reports).not.toMatch(/ADMIN_USERS_TITLE|apiAdminBanUser/);
  });
});
