import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
const page = readFileSync(resolve(process.cwd(), "src/pages/Followers.tsx"), "utf8");
const session = readFileSync(resolve(process.cwd(), "src/features/profile/followersSession.ts"), "utf8");
const api = readFileSync(resolve(process.cwd(), "src/features/profile/followersApi.ts"), "utf8");
const router = readFileSync(resolve(process.cwd(), "server/modules/profile/router.ts"), "utf8");
const followingPage = readFileSync(resolve(process.cwd(), "src/pages/FollowingList.tsx"), "utf8");

describe("PAGE-027 followers ownership", () => {
  it("owns /profile/:userId/followers with one session and GET followers", () => {
    expect(app).toMatch(/path="\/profile\/:userId\/followers" element=\{<Followers \/>\}/);
    expect(app).toMatch(/path="\/profile\/:userId\/following" element=\{<FollowingList \/>\}/);
    expect(api).toMatch(/\/followers/);
    expect(api).not.toMatch(/\/following/);
    expect(session).toMatch(/apiFetchFollowers/);
    expect(session).not.toMatch(/setTimeout/);
    expect(page).not.toMatch(/location\.reload|FollowersOld|FollowersNew|FollowersV2/);
    expect(page).toMatch(/No followers yet/);
  });

  it("does not share the Followers page owner with Following", () => {
    expect(followingPage).not.toMatch(/No followers yet/);
    expect(followingPage).toMatch(/Not following anyone yet/);
    expect(router).toMatch(/listFollowerUsers/);
    expect(router).toMatch(/JOIN users u ON u\.id = f\.follower_id/);
    expect(router).toMatch(/ORDER BY f\.created_at DESC/);
  });
});
