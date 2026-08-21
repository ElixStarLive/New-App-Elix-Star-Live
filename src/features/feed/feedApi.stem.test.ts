import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetchStemFeed } from "./feedApi";

vi.mock("@/lib/apiClient", () => ({
  apiRequest: vi.fn(),
  apiUploadForm: vi.fn(),
}));

import { apiRequest } from "@/lib/apiClient";

const apiRequestMock = vi.mocked(apiRequest);

const productionVideo = {
  id: "stem-1",
  url: "https://cdn.example.com/s.mp4",
  thumbnail: "https://cdn.example.com/s.jpg",
  privacy: "public",
  user: { id: "user-1", username: "maya", name: "Maya" },
  description: "clip",
  stats: { views: 12, likes: 3, comments: 1, shares: 0, saves: 0 },
};

describe("PAGE-008 STEM feed", () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
  });

  it("loads GET /api/videos not /api/feed/stem", async () => {
    apiRequestMock.mockResolvedValue({ data: { videos: [productionVideo] }, error: null });
    const res = await apiFetchStemFeed();
    expect(apiRequestMock).toHaveBeenCalledWith("/api/videos");
    expect(res.error).toBeNull();
    expect(res.page?.items[0]?.id).toBe("stem-1");
    expect(res.page?.nextCursor).toBeNull();
  });

  it("drops private rows", async () => {
    apiRequestMock.mockResolvedValue({
      data: {
        videos: [productionVideo, { ...productionVideo, id: "priv", privacy: "private" }],
      },
      error: null,
    });
    const res = await apiFetchStemFeed();
    expect(res.page?.items.map((item) => item.id)).toEqual(["stem-1"]);
  });

  it("does not refetch when a cursor is passed", async () => {
    const res = await apiFetchStemFeed("off:20");
    expect(apiRequestMock).not.toHaveBeenCalled();
    expect(res.page?.items).toEqual([]);
  });
});
