import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(resolve(process.cwd(), "src/pages/RisingStarsChallenge.tsx"), "utf8");
const landing = readFileSync(resolve(process.cwd(), "src/pages/RisingStars.tsx"), "utf8");
const api = readFileSync(resolve(process.cwd(), "src/features/risingStars/risingStarsApi.ts"), "utf8");
const session = readFileSync(resolve(process.cwd(), "src/features/risingStars/risingStarsChallengeSession.ts"), "utf8");
const challenge = readFileSync(resolve(process.cwd(), "server/modules/risingStars/challenge.ts"), "utf8");
const router = readFileSync(resolve(process.cwd(), "server/modules/risingStars/router.ts"), "utf8");
const admin = readFileSync(resolve(process.cwd(), "src/pages/admin/RisingStars.tsx"), "utf8");
const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
const ws = readFileSync(resolve(process.cwd(), "src/lib/wsClient.ts"), "utf8");
const liveStart = readFileSync(resolve(process.cwd(), "server/modules/live/start.ts"), "utf8");
const wallet = readFileSync(resolve(process.cwd(), "server/modules/wallet/ledger.ts"), "utf8");
const payout = readFileSync(resolve(process.cwd(), "server/modules/payouts/service.ts"), "utf8");

describe("PAGE-056 Rising Stars Challenge ownership", () => {
  it("owns one authenticated challenge route and no invented aliases", () => {
    expect(app.match(/path="\/rising-stars\/challenge\/:challengeId"/g)?.length).toBe(1);
    expect(app).toMatch(/<Route path="\/rising-stars\/challenge\/:challengeId" element=\{<RisingStarsChallenge \/>\} \/>/);
    expect(app).not.toMatch(/path="\/challenge\/:id"|path="\/rising-stars\/:challengeId"|path="\/stars\/challenge/);
    expect(page).toMatch(/useParams<\{ challengeId: string \}>/);
    expect(page).toMatch(/challengeId: routeChallengeId/);
    expect(page).not.toMatch(/PageScaffold|RisingStarsChallengeV2|ChallengeFixed/);
    expect(page).not.toMatch(/history\.back|navigate\(-1\)|location\.reload|setTimeout\(/);
    expect(page).not.toMatch(/localStorage|sessionStorage|Math\.random|new WebSocket|wsClient/);
    expect(page).toMatch(/RISING_STARS_HOME/);
    expect(page).toMatch(/exitToFromLocationState/);
    expect(landing).toMatch(/\/rising-stars\/challenge\/\$\{encodeURIComponent\(id\)\}/);
    expect(landing).not.toMatch(/Submit entry|Withdraw entry|Attach live/);
  });

  it("uses the exact challenge contracts and ignores client-chosen score or rank", () => {
    expect(api).toMatch(/\/api\/rising-stars\/challenges\/\$\{encodeURIComponent\(challengeId\)\}`/);
    expect(api).toMatch(/\/api\/rising-stars\/challenges\/\$\{encodeURIComponent\(challengeId\)\}\/entries/);
    expect(api).toMatch(/\/api\/rising-stars\/challenges\/\$\{encodeURIComponent\(challengeId\)\}\/leaderboard/);
    expect(api).toMatch(/\/api\/rising-stars\/challenges\/\$\{encodeURIComponent\(challengeId\)\}\/live/);
    expect(api).toMatch(/\/api\/rising-stars\/challenges\/\$\{encodeURIComponent\(challengeId\)\}\/enter/);
    expect(api).toMatch(/\/api\/rising-stars\/entries\/\$\{encodeURIComponent\(entryId\)\}`/);
    expect(api).toMatch(/\/api\/rising-stars\/entries\/\$\{encodeURIComponent\(entryId\)\}\/vote/);
    expect(api).toMatch(/\/api\/rising-stars\/teams\/\$\{encodeURIComponent\(teamId\)\}\/join/);
    expect(api).toMatch(/\/api\/rising-stars\/challenges\/\$\{encodeURIComponent\(challengeId\)\}\/live\/attach/);
    expect(api).not.toMatch(/\/api\/rising-stars\/\$\{/);
    expect(router).toMatch(/router\.get\("\/challenges\/:id"/);
    expect(router).toMatch(/router\.post\("\/challenges\/:id\/enter"/);
    expect(router).toMatch(/router\.delete\("\/entries\/:id"/);
    expect(router).toMatch(/router\.post\("\/entries\/:id\/vote"/);
    expect(router).toMatch(/router\.post\("\/teams\/:id\/join"/);
    expect(router).toMatch(/router\.post\("\/challenges\/:id\/live\/attach"/);
    expect(router).not.toMatch(/router\.get\("\/:challengeId"/);
    expect(router).not.toMatch(/router\.post\("\/:challengeId\/enter"/);
    expect(router).not.toMatch(/router\.post\("\/:challengeId\/vote"/);
    expect(challenge).toMatch(/userId: req\.userId|userId: input\.userId|userId = requireRisingStarsUuid\(input\.userId/);
    expect(challenge).toMatch(/ON CONFLICT \(challenge_id, user_id\) DO NOTHING/);
    expect(challenge).toMatch(/ON CONFLICT \(user_id, challenge_id, vote_day\) DO NOTHING/);
    expect(challenge).toMatch(/opens_at <= NOW\(\) AND closes_at >= NOW\(\)/);
    expect(challenge).toMatch(/CANNOT_VOTE_SELF/);
    expect(challenge).toMatch(/WHERE room_id = \$1/);
    expect(challenge).not.toMatch(/score:\s*100000|Date\.now\(\)/);
    expect(challenge).not.toMatch(/rank:\s*Number\(|req\.body\?\.rank|body\.rank/);
    expect(session).not.toMatch(/localStorage|sessionStorage|location\.reload|setTimeout\(|Math\.random|score:\s*999/);
    expect(session).not.toMatch(/new WebSocket|wsClient/);
  });

  it("reuses Live, wallet, payout, and the one global WebSocket", () => {
    expect(page).toMatch(/\/watch\/\$\{encodeURIComponent\(roomId\)\}/);
    expect(page).not.toMatch(/livekit|Room\(|connect\(/);
    expect(challenge).not.toMatch(/createLivekitToken|livekitRooms|startLive/);
    expect(liveStart).toMatch(/const roomId = hostId/);
    expect(ws).toMatch(/class WsClient/);
    expect(page).not.toMatch(/reconnectOnForeground|new WebSocket/);
    expect(admin).toMatch(/ADMIN_RISING_STARS_TITLE/);
    expect(admin).not.toMatch(/attachRisingStarsLive|enterRisingStarsChallenge|voteRisingStarsEntry/);
    expect(wallet).toMatch(/Test coins are not wallet money/);
    expect(payout).not.toMatch(/enterRisingStarsChallenge|rs_reward_grants|voteRisingStarsEntry/);
  });
});
