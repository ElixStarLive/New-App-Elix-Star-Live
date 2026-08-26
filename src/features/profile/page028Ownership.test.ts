import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
const page = readFileSync(resolve(process.cwd(), "src/pages/FollowingList.tsx"), "utf8");
const session = readFileSync(resolve(process.cwd(), "src/features/profile/followingSession.ts"), "utf8");
const api = readFileSync(resolve(process.cwd(), "src/features/profile/followingApi.ts"), "utf8");
const followersPage = readFileSync(resolve(process.cwd(), "src/pages/Followers.tsx"), "utf8");
const router = readFileSync(resolve(process.cwd(), "server/modules/profile/router.ts"), "utf8");

describe("PAGE-028 following list ownership", () => {
  it("owns /profile/:userId/following with one session and GET following", () => {
    expect(app).toMatch(/path="\/profile\/:userId\/following" element=\{<FollowingList \/>\}/);
    expect(app).toMatch(/path="\/profile\/:userId\/followers" element=\{<Followers \/>\}/);
    expect(app).not.toMatch(/FollowList/);
    expect(api).toMatch(/\/following/);
    expect(api).not.toMatch(/\/followers/);
    expect(session).toMatch(/apiFetchFollowing/);
    expect(session).not.toMatch(/setTimeout|location\.reload/);
    expect(page).not.toMatch(/location\.reload|FollowingListOld|FollowingListNew|FollowingListV2|FollowList/);
    expect(page).toMatch(/Not following anyone yet/);
    expect(page).not.toMatch(/No followers yet/);
    expect(page).not.toMatch(/wsClient|new WebSocket/);
  });

  it("does not share the Following list page owner with Followers", () => {
    expect(followersPage).not.toMatch(/Not following anyone yet/);
    expect(followersPage).toMatch(/No followers yet/);
    expect(router).toMatch(/listFollowingUsers/);
    expect(router).toMatch(/listFollowerUsers/);
    expect(router).toMatch(/JOIN users u ON u\.id = f\.followee_id/);
  });

  it("syncs via the shared follow relationship bus and shared follow writers", () => {
    expect(page).toMatch(/subscribeFollowRelationship/);
    expect(session).toMatch(/applyFollowEvent/);
    expect(session).toMatch(/isOwnList/);
    expect(api).toMatch(/apiFollow\(/);
    expect(api).toMatch(/apiUnfollow\(/);
    expect(page).not.toMatch(/Follow Back/);
  });
});
