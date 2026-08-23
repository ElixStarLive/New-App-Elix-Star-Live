import { describe, expect, it, vi } from "vitest";
import { apiFetchPublicProfile, isProfileUserId } from "./publicProfileApi";

const apiRequest = vi.hoisted(() => vi.fn());

vi.mock("@/lib/apiClient", () => ({
  apiRequest,
  apiUploadForm: vi.fn(),
}));

vi.mock("@/features/feed/feedApi", () => ({
  apiFetchReposts: vi.fn(),
  apiFetchStories: vi.fn(),
  apiFetchUserLikedFeed: vi.fn(),
  apiFetchUserSavedFeed: vi.fn(),
  apiFetchUserVideos: vi.fn(),
  apiFollow: vi.fn(),
  apiUnfollow: vi.fn(),
}));

vi.mock("@/features/shop/shopApi", () => ({
  apiListShopItems: vi.fn(),
}));

const user = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  username: "creator",
  displayName: "Creator",
  avatarUrl: null,
  bio: "hi",
  isVerified: false,
  followerCount: 1,
  followingCount: 2,
  likeCount: 3,
  viewCount: 4,
  isLive: false,
  isFollowing: false,
};

describe("PAGE-025 public profile API", () => {
  it("treats UUID routes as id lookup and usernames as by-username", async () => {
    expect(isProfileUserId(user.id)).toBe(true);
    expect(isProfileUserId("creator")).toBe(false);
    apiRequest.mockResolvedValue({ data: { user }, error: null });
    await apiFetchPublicProfile(user.id);
    expect(apiRequest).toHaveBeenCalledWith(`/api/profiles/${user.id}`);
    apiRequest.mockClear();
    apiRequest.mockResolvedValue({ data: { user }, error: null });
    await apiFetchPublicProfile("creator");
    expect(apiRequest).toHaveBeenCalledWith("/api/profiles/by-username/creator");
    expect(apiRequest.mock.calls.some((call) => String(call[0]) === "/api/profiles/me")).toBe(false);
  });
});
