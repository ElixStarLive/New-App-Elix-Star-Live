import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetchStemFeed } from "./feedApi";

vi.mock("@/lib/apiClient", () => ({
  apiRequest: vi.fn(),
  apiUploadForm: vi.fn(),
}));

import { apiRequest } from "@/lib/apiClient";

const apiRequestMock = vi.mocked(apiRequest);

const stemVideo = {
  id: "44444444-4444-4444-8444-444444444444",
  url: "https://cdn.example.com/s.mp4",
  thumbnail: "https://cdn.example.com/t.jpg",
  duration: "0:15",
  user: {
    id: "33333333-3333-4333-8333-333333333333",
    username: "maya",
    name: "Maya",
    avatar: "https://cdn.example.com/a.jpg",
    level: 1,
    isVerified: false,
    followers: 0,
    following: 0,
  },
  description: "beach day",
  hashtags: [] as string[],
  music: null,
  stats: { views: 12, likes: 3, comments: 1, shares: 0, saves: 0 },
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

describe("PAGE-008 STEM feed API", () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
  });

  it("loads GET /api/feed/stem with videos + off cursor", async () => {
    apiRequestMock.mockResolvedValue({ data: { videos: [stemVideo], nextCursor: null }, error: null });
    const res = await apiFetchStemFeed();
    expect(apiRequestMock).toHaveBeenCalledWith("/api/feed/stem");
    expect(res.error).toBeNull();
    expect(res.page?.videos[0]?.id).toBe(stemVideo.id);
    expect(res.page?.nextCursor).toBeNull();
  });

  it("passes the cursor and keeps nested video rows", async () => {
    apiRequestMock.mockResolvedValue({
      data: { videos: [stemVideo], nextCursor: "off:20" },
      error: null,
    });
    const res = await apiFetchStemFeed("off:20");
    expect(apiRequestMock).toHaveBeenCalledWith("/api/feed/stem?cursor=off%3A20");
    expect(res.page?.nextCursor).toBe("off:20");
    expect(res.page?.videos[0]?.url).toBe(stemVideo.url);
  });

  it("rejects invented items[] STEM envelopes", async () => {
    apiRequestMock.mockResolvedValue({
      data: { items: [stemVideo], nextCursor: null },
      error: null,
    });
    const res = await apiFetchStemFeed();
    expect(res.page).toBeNull();
    expect(res.error).toBe("Invalid feed response");
  });
});
