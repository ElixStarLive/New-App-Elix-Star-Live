import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetchSearch } from "./feedApi";

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
  description: "dance night",
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

describe("PAGE-012 Search API", () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
  });

  it("loads browse without a query", async () => {
    apiRequestMock.mockResolvedValue({ data: { users: [], videos: [video] }, error: null });
    const res = await apiFetchSearch({ category: "All" });
    expect(apiRequestMock).toHaveBeenCalledWith("/api/search?category=All");
    expect(res.videos).toHaveLength(1);
    expect(res.users).toEqual([]);
  });

  it("loads users and videos for a trimmed query", async () => {
    apiRequestMock.mockResolvedValue({
      data: {
        users: [{ userId: "u1", username: "maya", displayName: "Maya", avatarUrl: null }],
        videos: [video],
      },
      error: null,
    });
    const res = await apiFetchSearch({ q: "  maya  " });
    expect(apiRequestMock).toHaveBeenCalledWith("/api/search?q=maya");
    expect(res.users[0]?.username).toBe("maya");
    expect(res.videos).toHaveLength(1);
    expect(res.videos[0]?.url).toBe(video.url);
  });

  it("rejects the old mixed results payload", async () => {
    apiRequestMock.mockResolvedValue({ data: { results: [] }, error: null });
    const res = await apiFetchSearch({ q: "x" });
    expect(res.error).toBe("Invalid search response");
  });
});
