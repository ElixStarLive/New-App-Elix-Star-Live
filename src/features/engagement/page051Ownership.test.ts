import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(resolve(process.cwd(), "src/pages/engagement/EngagementAchievements.tsx"), "utf8");
const api = readFileSync(resolve(process.cwd(), "src/features/engagement/engagementAchievementsApi.ts"), "utf8");
const session = readFileSync(resolve(process.cwd(), "src/features/engagement/engagementAchievementsSession.ts"), "utf8");
const router = readFileSync(resolve(process.cwd(), "server/modules/engagement/router.ts"), "utf8");
const achievements = readFileSync(resolve(process.cwd(), "server/modules/engagement/achievements.ts"), "utf8");
const progress = readFileSync(resolve(process.cwd(), "server/modules/engagement/progress.ts"), "utf8");
const mvp = readFileSync(resolve(process.cwd(), "server/modules/engagement/mvp.ts"), "utf8");
const gifts = readFileSync(resolve(process.cwd(), "server/modules/gifts/router.ts"), "utf8");
const hubPage = readFileSync(resolve(process.cwd(), "src/pages/engagement/EngagementHub.tsx"), "utf8");
const missions = readFileSync(resolve(process.cwd(), "src/pages/engagement/EngagementMissions.tsx"), "utf8");
const fanLevel = readFileSync(resolve(process.cwd(), "src/pages/engagement/EngagementFanLevel.tsx"), "utf8");
const mvpPage = readFileSync(resolve(process.cwd(), "src/pages/engagement/EngagementMvp.tsx"), "utf8");
const rewards = readFileSync(resolve(process.cwd(), "src/pages/engagement/EngagementRewards.tsx"), "utf8");
const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
const wallet = readFileSync(resolve(process.cwd(), "server/modules/wallet/ledger.ts"), "utf8");
const payout = readFileSync(resolve(process.cwd(), "server/modules/payouts/service.ts"), "utf8");
const flags = readFileSync(resolve(process.cwd(), "src/config/engagementFlags.ts"), "utf8");

describe("PAGE-051 Achievements ownership", () => {
  it("has one /engagement/achievements owner gated by the shared hub flag", () => {
    expect(app.match(/path="\/engagement\/achievements"/g)?.length).toBe(1);
    expect(app).not.toMatch(/<EngagementGate/);
    expect(app).not.toMatch(/path="\/achievements"|path="\/engagement\/badges"|path="\/progression\/achievements"/);
    expect(page).toMatch(/title="Close"|aria-label="Close"/);
    expect(page).toMatch(/Achievements/);
    expect(page).not.toMatch(/PageScaffold|EngagementListPage|AchievementsV2|AchievementsFixed|history\.back|navigate\(-1\)|location\.reload|setTimeout\(/);
    expect(page).not.toMatch(/WebSocket|wsClient|new WebSocket|localStorage|sessionStorage/);
    expect(page).toMatch(/ENGAGEMENT_HOME/);
    expect(page).not.toMatch(/Claim/);
    expect(flags).toMatch(/VITE_ENGAGEMENT_HUB_ENABLED/);
  });

  it("loads one achievements GET and keeps rewards unmerged from money", () => {
    expect(api).toMatch(/\/api\/engagement\/achievements/);
    expect(api).not.toMatch(/\/api\/wallet|\/api\/test-coins|unlocked:\s*true|progress:\s*100/);
    expect(router).toMatch(/router\.get\("\/achievements"/);
    expect(router).toMatch(/listAchievementsForUser\(req\.userId/);
    expect(router).not.toMatch(/router\.post\("\/achievements"/);
    expect(achievements).toMatch(/ORDER BY a\.rarity, a\.id/);
    expect(achievements).toMatch(/bucket: "promo"/);
    expect(achievements).toMatch(/grantEngagementXp/);
    expect(achievements).toMatch(/claimed = FALSE/);
    expect(achievements).not.toMatch(/paid_coins|withdraw-gbp|test_coins|localStorage|new WebSocket/);
    expect(progress).not.toMatch(/user_achievements/);
    expect(gifts).toMatch(/bumpAchievement/);
    expect(gifts).toMatch(/gifts_sent/);
    expect(mvp).toMatch(/mvp_top10/);
    expect(session).not.toMatch(/localStorage|sessionStorage|setTimeout\(|location\.reload|progress \+=|unlocked = true/);
    expect(wallet).toMatch(/Test coins are not wallet money/);
    expect(payout).not.toMatch(/bumpAchievement|listAchievementsForUser/);
  });

  it("does not take PAGE-047â€“050 or PAGE-052 ownership", () => {
    expect(hubPage).toMatch(/SettingsOptionSheet/);
    expect(hubPage).toMatch(/\/engagement\/achievements/);
    expect(hubPage).not.toMatch(/createEngagementAchievementsSession/);
    expect(missions).not.toMatch(/createEngagementAchievementsSession|\/engagement\/achievements/);
    expect(fanLevel).not.toMatch(/createEngagementAchievementsSession|\/api\/engagement\/achievements/);
    expect(mvpPage).not.toMatch(/createEngagementAchievementsSession|\/engagement\/achievements/);
    expect(rewards).not.toMatch(/createEngagementAchievementsSession|EngagementListPage/);
    expect(page).not.toMatch(/EngagementListPage|\/engagement\/rewards|Reward Wallet/);
  });
});
