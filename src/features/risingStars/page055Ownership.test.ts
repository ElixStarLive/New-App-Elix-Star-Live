import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(resolve(process.cwd(), "src/pages/RisingStars.tsx"), "utf8");
const api = readFileSync(resolve(process.cwd(), "src/features/risingStars/risingStarsApi.ts"), "utf8");
const session = readFileSync(resolve(process.cwd(), "src/features/risingStars/risingStarsSession.ts"), "utf8");
const hub = readFileSync(resolve(process.cwd(), "server/modules/risingStars/hub.ts"), "utf8");
const router = readFileSync(resolve(process.cwd(), "server/modules/risingStars/router.ts"), "utf8");
const challenge = readFileSync(resolve(process.cwd(), "src/pages/RisingStarsChallenge.tsx"), "utf8");
const admin = readFileSync(resolve(process.cwd(), "src/pages/admin/RisingStars.tsx"), "utf8");
const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
const wallet = readFileSync(resolve(process.cwd(), "server/modules/wallet/ledger.ts"), "utf8");
const payout = readFileSync(resolve(process.cwd(), "server/modules/payouts/service.ts"), "utf8");
const ws = readFileSync(resolve(process.cwd(), "src/lib/wsClient.ts"), "utf8");
const migration = readFileSync(
  resolve(process.cwd(), "server/migrations/20260822060000_rising_stars_page055.sql"),
  "utf8",
);

describe("PAGE-055 Rising Stars ownership", () => {
  it("has one authenticated /rising-stars owner and no invented aliases", () => {
    expect(app.match(/path="\/rising-stars"/g)?.length).toBe(1);
    expect(app).toMatch(/<Route path="\/rising-stars" element=\{<RisingStars \/>\} \/>/);
    expect(app).toMatch(/<Route element=\{<RequireAuth \/>\}>/);
    expect(app).not.toMatch(/path="\/stars"|path="\/rising"|path="\/challenges"|path="\/engagement\/rising-stars"/);
    expect(page).toMatch(/aria-label="Back"/);
    expect(page).toMatch(/Rising Stars/);
    expect(page).toMatch(/All categories/);
    expect(page).toMatch(/All regions/);
    expect(page).toMatch(/Challenges/);
    expect(page).toMatch(/Standings/);
    expect(page).toMatch(/Teams/);
    expect(page).toMatch(/\/rising-stars\/challenge\/\$\{encodeURIComponent\(id\)\}/);
    expect(page).not.toMatch(/PageScaffold|RisingStarsV2|RisingStarsFixed|history\.back|navigate\(-1\)|location\.reload|setTimeout\(/);
    expect(page).not.toMatch(/WebSocket|wsClient|new WebSocket|localStorage|sessionStorage|Math\.random/);
    expect(page).not.toMatch(/Enter challenge|Join team|\/enter|\/vote/);
    expect(page).not.toMatch(/apiRisingStarsRewards|apiRisingStarsMyBadges|freeze|disqualif|AdminTablePage/);
    expect(page).toMatch(/RISING_STARS_EXIT_TO/);
    expect(page).toMatch(/exitToFromLocationState/);
  });

  it("uses the exact public landing contracts and server-owned ranks", () => {
    expect(api).toMatch(/\/api\/rising-stars\/seasons\/current/);
    expect(api).toMatch(/\/api\/rising-stars\/categories\?seasonId=/);
    expect(api).toMatch(/\/api\/rising-stars\/regions\?seasonId=/);
    expect(api).toMatch(/\/api\/rising-stars\/challenges\?/);
    expect(api).toMatch(/\/api\/rising-stars\/seasons\/\$\{encodeURIComponent\(seasonId\)\}\/standings/);
    expect(api).toMatch(/\/api\/rising-stars\/teams\?seasonId=/);
    expect(api).toMatch(/\/api\/rising-stars\/badges\/user\/\$\{encodeURIComponent\(userId\)\}/);
    expect(api).not.toMatch(/\/api\/rising-stars"\s*|\/api\/rising-stars`/);
    expect(router).toMatch(/router\.get\("\/seasons\/current"/);
    expect(router).toMatch(/router\.get\("\/categories"/);
    expect(router).toMatch(/router\.get\("\/regions"/);
    expect(router).toMatch(/router\.get\("\/challenges"/);
    expect(router).toMatch(/router\.get\("\/teams"/);
    expect(router).toMatch(/router\.get\("\/rewards"/);
    expect(router).toMatch(/router\.get\("\/badges\/me"/);
    expect(router).toMatch(/router\.get\("\/badges\/user\/:userId"/);
    expect(router).not.toMatch(/router\.get\("\/"/);
    expect(router).toMatch(/res\.json\(\{ season: await getCurrentRisingStarsSeason\(\) \}\)/);
    expect(hub).toMatch(/WHERE status = 'active'/);
    expect(hub).toMatch(/ORDER BY week_index ASC, opens_at ASC/);
    expect(hub).toMatch(/assignStandingRanks/);
    expect(hub).toMatch(/ORDER BY total_votes DESC/);
    expect(hub).toMatch(/e\.user_id AS creator_user_id/);
    expect(hub).not.toMatch(/localStorage|new WebSocket|setInterval|Math\.random/);
    expect(session).not.toMatch(/localStorage|sessionStorage|setTimeout\(|location\.reload|Math\.random|score:\s*999/);
    expect(wallet).toMatch(/Test coins are not wallet money/);
    expect(payout).not.toMatch(/listRisingStarsStandings|getCurrentRisingStarsSeason|rs_reward_grants/);
  });

  it("keeps PAGE-056 and PAGE-077 out of this landing and does not add a second WS", () => {
    expect(app).toMatch(/path="\/rising-stars\/challenge\/:challengeId"/);
    expect(challenge).toMatch(/Submit entry/);
    expect(page).not.toMatch(/Enter challenge|Withdraw|Attach live|Join team/);
    expect(admin).toMatch(/ADMIN_RISING_STARS_TITLE/);
    expect(admin).not.toMatch(/AdminTablePage|getCurrentRisingStarsSeason|attachRisingStarsLive/);
    expect(hub).not.toMatch(/CREATE TABLE|INSERT INTO rs_admin|freezeSeason|disqualify/);
    expect(ws).toMatch(/class WsClient/);
    expect(page).not.toMatch(/reconnectOnForeground|new WebSocket/);
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS rs_categories/);
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS rs_regions/);
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS rs_teams/);
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS rs_badges/);
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS rs_reward_definitions/);
    expect(migration).not.toMatch(/rs_seasons_v2|rising_stars_fixed/);
  });
});
