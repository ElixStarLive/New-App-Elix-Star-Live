import { describe, expect, it, vi } from "vitest";
import { apiFetchFollowers } from "./followersApi";

const apiRequest = vi.hoisted(() => vi.fn());

vi.mock("@/lib/apiClient", () => ({
  apiRequest,
}));

vi.mock("@/features/feed/feedApi", () => ({
  apiFollow: vi.fn(),
  apiUnfollow: vi.fn(),
}));

describe("PAGE-027 followers API", () => {
  it("loads GET /api/profiles/:id/followers only", async () => {
    apiRequest.mockResolvedValue({
      data: {
        users: [
          {
            id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            username: "fan",
            displayName: "Fan",
            avatarUrl: null,
            bio: "",
            isVerified: false,
            followerCount: 0,
            followingCount: 0,
            isFollowing: false,
          },
        ],
      },
      error: null,
    });
    const res = await apiFetchFollowers("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(apiRequest).toHaveBeenCalledWith("/api/profiles/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/followers");
    expect(res.users[0]?.username).toBe("fan");
    expect(res.error).toBeNull();
  });

  it("surfaces blocked 403 status from GET followers", async () => {
    apiRequest.mockResolvedValue({
      data: null,
      error: { message: "You cannot view this profile", status: 403 },
    });
    const res = await apiFetchFollowers("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(res.users).toEqual([]);
    expect(res.error).toBe("You cannot view this profile");
    expect(res.status).toBe(403);
  });
});
