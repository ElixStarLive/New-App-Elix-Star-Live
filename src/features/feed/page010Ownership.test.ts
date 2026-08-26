import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(resolve(process.cwd(), "src/pages/FriendsFeed.tsx"), "utf8");
const snap = readFileSync(resolve(process.cwd(), "src/components/RelationSnapFeed.tsx"), "utf8");
const hook = readFileSync(resolve(process.cwd(), "src/features/feed/useFriendsFeed.ts"), "utf8");
const feedApi = readFileSync(resolve(process.cwd(), "src/features/feed/feedApi.ts"), "utf8");
const query = readFileSync(resolve(process.cwd(), "server/modules/feed/query.ts"), "utf8");
const router = readFileSync(resolve(process.cwd(), "server/modules/feed/router.ts"), "utf8");
const bottomNav = readFileSync(resolve(process.cwd(), "src/components/BottomNav.tsx"), "utf8");
const appShell = readFileSync(resolve(process.cwd(), "src/lib/appShell.ts"), "utf8");

describe("PAGE-010 Friends ownership", () => {
  it("uses Friends overlay chrome and follow∪follower feed (not mutual-only)", () => {
    expect(page).toMatch(/useFriendsFeed/);
    expect(page).toMatch(/title="Friends"/);
    expect(page).toMatch(/followingFirst=\{false\}/);
    expect(page).toMatch(/returnPath="\/friends"/);
    expect(page).toMatch(/No friend videos yet/);
    expect(page).toMatch(/Add story/);
    expect(page).toMatch(/Discover people/);
    expect(page).toMatch(/onFollowSettled/);
    expect(page).toMatch(/feed\.reload\(\)/);
    expect(page).not.toMatch(/apiFetchForYouFeed|apiFetchFollowingFeed|apiFetchStemFeed/);
    expect(hook).toMatch(/apiFetchFriendsFeed/);
    expect(hook).toMatch(/viewerId/);
    expect(hook).not.toMatch(/wsClient\.connect/);
    expect(feedApi).toMatch(/\/api\/feed\/friends/);
    expect(query).toMatch(/queryFriendsPage/);
    expect(query).toMatch(/followee_id FROM follows WHERE follower_id/);
    expect(query).toMatch(/follower_id FROM follows WHERE followee_id/);
    expect(query).toMatch(/ORDER BY v\.created_at DESC/);
    expect(query).not.toMatch(/following_id/);
    expect(router).toMatch(/router\.get\("\/friends"/);
  });

  it("keeps BottomNav Friends active and TopNav hidden on /friends", () => {
    expect(bottomNav).toMatch(/path: "\/friends"/);
    expect(bottomNav).toMatch(/label: "Friends"/);
    expect(appShell).toMatch(/pathname === "\/friends"/);
    expect(appShell).toMatch(/isFeedNoTopBarPath/);
  });

  it("reloads Friends membership after follow changes instead of blind remove", () => {
    expect(snap).toMatch(/onFollowSettled\?:/);
    expect(page).toMatch(/void feed\.reload\(\)/);
  });
});
