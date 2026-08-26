import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const overlay = readFileSync(resolve(process.cwd(), "src/components/StemFeedOverlay.tsx"), "utf8");
const feedApi = readFileSync(resolve(process.cwd(), "src/features/feed/feedApi.ts"), "utf8");
const profileRouter = readFileSync(resolve(process.cwd(), "server/modules/profile/router.ts"), "utf8");
const stemPage = readFileSync(resolve(process.cwd(), "src/pages/StemFeed.tsx"), "utf8");
const query = readFileSync(resolve(process.cwd(), "server/modules/feed/query.ts"), "utf8");
const feedRouter = readFileSync(resolve(process.cwd(), "server/modules/feed/router.ts"), "utf8");
const stemHook = readFileSync(resolve(process.cwd(), "src/features/feed/useStemFeed.ts"), "utf8");
const appShell = readFileSync(resolve(process.cwd(), "src/lib/appShell.ts"), "utf8");
const eligibility = readFileSync(resolve(process.cwd(), "shared/stemEligibility.ts"), "utf8");

describe("PAGE-008 STEM ownership", () => {
  it("uses server STEM ranking and shared ForYouPlayer without live cards", () => {
    expect(stemPage).toMatch(/useStemFeed/);
    expect(stemPage).toMatch(/ForYouPlayer/);
    expect(stemPage).toMatch(/StemFeedOverlay/);
    expect(stemPage).not.toMatch(/ForYouLiveCard|InlineLiveViewer|apiFetchForYouFeed/);
    expect(stemHook).toMatch(/apiFetchStemFeed/);
    expect(stemHook).toMatch(/viewerId/);
    expect(stemHook).not.toMatch(/wsClient\.connect/);
    expect(feedApi).toMatch(/\/api\/feed\/stem/);
    expect(feedRouter).toMatch(/router\.get\("\/stem"/);
    expect(query).toMatch(/queryStemPage|queryStemRanked/);
    expect(query).toMatch(/STEM_MAX|STEM_TOP_TRENDING|STEM_EXTRA_SLOTS/);
    expect(eligibility).toMatch(/STEM_TOP_TRENDING = 40/);
    expect(eligibility).toMatch(/STEM_EXTRA_SLOTS = 20/);
    expect(eligibility).toMatch(/STEM_MAX = 55/);
  });

  it("hides For You TopNav on /stem and keeps BottomNav shell path", () => {
    expect(appShell).toMatch(/pathname === "\/stem"/);
    expect(appShell).toMatch(/isFeedNoTopBarPath/);
    expect(appShell).toMatch(/isTopNavVisiblePath[\s\S]*pathname === "\/feed"/);
  });

  it("search returns to STEM and back exits to For You", () => {
    expect(overlay).toMatch(/containerReturnState\("\/stem"\)/);
    expect(overlay).toMatch(/navigate\(FEED_HOME,\s*\{\s*replace:\s*true\s*\}\)/);
    expect(overlay).not.toMatch(/history\.back\(|navigate\(-1\)/);
  });

  it("restores suggested-user circles via GET /api/profiles and PAGE-006 WS consume-only", () => {
    expect(profileRouter).toMatch(/router\.get\("\/"/);
    expect(feedApi).toMatch(/export async function apiFetchProfiles/);
    expect(overlay).toMatch(/apiFetchProfiles/);
    expect(overlay).toMatch(/suggestedUsers/);
    expect(overlay).toMatch(/\/watch\//);
    expect(overlay).toMatch(/\/profile\//);
    expect(overlay).toMatch(/wsClient\.on\("stream_started"/);
    expect(overlay).toMatch(/wsClient\.on\("stream_ended"/);
    expect(overlay).not.toMatch(/wsClient\.connect|new WebSocket/);
  });

  it("does not keep a client-side GET /api/videos STEM fallback owner", () => {
    expect(stemHook).not.toMatch(/\/api\/videos(?!\/)/);
    expect(stemPage).not.toMatch(/apiFetchAllVideos|rankStemItems\(/);
  });
});
