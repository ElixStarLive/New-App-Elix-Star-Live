import { afterEach, describe, expect, it, vi } from "vitest";
import { blockLiveProfileUser, loadLiveProfile, toggleLiveProfileFollow } from "./useLiveProfileOverlay";

const profile = {
  id: "22222222-2222-4222-8222-222222222222",
  username: "maya",
  displayName: "Maya",
  avatarUrl: null,
  bio: "hello",
  isVerified: false,
  followerCount: 4,
  followingCount: 2,
  likeCount: 1,
  viewCount: 8,
  isFollowing: false,
};

describe("loadLiveProfile", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("loads the selected userId and rejects a stale User A response", async () => {
    const fetchProfile = vi.fn(async () => ({ profile, error: null }));
    const current = await loadLiveProfile({
      userId: profile.id,
      generation: 2,
      isCurrent: (ticket) => ticket === 2,
      fetchProfile,
    });
    expect(current).toEqual({ ok: true, profile });
    const stale = await loadLiveProfile({
      userId: profile.id,
      generation: 1,
      isCurrent: () => false,
      fetchProfile,
    });
    expect(stale).toEqual({ ok: false, error: "stale" });
  });

  it("does not invent a user when the id is missing", async () => {
    const fetchProfile = vi.fn();
    const result = await loadLiveProfile({
      userId: "   ",
      generation: 1,
      isCurrent: () => true,
      fetchProfile,
    });
    expect(result.ok).toBe(false);
    expect(fetchProfile).not.toHaveBeenCalled();
  });
});

describe("toggleLiveProfileFollow", () => {
  it("uses the shared follow API and blocks self-follow", async () => {
    const follow = vi.fn(async () => ({ ok: true as const }));
    const unfollow = vi.fn(async () => ({ ok: true as const }));
    const self = await toggleLiveProfileFollow({
      userId: profile.id,
      following: false,
      isSelf: true,
      follow,
      unfollow,
    });
    expect(self.ok).toBe(false);
    expect(follow).not.toHaveBeenCalled();
    const followed = await toggleLiveProfileFollow({
      userId: profile.id,
      following: false,
      isSelf: false,
      follow,
      unfollow,
    });
    expect(followed).toEqual({ ok: true, following: true });
    expect(follow).toHaveBeenCalledWith(profile.id);
  });
});

describe("blockLiveProfileUser", () => {
  it("uses the shared block API and blocks self-block", async () => {
    const block = vi.fn(async () => ({ ok: true as const }));
    const self = await blockLiveProfileUser({ userId: profile.id, isSelf: true, block });
    expect(self.ok).toBe(false);
    expect(block).not.toHaveBeenCalled();
    const blocked = await blockLiveProfileUser({ userId: profile.id, isSelf: false, block });
    expect(blocked).toEqual({ ok: true });
    expect(block).toHaveBeenCalledWith(profile.id);
  });
});
