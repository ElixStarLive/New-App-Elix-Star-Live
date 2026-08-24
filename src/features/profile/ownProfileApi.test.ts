import { describe, expect, it, vi } from "vitest";
import { apiFetchOwnProfile } from "./ownProfileApi";

const apiRequest = vi.hoisted(() => vi.fn());

vi.mock("@/lib/apiClient", () => ({
  apiRequest,
  apiUploadForm: vi.fn(),
}));

vi.mock("@/features/feed/feedApi", () => ({
  apiFetchLikedFeed: vi.fn(),
  apiFetchReposts: vi.fn(),
  apiFetchSavedFeed: vi.fn(),
  apiFetchStories: vi.fn(),
  apiFetchUserVideos: vi.fn(),
}));

vi.mock("@/features/shop/shopApi", () => ({
  apiListShopItems: vi.fn(),
}));

describe("PAGE-024 own profile API", () => {
  it("requests GET /api/profiles/me and never a client-supplied user id", async () => {
    apiRequest.mockResolvedValue({
      data: {
        user: {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          username: "owner",
          displayName: "Owner",
          avatarUrl: null,
          bio: "",
          isVerified: false,
          followerCount: 0,
          followingCount: 0,
          likeCount: 0,
          viewCount: 0,
        },
      },
      error: null,
    });
    const res = await apiFetchOwnProfile();
    expect(apiRequest).toHaveBeenCalledWith("/api/profiles/me");
    expect(apiRequest.mock.calls.some((call) => String(call[0]).includes("/api/profiles/aaaaaaaa"))).toBe(false);
    expect(res.profile?.username).toBe("owner");
  });
});
