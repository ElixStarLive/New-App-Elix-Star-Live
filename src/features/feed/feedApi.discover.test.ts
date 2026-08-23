import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiDiscoverSearch, apiFetchDiscover } from "./feedApi";

vi.mock("@/lib/apiClient", () => ({
  apiRequest: vi.fn(),
  apiUploadForm: vi.fn(),
}));

import { apiRequest } from "@/lib/apiClient";

const apiRequestMock = vi.mocked(apiRequest);

const video = {
  id: "22222222-2222-4222-8222-222222222222",
  url: "https://cdn.example/v.mp4",
  thumbnail: "https://cdn.example/t.jpg",
  duration: "0:15",
  user: {
    id: "33333333-3333-4333-8333-333333333333",
    username: "creator",
    name: "Creator",
    avatar: "https://cdn.example/a.jpg",
    level: 1,
    isVerified: false,
    followers: 0,
    following: 0,
  },
  description: "nsfw",
  hashtags: [] as string[],
  music: null,
  stats: { views: 9, likes: 1, comments: 0, shares: 0, saves: 0 },
  createdAt: null,
  location: "",
  isLiked: false,
  isSaved: false,
  isFollowing: false,
  comments: [] as unknown[],
  quality: "",
  privacy: "public",
  engagementScore: 0,
};

describe("PAGE-011 Discover API", () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
  });

  it("reads the aggregate Explore contract and parses nested feed videos", async () => {
    apiRequestMock.mockResolvedValue({
      data: {
        trending: [video],
        hashtags: [{ tag: "Dance", useCount: 3 }],
        rankings: [{ userId: "u1", username: "a", displayName: "A", avatarUrl: null, rank: 1, totalCoins: 10 }],
      },
      error: null,
    });
    const res = await apiFetchDiscover();
    expect(apiRequestMock).toHaveBeenCalledWith("/api/discover");
    expect(res.error).toBeNull();
    expect(res.trending.map((row) => row.id)).toEqual(["22222222-2222-4222-8222-222222222222"]);
    expect(res.hashtags).toEqual([{ tag: "Dance", useCount: 3 }]);
    expect(res.rankings[0]?.totalCoins).toBe(10);
  });

  it("rejects a tags-only legacy payload", async () => {
    apiRequestMock.mockResolvedValue({ data: { tags: ["a"] }, error: null });
    const res = await apiFetchDiscover();
    expect(res.error).toBe("Invalid discover response");
    expect(res.trending).toEqual([]);
  });

  it("searches Discover in-page without calling PAGE-012 /api/search", async () => {
    apiRequestMock.mockResolvedValue({
      data: {
        users: [{ userId: "u1", username: "maya", displayName: "Maya", avatarUrl: null, followerCount: 2, isFollowing: false }],
        videos: [video],
      },
      error: null,
    });
    const res = await apiDiscoverSearch("ma");
    expect(apiRequestMock).toHaveBeenCalledWith("/api/discover/search?q=ma");
    expect(res.users[0]?.username).toBe("maya");
    expect(res.videos).toHaveLength(1);
    expect(res.videos[0]?.url).toBe(video.url);
  });
});
