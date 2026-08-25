import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(resolve(process.cwd(), "src/pages/engagement/EngagementHub.tsx"), "utf8");
const api = readFileSync(resolve(process.cwd(), "src/features/engagement/engagementHubApi.ts"), "utf8");
const session = readFileSync(resolve(process.cwd(), "src/features/engagement/engagementHubSession.ts"), "utf8");
const hub = readFileSync(resolve(process.cwd(), "server/modules/engagement/hub.ts"), "utf8");
const router = readFileSync(resolve(process.cwd(), "server/modules/engagement/router.ts"), "utf8");
const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
const settings = readFileSync(resolve(process.cwd(), "src/pages/Settings.tsx"), "utf8");
const wallet = readFileSync(resolve(process.cwd(), "server/modules/wallet/router.ts"), "utf8");
const payout = readFileSync(resolve(process.cwd(), "server/modules/payouts/service.ts"), "utf8");
const settle = readFileSync(resolve(process.cwd(), "server/modules/gifts/settle.ts"), "utf8");
const nav = readFileSync(resolve(process.cwd(), "src/lib/settingsNav.ts"), "utf8");
const missions = readFileSync(resolve(process.cwd(), "src/pages/engagement/EngagementMissions.tsx"), "utf8");
const fanLevel = readFileSync(resolve(process.cwd(), "src/pages/engagement/EngagementFanLevel.tsx"), "utf8");
const mvp = readFileSync(resolve(process.cwd(), "src/pages/engagement/EngagementMvp.tsx"), "utf8");
const achievements = readFileSync(resolve(process.cwd(), "src/pages/engagement/EngagementAchievements.tsx"), "utf8");
const rewards = readFileSync(resolve(process.cwd(), "src/pages/engagement/EngagementRewards.tsx"), "utf8");
const daily = readFileSync(resolve(process.cwd(), "src/pages/engagement/EngagementDailyLogin.tsx"), "utf8");
const collections = readFileSync(resolve(process.cwd(), "src/pages/engagement/EngagementCollections.tsx"), "utf8");

describe("PAGE-047 Engagement Hub ownership", () => {
  it("has one /engagement option-sheet owner always routed like OLD", () => {
    expect(app.match(/path="\/engagement"/g)?.length).toBe(1);
    expect(app).not.toMatch(/<EngagementGate/);
    expect(app).not.toMatch(/path="\/rewards"|path="\/engagement-hub"|path="\/progression"/);
    expect(page).toMatch(/SettingsOptionSheet/);
    expect(page).toMatch(/title="Engagement Hub"/);
    expect(page).not.toMatch(/PageScaffold|EngagementHubV2|Get coins|useWalletStore|\/api\/engagement\/fan-level/);
    expect(page).not.toMatch(/history\.back|navigate\(-1\)|location\.reload|setTimeout\(/);
    expect(page).not.toMatch(/WebSocket|wsClient|new WebSocket|localStorage|sessionStorage/);
    expect(settings).toMatch(/Engagement Hub/);
    expect(settings).not.toMatch(/isEngagementHubEnabled/);
    expect(nav).toMatch(/ENGAGEMENT_HOME = "\/engagement"/);
  });

  it("loads one hub GET and keeps money domains unmerged", () => {
    expect(api).toMatch(/\/api\/engagement\/hub/);
    expect(api).not.toMatch(/\/api\/wallet|\/api\/engagement\/fan-level|\/api\/test-coins/);
    expect(router).toMatch(/router\.get\("\/hub"/);
    expect(router).toMatch(/getHubSummary\(req\.userId/);
    expect(hub).toMatch(/promotional_balance/);
    expect(hub).toMatch(/battle_energy/);
    expect(hub).toMatch(/total_xp/);
    expect(hub).toMatch(/fan_level/);
    expect(hub).toMatch(/fan_tier/);
    expect(hub).not.toMatch(/paid_coins \+|promo_coins \+|starter_coins \+|applyWalletDelta|withdraw-gbp/);
    expect(wallet).toMatch(/paid_coins, promo_coins, starter_coins/);
    expect(wallet).not.toMatch(/total_xp|battle_energy|fan_tier/);
    expect(payout).not.toMatch(/getHubSummary|user_engagement/);
    expect(settle).toMatch(/splitGiftPence/);
    expect(session).not.toMatch(/localStorage|sessionStorage|setTimeout\(|location\.reload/);
    expect(page).toMatch(/\/engagement\/missions/);
    expect(page).toMatch(/\/engagement\/fan-level/);
    expect(page).toMatch(/\/engagement\/mvp/);
    expect(page).toMatch(/\/engagement\/achievements/);
    expect(page).toMatch(/\/engagement\/rewards/);
    expect(page).toMatch(/\/engagement\/daily-login/);
    expect(page).toMatch(/\/engagement\/collections/);
    expect(page).not.toMatch(/daily-login\/claim/);
  });

  it("does not implement PAGE-048â€“054 owners on the hub", () => {
    expect(missions).not.toMatch(/createEngagementHubSession|SettingsOptionSheet/);
    expect(fanLevel).not.toMatch(/EngagementListPage|createEngagementHubSession/);
    expect(mvp).not.toMatch(/EngagementListPage|createEngagementHubSession/);
    expect(achievements).not.toMatch(/EngagementListPage|createEngagementHubSession|SettingsOptionSheet/);
    expect(achievements).toMatch(/createEngagementAchievementsSession/);
    expect(rewards).not.toMatch(/EngagementListPage|createEngagementHubSession|SettingsOptionSheet/);
    expect(rewards).toMatch(/createEngagementRewardWalletSession/);
    expect(collections).toMatch(/createEngagementCollectionsSession/);
    expect(daily).toMatch(/createEngagementDailyLoginSession/);
    expect(daily).not.toMatch(/createEngagementHubSession|EngagementListPage|PageScaffold/);
    expect(page).not.toMatch(/EngagementListPage/);
  });
});
