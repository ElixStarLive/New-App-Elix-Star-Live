import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(resolve(process.cwd(), "src/pages/engagement/EngagementFanLevel.tsx"), "utf8");
const api = readFileSync(resolve(process.cwd(), "src/features/engagement/engagementFanLevelApi.ts"), "utf8");
const session = readFileSync(resolve(process.cwd(), "src/features/engagement/engagementFanLevelSession.ts"), "utf8");
const router = readFileSync(resolve(process.cwd(), "server/modules/engagement/router.ts"), "utf8");
const progression = readFileSync(resolve(process.cwd(), "server/modules/engagement/progression.ts"), "utf8");
const hubPage = readFileSync(resolve(process.cwd(), "src/pages/engagement/EngagementHub.tsx"), "utf8");
const missions = readFileSync(resolve(process.cwd(), "src/pages/engagement/EngagementMissions.tsx"), "utf8");
const mvp = readFileSync(resolve(process.cwd(), "src/pages/engagement/EngagementMvp.tsx"), "utf8");
const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
const wallet = readFileSync(resolve(process.cwd(), "server/modules/wallet/ledger.ts"), "utf8");
const payout = readFileSync(resolve(process.cwd(), "server/modules/payouts/service.ts"), "utf8");
const flags = readFileSync(resolve(process.cwd(), "src/config/engagementFlags.ts"), "utf8");

describe("PAGE-049 Fan Level ownership", () => {
  it("has one /engagement/fan-level owner gated by the shared hub flag", () => {
    expect(app.match(/path="\/engagement\/fan-level"/g)?.length).toBe(1);
    expect(app).not.toMatch(/<EngagementGate/);
    expect(app).not.toMatch(/path="\/fan-level"|path="\/engagement\/level"|path="\/progression\/level"/);
    expect(page).toMatch(/title="Close"|aria-label="Close"/);
    expect(page).toMatch(/Fan Level/);
    expect(page).not.toMatch(/PageScaffold|EngagementListPage|FanLevelV2|FanLevelFixed|history\.back|navigate\(-1\)|location\.reload|setTimeout\(/);
    expect(page).not.toMatch(/WebSocket|wsClient|new WebSocket|localStorage|sessionStorage/);
    expect(page).toMatch(/ENGAGEMENT_HOME/);
    expect(flags).toMatch(/VITE_ENGAGEMENT_HUB_ENABLED/);
  });

  it("loads one fan-level GET and keeps XP unmerged from money", () => {
    expect(api).toMatch(/\/api\/engagement\/fan-level/);
    expect(api).not.toMatch(/\/api\/wallet|\/api\/test-coins|\/api\/engagement\/hub/);
    expect(router).toMatch(/router\.get\("\/fan-level"/);
    expect(router).toMatch(/getFanLevelForUser\(req\.userId/);
    expect(router).not.toMatch(/router\.post\("\/fan-level"/);
    expect(progression).toMatch(/xp_level_requirements/);
    expect(progression).toMatch(/deriveFanLevel|levelForTotalXp/);
    expect(progression).not.toMatch(/paid_coins|withdraw-gbp|test_coins|localStorage/);
    expect(session).not.toMatch(/localStorage|sessionStorage|setTimeout\(|location\.reload|level \+=|xp \+=/);
    expect(wallet).toMatch(/Test coins are not wallet money/);
    expect(payout).not.toMatch(/getFanLevelForUser|grantEngagementXp/);
  });

  it("does not take PAGE-047, PAGE-048, or PAGE-050 ownership", () => {
    expect(hubPage).toMatch(/SettingsOptionSheet/);
    expect(hubPage).toMatch(/\/engagement\/fan-level/);
    expect(hubPage).not.toMatch(/createEngagementFanLevelSession/);
    expect(missions).not.toMatch(/createEngagementFanLevelSession|\/engagement\/fan-level/);
    expect(mvp).not.toMatch(/createEngagementFanLevelSession|\/api\/engagement\/fan-level/);
    expect(page).not.toMatch(/EngagementListPage|\/engagement\/mvp|Achievements/);
  });
});
