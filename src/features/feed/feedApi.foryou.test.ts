import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetchForYouFeed, parseForYouPage } from "./feedApi";

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
  description: "hello",
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

describe("parseForYouPage", () => {
  it("accepts the frozen OLD foryou page", () => {
    const page = parseForYouPage({
      videos: [feedVideo],
      mutualUserIds: [],
      page: 1,
      limit: 20,
      hasMore: false,
      total: 1,
      source: "foryou",
    });
    expect(page?.videos[0]?.id).toBe(feedVideo.id);
    expect(page?.hasMore).toBe(false);
  });

  it("keeps viewer liked/saved/follow flags on feed videos", () => {
    const page = parseForYouPage({
      videos: [{ ...feedVideo, isLiked: true, isSaved: true, isFollowing: true }],
      mutualUserIds: [],
      page: 1,
      limit: 20,
      hasMore: false,
      total: 1,
      source: "foryou",
    });
    expect(page?.videos[0]).toEqual(
      expect.objectContaining({ id: feedVideo.id, isLiked: true, isSaved: true, isFollowing: true }),
    );
  });

  it("rejects NEW items/nextCursor and other invalid bodies", () => {
    expect(parseForYouPage({ items: [feedVideo], nextCursor: null })).toBeNull();
    expect(parseForYouPage({ ok: true })).toBeNull();
    expect(parseForYouPage({ videos: [{ id: "x" }], hasMore: false })).toBeNull();
  });
});

describe("apiFetchForYouFeed", () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
  });

  it("returns Invalid feed response when the body cannot be mapped", async () => {
    apiRequestMock.mockResolvedValue({ data: { ok: true }, error: null });
    const res = await apiFetchForYouFeed();
    expect(res.page).toBeNull();
    expect(res.error).toBe("Invalid feed response");
  });

  it("loads GET /api/feed/foryou with page/limit query", async () => {
    apiRequestMock.mockResolvedValue({
      data: {
        videos: [feedVideo],
        mutualUserIds: [],
        page: 1,
        limit: 20,
        hasMore: false,
        total: 1,
        source: "foryou",
      },
      error: null,
    });
    const res = await apiFetchForYouFeed(1, 20);
    expect(apiRequestMock).toHaveBeenCalledWith("/api/feed/foryou?page=1&limit=20");
    expect(res.error).toBeNull();
    expect(res.page?.videos[0]?.id).toBe(feedVideo.id);
    expect(res.page?.hasMore).toBe(false);
  });

  it("rejects items/nextCursor responses", async () => {
    apiRequestMock.mockResolvedValue({
      data: { items: [feedVideo], nextCursor: null },
      error: null,
    });
    const res = await apiFetchForYouFeed();
    expect(res.page).toBeNull();
    expect(res.error).toBe("Invalid feed response");
  });
});
