import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(resolve(process.cwd(), "src/pages/FriendsFeed.tsx"), "utf8");
const query = readFileSync(resolve(process.cwd(), "server/modules/feed/query.ts"), "utf8");
const router = readFileSync(resolve(process.cwd(), "server/modules/feed/router.ts"), "utf8");

describe("PAGE-010 Friends ownership", () => {
  it("uses Friends overlay chrome and follow∪follower feed", () => {
    expect(page).toMatch(/title="Friends"/);
    expect(page).toMatch(/followingFirst=\{false\}/);
    expect(page).toMatch(/returnPath="\/friends"/);
    expect(page).toMatch(/No friend videos yet/);
    expect(query).toMatch(/queryFriendsPage/);
    expect(query).toMatch(/follower_id FROM follows WHERE following_id|follower_id FROM follows WHERE followee_id/);
    expect(router).toMatch(/\/friends/);
  });
});
