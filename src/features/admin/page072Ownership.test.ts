import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ADMIN_REPORTS_EMPTY,
  ADMIN_REPORTS_TITLE,
  ADMIN_REPORTS_WARNING_BODY,
} from "@/content/adminReports";

const page = readFileSync(resolve(process.cwd(), "src/pages/admin/Reports.tsx"), "utf8");
const content = readFileSync(resolve(process.cwd(), "src/content/adminReports.ts"), "utf8");
const api = readFileSync(resolve(process.cwd(), "src/features/admin/adminApi.ts"), "utf8");
const reports = readFileSync(resolve(process.cwd(), "server/modules/admin/reports.ts"), "utf8");
const extra = readFileSync(resolve(process.cwd(), "server/modules/app/clientRoutes.ts"), "utf8");
const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
const dashboard = readFileSync(resolve(process.cwd(), "src/content/adminDashboard.ts"), "utf8");
const users = readFileSync(resolve(process.cwd(), "src/pages/admin/Users.tsx"), "utf8");
const ws = readFileSync(resolve(process.cwd(), "src/lib/wsClient.ts"), "utf8");
const auth = readFileSync(resolve(process.cwd(), "server/middleware/auth.ts"), "utf8");
const submit = readFileSync(resolve(process.cwd(), "server/modules/reports/service.ts"), "utf8");

describe("PAGE-072 Admin Reports ownership", () => {
  it("has one /admin/reports owner behind the shared admin guard", () => {
    expect(app.match(/<Route path="\/admin\/reports" /g)?.length).toBe(1);
    expect(app).toMatch(/<Route path="\/admin\/reports" element=\{<AdminReports \/>\} \/>/);
    expect(app).toMatch(/<Route element=\{<RequireAdmin \/>\}>/);
    expect(ADMIN_REPORTS_TITLE).toBe("Reports Queue");
    expect(ADMIN_REPORTS_EMPTY).toBe("No reports found");
    expect(page).toMatch(/ADMIN_REPORTS_TITLE/);
    expect(page).toMatch(/ADMIN_REPORTS_FILTER_PENDING/);
    expect(page).toMatch(/ADMIN_REPORTS_WARN/);
    expect(page).not.toMatch(/PageScaffold|LegalDocPage|history\.back|navigate\(-1\)|location\.reload|setTimeout\(|setInterval\(/);
    expect(page).not.toMatch(/WebSocket|LiveKit|localStorage|sessionStorage|impersonat|password|wallet|coins/);
    expect(page).not.toMatch(/Ban|Unban|strike/);
    expect(content).not.toMatch(/coming soon|lorem ipsum|ReportsV2/);
  });

  it("uses the established reports/status/warning contract on users.is_admin", () => {
    expect(api).toMatch(/\/api\/admin\/reports/);
    expect(api).toMatch(/method: "PATCH"/);
    expect(api).toMatch(/status: "actioned"/);
    expect(api).not.toMatch(/\/resolve/);
    expect(reports).toMatch(/ADMIN_REPORTS_LIMIT = 200/);
    expect(reports).toMatch(/FROM reports r/);
    expect(reports).toMatch(/INSERT INTO notifications/);
    expect(reports).toMatch(/moderation_warning/);
    expect(reports).toContain(ADMIN_REPORTS_WARNING_BODY);
    expect(reports).not.toMatch(/new Map\(|elix_reports|banned_until/);
    expect(extra).toMatch(/handleAdminReports/);
    expect(extra).toMatch(/handleAdminPatchReport/);
    expect(extra).toMatch(/\.patch\("\/reports\/:reportId"/);
    expect(extra).not.toMatch(/\/reports\/:reportId\/resolve/);
    expect(auth).toMatch(/SELECT is_admin FROM users/);
    expect(dashboard).toMatch(/path: "\/admin\/reports"/);
    expect(submit).toMatch(/INSERT INTO reports/);
    expect(ws).toMatch(/class WsClient/);
    expect(page).not.toMatch(/new WebSocket|reconnectOnForeground/);
  });

  it("does not implement later admin child pages or PAGE-071 ban", () => {
    expect(page).not.toMatch(/apiAdminBanUser|gift catalog|feature-flags|withdrawals-gbp/);
    expect(page).not.toMatch(/AdminTablePage|Monetisation|Rising Stars|Economy Controls|Edit Price|apiAdminUpdateGiftPrice/);
    expect(users).not.toMatch(/ADMIN_REPORTS_TITLE|apiAdminResolveReport/);
  });
});
