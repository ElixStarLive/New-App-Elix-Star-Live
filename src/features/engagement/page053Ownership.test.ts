import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(resolve(process.cwd(), "src/pages/engagement/EngagementDailyLogin.tsx"), "utf8");
const api = readFileSync(resolve(process.cwd(), "src/features/engagement/engagementDailyLoginApi.ts"), "utf8");
const session = readFileSync(resolve(process.cwd(), "src/features/engagement/engagementDailyLoginSession.ts"), "utf8");
const router = readFileSync(resolve(process.cwd(), "server/modules/engagement/router.ts"), "utf8");
const dailyLogin = readFileSync(resolve(process.cwd(), "server/modules/engagement/dailyLogin.ts"), "utf8");
const hub = readFileSync(resolve(process.cwd(), "server/modules/engagement/hub.ts"), "utf8");
const hubPage = readFileSync(resolve(process.cwd(), "src/pages/engagement/EngagementHub.tsx"), "utf8");
const rewards = readFileSync(resolve(process.cwd(), "src/pages/engagement/EngagementRewards.tsx"), "utf8");
const collections = readFileSync(resolve(process.cwd(), "src/pages/engagement/EngagementCollections.tsx"), "utf8");
const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
const wallet = readFileSync(resolve(process.cwd(), "server/modules/wallet/ledger.ts"), "utf8");
const payout = readFileSync(resolve(process.cwd(), "server/modules/payouts/service.ts"), "utf8");
const flags = readFileSync(resolve(process.cwd(), "src/config/engagementFlags.ts"), "utf8");

describe("PAGE-053 Daily Login ownership", () => {
  it("has one /engagement/daily-login owner gated by the shared hub flag", () => {
    expect(app.match(/path="\/engagement\/daily-login"/g)?.length).toBe(1);
    expect(app).not.toMatch(/<EngagementGate/);
    expect(app).not.toMatch(/path="\/daily-login"|path="\/daily-rewards"|path="\/engagement\/daily"/);
    expect(page).toMatch(/title="Close"|aria-label="Close"/);
    expect(page).toMatch(/Daily Login/);
    expect(page).not.toMatch(/PageScaffold|EngagementListPage|DailyLoginV2|DailyLoginFixed|history\.back|navigate\(-1\)|location\.reload|setTimeout\(/);
    expect(page).not.toMatch(/WebSocket|wsClient|new WebSocket|localStorage|sessionStorage/);
    expect(page).toMatch(/ENGAGEMENT_HOME/);
    expect(flags).toMatch(/VITE_ENGAGEMENT_HUB_ENABLED/);
  });

  it("loads and claims through one server-clock daily contract", () => {
    expect(api).toMatch(/\/api\/engagement\/daily-login/);
    expect(api).toMatch(/\/api\/engagement\/daily-login\/claim/);
    expect(api).not.toMatch(/\/api\/wallet|\/api\/test-coins|new Date\(/);
    expect(router).toMatch(/router\.get\("\/daily-login"/);
    expect(router).toMatch(/router\.post\("\/daily-login\/claim"/);
    expect(router).toMatch(/getDailyLoginForUser\(req\.userId/);
    expect(router).toMatch(/claimDailyLoginForUser\(req\.userId/);
    expect(router).not.toMatch(/todayKey\(|Math\.min\(7, streak\)/);
    expect(dailyLogin).toMatch(/utcDateKey\(/);
    expect(dailyLogin).toMatch(/daily_reward_config/);
    expect(dailyLogin).toMatch(/daily_login_claims/);
    expect(dailyLogin).toMatch(/alreadyClaimed/);
    expect(dailyLogin).toMatch(/bucket: "promo"/);
    expect(dailyLogin).toMatch(/grantEngagementXp/);
    expect(dailyLogin).not.toMatch(/bucket: "paid"|bucket: "starter"|test_coins|withdraw-gbp/);
    expect(dailyLogin).not.toMatch(/new Date\(\)\.toISOString|localStorage|new WebSocket|setInterval/);
    expect(hub).toMatch(/getDailyLoginSummary/);
    expect(session).not.toMatch(/localStorage|sessionStorage|setTimeout\(|location\.reload|streak \+=|reward \+=/);
    expect(wallet).toMatch(/Test coins are not wallet money/);
    expect(payout).not.toMatch(/claimDailyLoginForUser|getDailyLoginForUser/);
  });

  it("does not take PAGE-047, PAGE-052, or PAGE-054 ownership", () => {
    expect(hubPage).toMatch(/SettingsOptionSheet/);
    expect(hubPage).toMatch(/\/engagement\/daily-login/);
    expect(hubPage).not.toMatch(/createEngagementDailyLoginSession|daily-login\/claim/);
    expect(rewards).not.toMatch(/createEngagementDailyLoginSession|\/engagement\/daily-login/);
    expect(collections).toMatch(/createEngagementCollectionsSession/);
    expect(collections).not.toMatch(/createEngagementDailyLoginSession|daily_reward_config|EngagementListPage/);
    expect(page).not.toMatch(/EngagementListPage|\/engagement\/collections|Collections/);
  });
});
