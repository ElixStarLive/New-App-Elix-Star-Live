import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(resolve(process.cwd(), "src/pages/LiveDiscover.tsx"), "utf8");
const hook = readFileSync(resolve(process.cwd(), "src/features/live/useLiveDiscover.ts"), "utf8");
const card = readFileSync(resolve(process.cwd(), "src/components/ForYouLiveCard.tsx"), "utf8");
const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
const query = readFileSync(resolve(process.cwd(), "server/modules/live/query.ts"), "utf8");

describe("PAGE-017 Live discover ownership", () => {
  it("lists lives via hook and opens watch by roomId", () => {
    expect(page).toMatch(/useLiveDiscover/);
    expect(page).toMatch(/ForYouLiveCard/);
    expect(page).toMatch(/No one is live right now/);
    expect(page).toMatch(/IntersectionObserver/);
    expect(page).not.toMatch(/elix-page-glass/);
    expect(hook).toMatch(/apiLiveStreams/);
    expect(hook).toMatch(/stream_started/);
    expect(hook).toMatch(/stream_ended/);
    expect(hook).toMatch(/viewerId/);
    expect(hook).toMatch(/wsClient/);
    expect(card).toMatch(/\/watch\//);
  });

  it("uses PAGE-006 wsClient and authoritative GET /api/live/streams", () => {
    expect(hook).not.toMatch(/new WebSocket|connectLiveFeedPresence/);
    expect(query).toMatch(/stream:\$\{/);
    expect(query).toMatch(/getHostPresence/);
    expect(query).toMatch(/expireAbandonedLives/);
  });

  it("routes /live/start to discover before /live/:streamId", () => {
    const startIdx = app.indexOf('path="/live/start"');
    const paramIdx = app.indexOf('path="/live/:streamId"');
    expect(startIdx).toBeGreaterThan(-1);
    expect(paramIdx).toBeGreaterThan(-1);
    expect(startIdx).toBeLessThan(paramIdx);
    expect(app).toMatch(/path="\/live\/start"[^>]*element=\{<Navigate to="\/live"/);
  });

  it("serves GET /api/live/streams via queryLiveStreams only", () => {
    const router = readFileSync(resolve(process.cwd(), "server/modules/live/router.ts"), "utf8");
    expect(router).toMatch(/queryLiveStreams/);
    expect(router).not.toMatch(/FROM live_streams s/);
  });
});
