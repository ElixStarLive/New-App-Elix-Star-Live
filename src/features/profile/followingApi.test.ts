import { describe, expect, it, vi } from "vitest";
import { apiFetchFollowing } from "./followingApi";

const apiRequest = vi.hoisted(() => vi.fn());

vi.mock("@/lib/apiClient", () => ({
  apiRequest,
}));

vi.mock("@/features/feed/feedApi", () => ({
  apiFollow: vi.fn(),
  apiUnfollow: vi.fn(),
}));

describe("PAGE-028 following API", () => {
  it("loads GET /api/profiles/:id/following only", async () => {
    apiRequest.mockResolvedValue({
      data: {
        users: [
          {
            id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            username: "star",
            displayName: "Star",
            avatarUrl: null,
            bio: "",
            isVerified: false,
            followerCount: 0,
            followingCount: 0,
            isFollowing: true,
          },
        ],
      },
      error: null,
    });
    const res = await apiFetchFollowing("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(apiRequest).toHaveBeenCalledWith("/api/profiles/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/following");
    expect(res.users[0]?.username).toBe("star");
    expect(res.error).toBeNull();
  });

  it("surfaces blocked 403 status from GET following", async () => {
    apiRequest.mockResolvedValue({
      data: null,
      error: { message: "You cannot view this profile", status: 403 },
    });
    const res = await apiFetchFollowing("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(res.users).toEqual([]);
    expect(res.error).toBe("You cannot view this profile");
    expect(res.status).toBe(403);
  });
});
