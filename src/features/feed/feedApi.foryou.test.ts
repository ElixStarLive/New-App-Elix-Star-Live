import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetchForYouFeed, parseForYouPage } from "./feedApi";

vi.mock("@/lib/apiClient", () => ({
  apiRequest: vi.fn(),
  apiUploadForm: vi.fn(),
}));

import { apiRequest } from "@/lib/apiClient";

const apiRequestMock = vi.mocked(apiRequest);

const newItem = {
  id: "00000000-0000-4000-8000-000000000101",
  kind: "video" as const,
  userId: "00000000-0000-4000-8000-000000000001",
  username: "andrei",
  displayName: "Andrei",
  avatarUrl: null,
  caption: "hello",
  mediaUrl: "https://cdn.example.com/a.mp4",
};

const productionVideo = {
  id: "vid-not-uuid",
  url: "https://cdn.example.com/b.mp4",
  thumbnail: "https://cdn.example.com/b.jpg",
  user: {
    id: "user-not-uuid",
    username: "maya",
    name: "Maya",
    avatar: "https://cdn.example.com/maya.jpg",
  },
  description: "clip",
  hashtags: ["live"],
  music: { id: "original" },
  stats: { views: 12, likes: 3, comments: 1, shares: 0, saves: 2 },
  createdAt: "2026-08-20T10:00:00.000Z",
  isLiked: true,
  isSaved: false,
  isFollowing: true,
};

describe("parseForYouPage", () => {
  it("keeps the NEW items/nextCursor page", () => {
    const page = parseForYouPage({ items: [newItem], nextCursor: "off:20" });
    expect(page).toEqual({ items: [expect.objectContaining({ id: newItem.id, kind: "video" })], nextCursor: "off:20" });
  });

  it("maps production videos[] into FeedPage items", () => {
    const page = parseForYouPage({
      videos: [productionVideo],
      page: 1,
      limit: 20,
      hasMore: true,
      total: 20,
      source: "postgres",
      mutualUserIds: [],
    });
    expect(page).not.toBeNull();
    expect(page?.nextCursor).toBe("off:20");
    expect(page?.items).toEqual([
      expect.objectContaining({
        id: "vid-not-uuid",
        kind: "video",
        userId: "user-not-uuid",
        username: "maya",
        displayName: "Maya",
        mediaUrl: "https://cdn.example.com/b.mp4",
        thumbnailUrl: "https://cdn.example.com/b.jpg",
        caption: "clip",
        viewCount: 12,
        likeCount: 3,
        liked: true,
        isFollowing: true,
      }),
    ]);
  });

  it("rejects bodies that are neither items nor videos", () => {
    expect(parseForYouPage({ ok: true })).toBeNull();
  });

  it("rejects a videos array that cannot be mapped to feed items", () => {
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

  it("loads production For You videos without a cursor", async () => {
    apiRequestMock.mockResolvedValue({
      data: { videos: [productionVideo], page: 1, limit: 20, hasMore: false, total: 1, source: "postgres" },
      error: null,
    });
    const res = await apiFetchForYouFeed();
    expect(apiRequestMock).toHaveBeenCalledWith("/api/feed/foryou");
    expect(res.error).toBeNull();
    expect(res.page?.items[0]?.id).toBe("vid-not-uuid");
    expect(res.page?.nextCursor).toBeNull();
  });

  it("sends production page/limit together with the NEW offset cursor", async () => {
    apiRequestMock.mockResolvedValue({
      data: { videos: [], page: 2, limit: 20, hasMore: false, total: 20, source: "postgres" },
      error: null,
    });
    await apiFetchForYouFeed("off:20");
    expect(apiRequestMock).toHaveBeenCalledWith("/api/feed/foryou?cursor=off%3A20&page=2&limit=20");
  });
});
