import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(resolve(process.cwd(), "src/pages/engagement/EngagementMissions.tsx"), "utf8");
const api = readFileSync(resolve(process.cwd(), "src/features/engagement/engagementMissionsApi.ts"), "utf8");
const session = readFileSync(resolve(process.cwd(), "src/features/engagement/engagementMissionsSession.ts"), "utf8");
const router = readFileSync(resolve(process.cwd(), "server/modules/engagement/router.ts"), "utf8");
const missions = readFileSync(resolve(process.cwd(), "server/modules/engagement/missions.ts"), "utf8");
const progress = readFileSync(resolve(process.cwd(), "server/modules/engagement/progress.ts"), "utf8");
const hub = readFileSync(resolve(process.cwd(), "src/pages/engagement/EngagementHub.tsx"), "utf8");
const fanLevel = readFileSync(resolve(process.cwd(), "src/pages/engagement/EngagementFanLevel.tsx"), "utf8");
const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
const wallet = readFileSync(resolve(process.cwd(), "server/modules/wallet/ledger.ts"), "utf8");
const payout = readFileSync(resolve(process.cwd(), "server/modules/payouts/service.ts"), "utf8");

describe("PAGE-048 Missions ownership", () => {
  it("has one /engagement/missions owner gated by the shared hub flag", () => {
    expect(app.match(/path="\/engagement\/missions"/g)?.length).toBe(1);
    expect(app).not.toMatch(/<EngagementGate/);
    expect(app).not.toMatch(/path="\/missions"|path="\/engagement\/tasks"|path="\/rewards\/missions"/);
    expect(page).toMatch(/title="Close"|aria-label="Close"/);
    expect(page).toMatch(/Missions/);
    expect(page).not.toMatch(/PageScaffold|EngagementListPage|EngagementMissionsV2|history\.back|navigate\(-1\)|location\.reload|setTimeout\(/);
    expect(page).not.toMatch(/WebSocket|wsClient|new WebSocket|localStorage|sessionStorage/);
    expect(page).toMatch(/ENGAGEMENT_HOME/);
  });

  it("loads and claims through one missions contract", () => {
    expect(api).toMatch(/\/api\/engagement\/missions/);
    expect(api).toMatch(/\/claim/);
    expect(api).not.toMatch(/\/api\/wallet|\/api\/test-coins/);
    expect(router).toMatch(/router\.get\("\/missions"/);
    expect(router).toMatch(/router\.post\("\/missions\/:id\/claim"/);
    expect(router).toMatch(/listMissionsForUser|claimMissionForUser/);
    expect(missions).toMatch(/period_key/);
    expect(missions).toMatch(/alreadyClaimed/);
    expect(missions).toMatch(/bucket: "promo"/);
    expect(missions).not.toMatch(/bucket: "paid"|applyWalletDelta\([\s\S]*bucket: "starter"/);
    expect(progress).toMatch(/missionPeriodKey/);
    expect(progress).not.toMatch(/progress \+= 1/);
    expect(session).not.toMatch(/localStorage|sessionStorage|setTimeout\(|location\.reload/);
    expect(wallet).toMatch(/Test coins are not wallet money/);
    expect(payout).not.toMatch(/claimMissionForUser|listMissionsForUser/);
  });

  it("does not take PAGE-047 or PAGE-049 ownership", () => {
    expect(hub).toMatch(/SettingsOptionSheet/);
    expect(hub).not.toMatch(/createEngagementMissionsSession/);
    expect(fanLevel).not.toMatch(/createEngagementMissionsSession|EngagementListPage/);
    expect(page).not.toMatch(/EngagementListPage|\/engagement\/fan-level/);
  });
});
