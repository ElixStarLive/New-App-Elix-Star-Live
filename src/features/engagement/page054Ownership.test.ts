import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(resolve(process.cwd(), "src/pages/engagement/EngagementCollections.tsx"), "utf8");
const api = readFileSync(resolve(process.cwd(), "src/features/engagement/engagementCollectionsApi.ts"), "utf8");
const session = readFileSync(resolve(process.cwd(), "src/features/engagement/engagementCollectionsSession.ts"), "utf8");
const router = readFileSync(resolve(process.cwd(), "server/modules/engagement/router.ts"), "utf8");
const collections = readFileSync(resolve(process.cwd(), "server/modules/engagement/collections.ts"), "utf8");
const dailyLogin = readFileSync(resolve(process.cwd(), "server/modules/engagement/dailyLogin.ts"), "utf8");
const missions = readFileSync(resolve(process.cwd(), "server/modules/engagement/missions.ts"), "utf8");
const gifts = readFileSync(resolve(process.cwd(), "server/modules/gifts/router.ts"), "utf8");
const hubPage = readFileSync(resolve(process.cwd(), "src/pages/engagement/EngagementHub.tsx"), "utf8");
const rewards = readFileSync(resolve(process.cwd(), "src/pages/engagement/EngagementRewards.tsx"), "utf8");
const daily = readFileSync(resolve(process.cwd(), "src/pages/engagement/EngagementDailyLogin.tsx"), "utf8");
const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
const wallet = readFileSync(resolve(process.cwd(), "server/modules/wallet/ledger.ts"), "utf8");
const payout = readFileSync(resolve(process.cwd(), "server/modules/payouts/service.ts"), "utf8");
const flags = readFileSync(resolve(process.cwd(), "src/config/engagementFlags.ts"), "utf8");
const rising = readFileSync(resolve(process.cwd(), "src/pages/RisingStars.tsx"), "utf8");

describe("PAGE-054 Collections ownership", () => {
  it("has one /engagement/collections owner gated by the shared hub flag", () => {
    expect(app.match(/path="\/engagement\/collections"/g)?.length).toBe(1);
    expect(app).not.toMatch(/<EngagementGate/);
    expect(app).not.toMatch(/path="\/collections"|path="\/engagement\/stickers"|path="\/engagement\/treasure"|path="\/engagement\/cards"/);
    expect(page).toMatch(/title="Close"|aria-label="Close"/);
    expect(page).toMatch(/Collections/);
    expect(page).toMatch(/Treasure Hunt/);
    expect(page).toMatch(/Stickers/);
    expect(page).toMatch(/Creator Cards/);
    expect(page).not.toMatch(/PageScaffold|EngagementListPage|CollectionsV2|CollectionsFixed|history\.back|navigate\(-1\)|location\.reload|setTimeout\(/);
    expect(page).not.toMatch(/WebSocket|wsClient|new WebSocket|localStorage|sessionStorage|Math\.random/);
    expect(page).toMatch(/ENGAGEMENT_HOME/);
    expect(flags).toMatch(/VITE_ENGAGEMENT_HUB_ENABLED/);
  });

  it("loads inventory and opens chests through the exact server contracts", () => {
    expect(api).toMatch(/\/api\/engagement\/treasure/);
    expect(api).toMatch(/\/api\/engagement\/treasure\/\$\{encodeURIComponent\(chestId\)\}\/open/);
    expect(api).toMatch(/\/api\/engagement\/stickers/);
    expect(api).toMatch(/\/api\/engagement\/creator-cards/);
    expect(api).not.toMatch(/\/api\/engagement\/collections|\/api\/wallet|\/api\/test-coins|Math\.random/);
    expect(router).toMatch(/router\.get\("\/treasure"/);
    expect(router).toMatch(/router\.post\("\/treasure\/spawn"/);
    expect(router).toMatch(/router\.post\("\/treasure\/:chestId\/open"/);
    expect(router).toMatch(/router\.get\("\/stickers"/);
    expect(router).toMatch(/router\.get\("\/creator-cards"/);
    expect(router).toMatch(/SPAWN_SERVER_ONLY/);
    expect(router).toMatch(/listChestsForUser\(req\.userId/);
    expect(router).toMatch(/openTreasureChestForUser\(req\.userId/);
    expect(router).toMatch(/listStickersForUser\(req\.userId/);
    expect(router).toMatch(/listCreatorCardsForUser\(req\.userId/);
    expect(router).not.toMatch(/router\.get\("\/collections"|saved videos|liked videos/);
    expect(collections).toMatch(/user_treasure_chests/);
    expect(collections).toMatch(/treasure_chest_defs/);
    expect(collections).toMatch(/user_stickers/);
    expect(collections).toMatch(/user_creator_cards/);
    expect(collections).toMatch(/alreadyOpened/);
    expect(collections).toMatch(/FOR UPDATE OF c/);
    expect(collections).toMatch(/bucket: "promo"/);
    expect(collections).toMatch(/grantEngagementXp/);
    expect(collections).toMatch(/user_sticker_set_completions/);
    expect(collections).not.toMatch(/bucket: "paid"|bucket: "starter"|test_coins|withdraw-gbp|Math\.random/);
    expect(collections).not.toMatch(/localStorage|new WebSocket|setInterval/);
    expect(dailyLogin).toMatch(/spawnTreasureChest/);
    expect(dailyLogin).toMatch(/chest_rare_missions/);
    expect(dailyLogin).toMatch(/chest_legendary_streak/);
    expect(missions).toMatch(/spawnTreasureChest/);
    expect(missions).toMatch(/chest_rare_missions/);
    expect(gifts).toMatch(/recordCreatorGiftProgress/);
    expect(session).toMatch(/const gen = \+\+generation/);
    expect(session).toMatch(/const reloadGen = \+\+generation/);
    expect(session).not.toMatch(/localStorage|sessionStorage|setTimeout\(|location\.reload|Math\.random|owned = true/);
    expect(wallet).toMatch(/Test coins are not wallet money/);
    expect(payout).not.toMatch(/openTreasureChestForUser|listChestsForUser|grantStickerForUser/);
  });

  it("does not take PAGE-047, PAGE-052, PAGE-053, or PAGE-055 ownership", () => {
    expect(hubPage).toMatch(/SettingsOptionSheet/);
    expect(hubPage).toMatch(/\/engagement\/collections/);
    expect(hubPage).not.toMatch(/createEngagementCollectionsSession|treasure\/.*open/);
    expect(rewards).not.toMatch(/createEngagementCollectionsSession|\/engagement\/collections/);
    expect(daily).not.toMatch(/createEngagementCollectionsSession|\/engagement\/collections/);
    expect(page).not.toMatch(/SettingsOptionSheet|Claim today|Reward Wallet|Rising Stars/);
    expect(rising).not.toMatch(/createEngagementCollectionsSession|\/engagement\/collections/);
  });
});
