import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const overlay = readFileSync(resolve(process.cwd(), "src/components/FollowingFeedOverlay.tsx"), "utf8");
const page = readFileSync(resolve(process.cwd(), "src/pages/FollowingFeed.tsx"), "utf8");
const snap = readFileSync(resolve(process.cwd(), "src/components/RelationSnapFeed.tsx"), "utf8");
const hook = readFileSync(resolve(process.cwd(), "src/features/feed/useFollowingFeed.ts"), "utf8");
const feedApi = readFileSync(resolve(process.cwd(), "src/features/feed/feedApi.ts"), "utf8");
const query = readFileSync(resolve(process.cwd(), "server/modules/feed/query.ts"), "utf8");
const feedRouter = readFileSync(resolve(process.cwd(), "server/modules/feed/router.ts"), "utf8");
const appShell = readFileSync(resolve(process.cwd(), "src/lib/appShell.ts"), "utf8");

describe("PAGE-009 Following ownership", () => {
  it("uses GET /api/feed/following with Neon follow relationship ownership", () => {
    expect(page).toMatch(/useFollowingFeed/);
    expect(page).toMatch(/FollowingFeedOverlay/);
    expect(page).not.toMatch(/apiFetchForYouFeed|apiFetchFriendsFeed|apiFetchStemFeed/);
    expect(hook).toMatch(/apiFetchFollowingFeed/);
    expect(hook).toMatch(/viewerId/);
    expect(hook).toMatch(/removeCreator/);
    expect(hook).not.toMatch(/wsClient\.connect/);
    expect(feedApi).toMatch(/\/api\/feed\/following/);
    expect(feedRouter).toMatch(/router\.get\("\/following"/);
    expect(query).toMatch(/queryFollowingPage/);
    expect(query).toMatch(/RELATION_FEED_LIMIT/);
    expect(query).toMatch(/followee_id FROM follows WHERE follower_id/);
    expect(query).toMatch(/ORDER BY v\.created_at DESC/);
    expect(query).not.toMatch(/following_id/);
  });

  it("matches OLD Following chrome: stories title, TopNav hidden, Discover empty CTA", () => {
    expect(overlay).toMatch(/title = "Following"/);
    expect(overlay).toMatch(/followingFirst = true/);
    expect(overlay).toMatch(/containerReturnState\(returnPath\)/);
    expect(overlay).toMatch(/navigate\(FEED_HOME,\s*\{\s*replace:\s*true\s*\}\)/);
    expect(overlay).not.toMatch(/history\.back\(|navigate\(-1\)/);
    expect(page).toMatch(/DISCOVER_HOME/);
    expect(page).toMatch(/containerReturnState\("\/following"\)/);
    expect(page).toMatch(/Discover people/);
    expect(appShell).toMatch(/pathname === "\/following"/);
    expect(appShell).toMatch(/isFeedNoTopBarPath/);
  });

  it("removes unfollowed creators from the snap feed and consumes PAGE-006 WS only", () => {
    expect(snap).toMatch(/onFollowSettled/);
    expect(snap).toMatch(/removeCreator/);
    expect(snap).toMatch(/max-w-\[480px\] mx-auto/);
    expect(snap).toMatch(/overscroll-none/);
    expect(overlay).toMatch(/wsClient\.on\("stream_started"/);
    expect(overlay).toMatch(/wsClient\.on\("stream_ended"/);
    expect(overlay).not.toMatch(/wsClient\.connect|new WebSocket/);
  });

  it("suggests profiles with followed-first then live, and advances image stories", () => {
    expect(overlay).toMatch(/apiFetchProfiles/);
    expect(overlay).toMatch(/suggestedUsers|suggestedStrip/);
    expect(overlay).toMatch(/followedIds\.has/);
    expect(overlay).toMatch(/STORY_IMAGE_MS/);
  });
});
