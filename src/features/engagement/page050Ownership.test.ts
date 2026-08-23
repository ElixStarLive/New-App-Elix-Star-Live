import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(resolve(process.cwd(), "src/pages/engagement/EngagementMvp.tsx"), "utf8");
const api = readFileSync(resolve(process.cwd(), "src/features/engagement/engagementMvpApi.ts"), "utf8");
const session = readFileSync(resolve(process.cwd(), "src/features/engagement/engagementMvpSession.ts"), "utf8");
const router = readFileSync(resolve(process.cwd(), "server/modules/engagement/router.ts"), "utf8");
const mvp = readFileSync(resolve(process.cwd(), "server/modules/engagement/mvp.ts"), "utf8");
const gifts = readFileSync(resolve(process.cwd(), "server/modules/gifts/router.ts"), "utf8");
const hubPage = readFileSync(resolve(process.cwd(), "src/pages/engagement/EngagementHub.tsx"), "utf8");
const fanLevel = readFileSync(resolve(process.cwd(), "src/pages/engagement/EngagementFanLevel.tsx"), "utf8");
const achievements = readFileSync(resolve(process.cwd(), "src/pages/engagement/EngagementAchievements.tsx"), "utf8");
const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
const wallet = readFileSync(resolve(process.cwd(), "server/modules/wallet/ledger.ts"), "utf8");
const payout = readFileSync(resolve(process.cwd(), "server/modules/payouts/service.ts"), "utf8");

describe("PAGE-050 MVP ownership", () => {
  it("has one /engagement/mvp owner gated by the shared hub flag", () => {
    expect(app.match(/path="\/engagement\/mvp"/g)?.length).toBe(1);
    expect(app).not.toMatch(/<EngagementGate/);
    expect(app).not.toMatch(/path="\/mvp"|path="\/engagement\/mvp-level"|path="\/progression\/mvp"/);
    expect(page).toMatch(/title="Close"|aria-label="Close"/);
    expect(page).toMatch(/MVP Leaderboard/);
    expect(page).not.toMatch(/PageScaffold|EngagementListPage|MVPV2|MVPFixed|history\.back|navigate\(-1\)|location\.reload|setTimeout\(/);
    expect(page).not.toMatch(/WebSocket|wsClient|new WebSocket|localStorage|sessionStorage/);
    expect(page).toMatch(/ENGAGEMENT_HOME/);
  });

  it("loads one MVP GET and records gift support, never test coins", () => {
    expect(api).toMatch(/\/api\/engagement\/mvp\?period=/);
    expect(api).not.toMatch(/\/api\/wallet|\/api\/test-coins|energy \+=|isMvp = true/);
    expect(router).toMatch(/router\.get\("\/mvp"/);
    expect(router).toMatch(/getMvpLeaderboard/);
    expect(router).not.toMatch(/router\.post\("\/mvp"/);
    expect(mvp).toMatch(/mvp_scores/);
    expect(mvp).toMatch(/source === "test"/);
    expect(mvp).toMatch(/ON CONFLICT \(gift_transaction_id\)/);
    expect(gifts).toMatch(/addMvpPoints/);
    expect(gifts).toMatch(/paid_gift|promo_gift/);
    expect(session).not.toMatch(/localStorage|sessionStorage|setTimeout\(|location\.reload|points \+=|energy \+=/);
    expect(wallet).toMatch(/Test coins are not wallet money/);
    expect(payout).not.toMatch(/addMvpPoints|getMvpLeaderboard/);
  });

  it("does not take PAGE-047, PAGE-049, or PAGE-051 ownership", () => {
    expect(hubPage).toMatch(/SettingsOptionSheet/);
    expect(hubPage).toMatch(/\/engagement\/mvp/);
    expect(hubPage).not.toMatch(/createEngagementMvpSession/);
    expect(fanLevel).not.toMatch(/createEngagementMvpSession|\/engagement\/mvp/);
    expect(achievements).not.toMatch(/createEngagementMvpSession|EngagementListPage/);
    expect(page).not.toMatch(/EngagementListPage|\/engagement\/achievements|createEngagementFanLevelSession/);
  });
});
