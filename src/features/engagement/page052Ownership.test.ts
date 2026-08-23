import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(resolve(process.cwd(), "src/pages/engagement/EngagementRewards.tsx"), "utf8");
const api = readFileSync(resolve(process.cwd(), "src/features/engagement/engagementRewardWalletApi.ts"), "utf8");
const session = readFileSync(resolve(process.cwd(), "src/features/engagement/engagementRewardWalletSession.ts"), "utf8");
const router = readFileSync(resolve(process.cwd(), "server/modules/engagement/router.ts"), "utf8");
const rewardWallet = readFileSync(resolve(process.cwd(), "server/modules/engagement/rewardWallet.ts"), "utf8");
const hubPage = readFileSync(resolve(process.cwd(), "src/pages/engagement/EngagementHub.tsx"), "utf8");
const missions = readFileSync(resolve(process.cwd(), "src/pages/engagement/EngagementMissions.tsx"), "utf8");
const fanLevel = readFileSync(resolve(process.cwd(), "src/pages/engagement/EngagementFanLevel.tsx"), "utf8");
const mvp = readFileSync(resolve(process.cwd(), "src/pages/engagement/EngagementMvp.tsx"), "utf8");
const achievements = readFileSync(resolve(process.cwd(), "src/pages/engagement/EngagementAchievements.tsx"), "utf8");
const daily = readFileSync(resolve(process.cwd(), "src/pages/engagement/EngagementDailyLogin.tsx"), "utf8");
const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
const wallet = readFileSync(resolve(process.cwd(), "server/modules/wallet/ledger.ts"), "utf8");
const payout = readFileSync(resolve(process.cwd(), "server/modules/payouts/service.ts"), "utf8");
const flags = readFileSync(resolve(process.cwd(), "src/config/engagementFlags.ts"), "utf8");

describe("PAGE-052 Reward Wallet ownership", () => {
  it("has one /engagement/rewards owner gated by the shared hub flag", () => {
    expect(app.match(/path="\/engagement\/rewards"/g)?.length).toBe(1);
    expect(app).not.toMatch(/<EngagementGate/);
    expect(app).not.toMatch(/path="\/rewards"|path="\/engagement\/wallet"|path="\/reward-wallet"/);
    expect(page).toMatch(/title="Close"|aria-label="Close"/);
    expect(page).toMatch(/Reward Wallet/);
    expect(page).not.toMatch(/PageScaffold|EngagementListPage|RewardWalletV2|RewardWalletFixed|history\.back|navigate\(-1\)|location\.reload|setTimeout\(/);
    expect(page).not.toMatch(/WebSocket|wsClient|new WebSocket|localStorage|sessionStorage/);
    expect(page).not.toMatch(/Total Balance|paid \+|starter \+|promo \+|energy \+|xp \+/);
    expect(page).toMatch(/ENGAGEMENT_HOME/);
    expect(flags).toMatch(/VITE_ENGAGEMENT_HUB_ENABLED/);
  });

  it("loads one engagement wallet GET from PAGE-039 balances plus shared progression", () => {
    expect(api).toMatch(/\/api\/engagement\/wallet/);
    expect(api).not.toMatch(/\/api\/test-coins|\/api\/engagement\/rewards|purchasedCoins \+/);
    expect(router).toMatch(/router\.get\("\/wallet"/);
    expect(router).toMatch(/getRewardWalletForUser\(req\.userId/);
    expect(router).not.toMatch(/router\.post\("\/wallet"|router\.get\("\/rewards"|router\.post\("\/rewards"/);
    expect(rewardWallet).toMatch(/wallet_balances/);
    expect(rewardWallet).toMatch(/paid_coins/);
    expect(rewardWallet).toMatch(/getProgressionSnapshot/);
    expect(rewardWallet).not.toMatch(/test_coins|withdraw-gbp|localStorage|new WebSocket/);
    expect(session).not.toMatch(/localStorage|sessionStorage|setTimeout\(|location\.reload|paid \+=|promo \+=|xp \+=/);
    expect(wallet).toMatch(/Test coins are not wallet money/);
    expect(payout).not.toMatch(/getRewardWalletForUser|totalGiftSpendable/);
  });

  it("does not take PAGE-047â€“051 or PAGE-053 ownership", () => {
    expect(hubPage).toMatch(/SettingsOptionSheet/);
    expect(hubPage).toMatch(/\/engagement\/rewards/);
    expect(hubPage).not.toMatch(/createEngagementRewardWalletSession/);
    expect(missions).not.toMatch(/createEngagementRewardWalletSession|\/engagement\/rewards/);
    expect(fanLevel).not.toMatch(/createEngagementRewardWalletSession|\/api\/engagement\/wallet/);
    expect(mvp).not.toMatch(/createEngagementRewardWalletSession|\/engagement\/rewards/);
    expect(achievements).not.toMatch(/createEngagementRewardWalletSession|\/engagement\/rewards/);
    expect(daily).not.toMatch(/createEngagementRewardWalletSession|\/api\/engagement\/wallet/);
    expect(page).not.toMatch(/EngagementListPage|Claim today|Daily Login/);
  });
});
