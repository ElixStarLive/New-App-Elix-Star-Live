import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(resolve(process.cwd(), "src/pages/Report.tsx"), "utf8");
const modal = readFileSync(resolve(process.cwd(), "src/components/ReportModal.tsx"), "utf8");
const api = readFileSync(resolve(process.cwd(), "src/features/report/reportApi.ts"), "utf8");
const session = readFileSync(resolve(process.cwd(), "src/features/report/reportSession.ts"), "utf8");
const reasons = readFileSync(resolve(process.cwd(), "src/features/report/reportReasons.ts"), "utf8");
const service = readFileSync(resolve(process.cwd(), "server/modules/reports/service.ts"), "utf8");
const routers = readFileSync(resolve(process.cwd(), "server/modules/misc/routers.ts"), "utf8");
const clientRoutes = readFileSync(resolve(process.cwd(), "server/modules/app/clientRoutes.ts"), "utf8");
const index = readFileSync(resolve(process.cwd(), "server/index.ts"), "utf8");
const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
const safety = readFileSync(resolve(process.cwd(), "src/pages/settings/SafetyCenter.tsx"), "utf8");
const contract = readFileSync(resolve(process.cwd(), "shared/contracts/social.ts"), "utf8");
const player = readFileSync(resolve(process.cwd(), "src/components/ForYouPlayer.tsx"), "utf8");
const profile = readFileSync(resolve(process.cwd(), "src/pages/Profile.tsx"), "utf8");
const sheet = readFileSync(resolve(process.cwd(), "src/components/ForYouProfileSheet.tsx"), "utf8");
const liveOverlay = readFileSync(resolve(process.cwd(), "src/features/live/spectator/ProfileLiveOverlay.tsx"), "utf8");
const adminPage = readFileSync(resolve(process.cwd(), "src/pages/admin/Reports.tsx"), "utf8");
const nav = readFileSync(resolve(process.cwd(), "src/lib/settingsNav.ts"), "utf8");

describe("PAGE-046 Report ownership", () => {
  it("has one /report option-sheet owner and one ReportModal owner", () => {
    expect(app.match(/path="\/report"/g)?.length).toBe(1);
    expect(app).not.toMatch(/path="\/reports"|path="\/report\/:|path="\/safety\/report"/);
    expect(page).toMatch(/SettingsOptionSheet/);
    expect(page).toMatch(/Report a problem/);
    expect(page).not.toMatch(/PageScaffold|ReportV2|targetKind|\/api\/reports/);
    expect(page).not.toMatch(/history\.back|navigate\(-1\)|location\.reload|setTimeout\(/);
    expect(page).not.toMatch(/WebSocket|wsClient|new WebSocket|localStorage|sessionStorage|reporter_id/);
    expect(modal).toMatch(/createPortal/);
    expect(modal).toMatch(/Report \{contentTypeLabel\(contentType\)\}/);
    expect(modal).not.toMatch(/setTimeout\(|reporter_id|\/api\/reports|history\.back/);
    expect(nav).toMatch(/if \(path === "\/report"\) return FEED_HOME/);
  });

  it("submits only POST /api/report with the OLD body contract", () => {
    expect(api).toMatch(/\/api\/report/);
    expect(api).toMatch(/targetType: body\.targetType/);
    expect(api).toMatch(/targetId: body\.targetId/);
    expect(api).not.toMatch(/\/api\/reports|reporter_id|targetKind/);
    expect(contract).toMatch(/targetType: reportTargetTypeSchema/);
    expect(contract).not.toMatch(/targetKind: reportTargetTypeSchema/);
    expect(routers).toMatch(/moderationRouter\.post\("\/report"/);
    expect(routers).toMatch(/createReport\(req\.userId/);
    expect(service).toMatch(/reporter_id, target_user_id, target_kind/);
    expect(service).toMatch(/req\.userId|reporterId/);
    expect(service).not.toMatch(/body\.reporter_id/);
    expect(index).toMatch(/app\.use\("\/api", moderationRouter\)/);
    expect(clientRoutes).not.toMatch(/handleReports|router\.post\("\/reports"/);
    expect(index).not.toMatch(/\/api\/reports/);
  });

  it("keeps PAGE-041 handoff and PAGE-072 admin review outside this owner", () => {
    expect(safety).toMatch(/\/report\?type=support&id=support_ticket/);
    expect(safety).not.toMatch(/\/api\/report|apiCreateReport/);
    expect(player).toMatch(/<ReportModal/);
    expect(profile).toMatch(/<ReportModal/);
    expect(sheet).toMatch(/<ReportModal/);
    // Live profile overlay keeps LiveKit/watch mounted and reuses Profile's ReportModal.
    expect(liveOverlay).toMatch(/from "@\/pages\/Profile"|<Profile\s*\/>/);
    expect(liveOverlay).not.toMatch(/<ReportModal|\/api\/report|apiCreateReport/);
    expect(liveOverlay).not.toMatch(/navigate\("\/report"/);
    expect(adminPage).toMatch(/apiAdminListReports|apiAdminResolveReport/);
    expect(clientRoutes).toMatch(/extraAdminRouter\.get\("\/reports"/);
    expect(page).not.toMatch(/admin\/reports|apiResolveReport/);
    expect(session).not.toMatch(/localStorage|sessionStorage|setTimeout\(|location\.reload/);
    expect(reasons).toMatch(/rawType === "support"/);
    expect(reasons).toMatch(/support_ticket/);
  });
});
