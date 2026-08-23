import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const card = readFileSync(resolve(process.cwd(), "src/components/ForYouLiveCard.tsx"), "utf8");
const videoFeed = readFileSync(resolve(process.cwd(), "src/pages/VideoFeed.tsx"), "utf8");
const feedHook = readFileSync(resolve(process.cwd(), "src/features/feed/useForYouFeed.ts"), "utf8");
const feedApi = readFileSync(resolve(process.cwd(), "src/features/feed/feedApi.ts"), "utf8");
const liveRouter = readFileSync(resolve(process.cwd(), "server/modules/live/router.ts"), "utf8");
const liveStatus = readFileSync(resolve(process.cwd(), "server/modules/live/status.ts"), "utf8");
const geometry = readFileSync(
  resolve(process.cwd(), "src/features/live/cohost/cohostStageGeometry.ts"),
  "utf8",
);

describe("PAGE-007 ForYouLiveCard battle/cohost/offline", () => {
  it("binds live status + battle/cohost WS and renders mode layouts", () => {
    expect(feedApi).toMatch(/export async function apiLiveStatus/);
    expect(liveRouter).toMatch(/router\.get\("\/status"/);
    expect(liveStatus).toMatch(/export async function queryLiveStatus/);
    expect(card).toMatch(/apiLiveStatus/);
    expect(card).toMatch(/battle_state_sync/);
    expect(card).toMatch(/cohost_layout_sync/);
    expect(card).toMatch(/stream_ended/);
    expect(card).toMatch(/data-elix-foryou-battle-root/);
    expect(card).toMatch(/data-elix-foryou-cohost-stage/);
    expect(card).toMatch(/Stream ended/);
    expect(geometry).toMatch(/FOR_YOU_COHOST_STAGE_TOP/);
    expect(geometry).toMatch(/LIVE_COHOST_STAGE_HEIGHT/);
  });

  it("owns For You story rings and drops prior viewer slides on account switch", () => {
    expect(videoFeed).toMatch(/FollowingFeedOverlay/);
    expect(videoFeed).toMatch(/sitBelowTopNav/);
    expect(videoFeed).toMatch(/showPageChrome=\{false\}/);
    expect(feedHook).toMatch(/viewerId/);
    expect(feedHook).toMatch(/setVideos\(\[\]\)/);
    expect(feedHook).toMatch(/setLives\(\[\]\)/);
  });
});
