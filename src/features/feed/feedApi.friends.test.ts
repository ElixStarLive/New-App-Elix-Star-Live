import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetchFriendsFeed } from "./feedApi";

vi.mock("@/lib/apiClient", () => ({
  apiRequest: vi.fn(),
  apiUploadForm: vi.fn(),
}));

import { apiRequest } from "@/lib/apiClient";

const apiRequestMock = vi.mocked(apiRequest);

const feedVideo = {
  id: "00000000-0000-4000-8000-000000000101",
  url: "https://cdn.example.com/a.mp4",
  thumbnail: "https://cdn.example.com/t.jpg",
  duration: "0:15",
  user: {
    id: "00000000-0000-4000-8000-000000000001",
    username: "andrei",
    name: "Andrei",
    avatar: "https://cdn.example.com/a.jpg",
    level: 1,
    isVerified: false,
    followers: 0,
    following: 0,
  },
  description: "",
  hashtags: [] as string[],
  music: null,
  stats: { views: 0, likes: 0, comments: 0, shares: 0, saves: 0 },
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

describe("PAGE-010 friends feed API", () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
  });

  it("does not treat an empty friends catalog as invalid", async () => {
    apiRequestMock.mockResolvedValue({ data: { videos: [] }, error: null });
    const res = await apiFetchFriendsFeed();
    expect(apiRequestMock).toHaveBeenCalledWith("/api/feed/friends");
    expect(res.error).toBeNull();
    expect(res.feed).toEqual({ videos: [] });
  });

  it("keeps frozen videos[] responses", async () => {
    apiRequestMock.mockResolvedValue({
      data: { videos: [feedVideo] },
      error: null,
    });
    const res = await apiFetchFriendsFeed();
    expect(res.feed?.videos).toHaveLength(1);
    expect(res.feed?.videos[0]?.url).toBe(feedVideo.url);
  });

  it("rejects items/nextCursor instead of mapping it", async () => {
    apiRequestMock.mockResolvedValue({
      data: { items: [feedVideo], nextCursor: "k1" },
      error: null,
    });
    const res = await apiFetchFriendsFeed();
    expect(res.feed).toBeNull();
    expect(res.error).toBe("Invalid feed response");
  });
});
