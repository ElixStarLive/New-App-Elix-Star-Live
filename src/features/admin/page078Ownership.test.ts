import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ADMIN_PROGRESSION_PARENT, ADMIN_PROGRESSION_TITLE } from "@/content/adminProgression";

const page = readFileSync(resolve(process.cwd(), "src/pages/admin/Progression.tsx"), "utf8");
const content = readFileSync(resolve(process.cwd(), "src/content/adminProgression.ts"), "utf8");
const api = readFileSync(resolve(process.cwd(), "src/features/admin/adminApi.ts"), "utf8");
const progression = readFileSync(resolve(process.cwd(), "server/modules/admin/progression.ts"), "utf8");
const extra = readFileSync(resolve(process.cwd(), "server/modules/app/clientRoutes.ts"), "utf8");
const flags = readFileSync(resolve(process.cwd(), "server/modules/engagement/flags.ts"), "utf8");
const settings = readFileSync(resolve(process.cwd(), "server/modules/engagement/settings.ts"), "utf8");
const auth = readFileSync(resolve(process.cwd(), "server/middleware/auth.ts"), "utf8");
const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
const dashboard = readFileSync(resolve(process.cwd(), "src/content/adminDashboard.ts"), "utf8");
const rising = readFileSync(resolve(process.cwd(), "src/pages/admin/RisingStars.tsx"), "utf8");
const withdrawals = readFileSync(resolve(process.cwd(), "src/pages/admin/Withdrawals.tsx"), "utf8");
const monetisation = readFileSync(resolve(process.cwd(), "src/pages/admin/Monetisation.tsx"), "utf8");
const purchases = readFileSync(resolve(process.cwd(), "src/pages/admin/Purchases.tsx"), "utf8");
const users = readFileSync(resolve(process.cwd(), "src/pages/admin/Users.tsx"), "utf8");
const reports = readFileSync(resolve(process.cwd(), "src/pages/admin/Reports.tsx"), "utf8");
const ws = readFileSync(resolve(process.cwd(), "src/lib/wsClient.ts"), "utf8");
const daily = readFileSync(resolve(process.cwd(), "server/modules/engagement/dailyLogin.ts"), "utf8");
const missions = readFileSync(resolve(process.cwd(), "server/modules/engagement/missions.ts"), "utf8");
const fan = readFileSync(resolve(process.cwd(), "server/modules/engagement/progression.ts"), "utf8");

describe("PAGE-078 Admin Progression ownership", () => {
  it("has one /admin/progression owner behind the shared admin guard", () => {
    expect(app.match(/<Route path="\/admin\/progression" /g)?.length).toBe(1);
    expect(app).toMatch(/<Route path="\/admin\/progression" element=\{<AdminProgression \/>\} \/>/);
    expect(app).toMatch(/<Route element=\{<RequireAdmin \/>\}>/);
    expect(ADMIN_PROGRESSION_TITLE).toBe("Starter Coins & XP");
    expect(ADMIN_PROGRESSION_PARENT).toBe("/admin");
    expect(page).toMatch(/ADMIN_PROGRESSION_TITLE/);
    expect(page).toMatch(/ADMIN_PROGRESSION_FLAGS_TITLE/);
    expect(page).toMatch(/ADMIN_PROGRESSION_MISSIONS_TITLE/);
    expect(page).toMatch(/ADMIN_PROGRESSION_DAILY_TITLE/);
    expect(page).toMatch(/ADMIN_PROGRESSION_ENERGY_TITLE/);
    expect(page).toMatch(/ADMIN_PROGRESSION_ADJUST_XP/);
    expect(page).toMatch(/ADMIN_PROGRESSION_ADJUST_STARTER/);
    expect(page).not.toMatch(/PageScaffold|AdminTablePage|LegalDocPage|history\.back|navigate\(-1\)|location\.reload|setTimeout\(|setInterval\(/);
    expect(page).not.toMatch(/WebSocket|LiveKit|localStorage|sessionStorage|impersonat/);
    expect(content).not.toMatch(/coming soon|lorem ipsum|ProgressionV2/);
  });

  it("uses canonical Neon progression tables and users.is_admin only", () => {
    expect(api).toMatch(/\/api\/admin\/progression\/config/);
    expect(api).toMatch(/\/api\/admin\/progression\/xp-adjustments|xp-adjustments/);
    expect(progression).toMatch(/FROM xp_activity_config/);
    expect(progression).toMatch(/FROM xp_level_requirements/);
    expect(progression).toMatch(/FROM engagement_missions/);
    expect(progression).toMatch(/FROM daily_reward_config/);
    expect(progression).toMatch(/FROM user_engagement/);
    expect(progression).toMatch(/bucket = 'starter'/);
    expect(progression).toMatch(/INSERT INTO engagement_admin_audit/);
    expect(progression).toMatch(/req\.userId/);
    expect(progression).not.toMatch(/SELECT \*/);
    expect(progression).not.toMatch(/new Map\(|ADMIN_EMAIL|adminId/);
    expect(progression).not.toMatch(/VALKEY|valkey|paid_coin_lots|withdrawals_gbp|creator_wallet_gbp/);
    expect(extra).toMatch(/handleAdminProgressionConfig/);
    expect(extra).toMatch(/\.patch\("\/progression\/config"/);
    expect(extra).toMatch(/\.put\("\/progression\/levels"/);
    expect(extra).toMatch(/\.post\("\/progression\/xp-adjustments"/);
    expect(extra).toMatch(/\.post\("\/progression\/starter-adjustments"/);
    expect(extra).not.toMatch(/\.get\("\/progression", requireAuth, requireAdmin/);
    expect(auth).toMatch(/SELECT is_admin FROM users/);
    expect(dashboard).toMatch(/path: "\/admin\/progression"/);
    expect(flags).toMatch(/return resolved === true/);
    expect(settings).toMatch(/engagementHubEnabled/);
    expect(daily).toMatch(/resolveDailyRewardPolicy/);
    expect(missions).toMatch(/missionRewardsEnabled/);
    expect(fan).toMatch(/xp_level_requirements/);
    expect(ws).toMatch(/class WsClient/);
    expect(page).not.toMatch(/new WebSocket|reconnectOnForeground/);
  });

  it("does not take user engagement pages or later admin money owners", () => {
    expect(page).not.toMatch(/Engagement Hub|Fan Level|Reward Wallet|Rising Stars Admin/);
    expect(page).not.toMatch(/apiAdminWithdrawalAction|apiAdminPatchMonetisationConfig|apiAdminBanUser|apiAdminRisingStars/);
    expect(rising).not.toMatch(/apiAdminProgression|xp_level_requirements/);
    expect(withdrawals).not.toMatch(/apiAdminProgression/);
    expect(monetisation).not.toMatch(/apiAdminProgression/);
    expect(purchases).not.toMatch(/apiAdminProgression/);
    expect(users).not.toMatch(/apiAdminProgression/);
    expect(reports).not.toMatch(/apiAdminProgression/);
    expect(progression).not.toMatch(/UPDATE paid_coin_lots|UPDATE creator_wallet_gbp|UPDATE withdrawals_gbp|bucket: "paid"/);
  });
});
