import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetchSavedFeed, apiFetchSavedVideos } from "./feedApi";

vi.mock("@/lib/apiClient", () => ({
  apiRequest: vi.fn(),
  apiUploadForm: vi.fn(),
}));

import { apiRequest } from "@/lib/apiClient";

const apiRequestMock = vi.mocked(apiRequest);

const hit = {
  id: "11111111-1111-4111-8111-111111111111",
  thumbnailUrl: "https://cdn.example/t.jpg",
  viewCount: 12,
  mediaUrl: "https://cdn.example/v.mp4",
  userId: "22222222-2222-4222-8222-222222222222",
  username: "creator",
  displayName: "Creator",
};

const feedVideo = {
  id: hit.id,
  url: hit.mediaUrl,
  thumbnail: hit.thumbnailUrl,
  duration: "0:15",
  user: {
    id: hit.userId,
    username: hit.username,
    name: hit.displayName,
    avatar: "https://cdn.example/a.jpg",
    level: 1,
    isVerified: false,
    followers: 0,
    following: 0,
  },
  description: "",
  hashtags: [] as string[],
  music: null,
  stats: { views: hit.viewCount, likes: 0, comments: 0, shares: 0, saves: 0 },
  createdAt: null,
  location: "",
  isLiked: false,
  isSaved: true,
  isFollowing: false,
  comments: [] as unknown[],
  quality: "",
  privacy: "public",
  engagementScore: 0,
};

describe("PAGE-015 saved videos API", () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
  });

  it("requests GET /api/videos/saved/list with limit and offset", async () => {
    apiRequestMock.mockResolvedValue({ data: { videos: [hit], hasMore: true, limit: 50, offset: 0 }, error: null });
    const res = await apiFetchSavedVideos(50, 0);
    expect(apiRequestMock).toHaveBeenCalledTimes(1);
    expect(apiRequestMock).toHaveBeenCalledWith("/api/videos/saved/list?limit=50&offset=0");
    expect(res.videos).toEqual([hit]);
    expect(res.hasMore).toBe(true);
  });

  it("does not fall back to For You or a generic catalog", async () => {
    apiRequestMock.mockResolvedValue({
      data: null,
      error: { message: "Sign in required", status: 401, code: "unauthenticated" },
    });
    const res = await apiFetchSavedVideos();
    expect(res.videos).toEqual([]);
    expect(res.status).toBe(401);
    expect(apiRequestMock.mock.calls.some((call) => String(call[0]).includes("/feed/foryou"))).toBe(false);
    expect(apiRequestMock.mock.calls.some((call) => String(call[0]) === "/api/videos")).toBe(false);
  });

  it("parses saved feed pages as nested FeedVideo rows", async () => {
    apiRequestMock.mockResolvedValue({ data: { videos: [feedVideo], hasMore: false, limit: 50, offset: 0 }, error: null });
    const res = await apiFetchSavedFeed();
    expect(apiRequestMock).toHaveBeenCalledWith("/api/videos/saved/list?limit=50&offset=0");
    expect(res.page?.videos[0]?.id).toBe(feedVideo.id);
    expect(res.page?.videos[0]?.isSaved).toBe(true);
    expect(res.page?.nextCursor).toBeNull();
  });
});
