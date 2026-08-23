import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetchVideoById } from "./feedApi";

vi.mock("@/lib/apiClient", () => ({
  apiRequest: vi.fn(),
  apiUploadForm: vi.fn(),
}));

import { apiRequest } from "@/lib/apiClient";

const apiRequestMock = vi.mocked(apiRequest);

const video = {
  id: "11111111-1111-4111-8111-111111111111",
  url: "https://cdn.example/v.mp4",
  thumbnail: "https://cdn.example/t.jpg",
  duration: "0:15",
  user: {
    id: "22222222-2222-4222-8222-222222222222",
    username: "creator",
    name: "Creator",
    avatar: "https://cdn.example/a.jpg",
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
  isLiked: true,
  isSaved: false,
  isFollowing: true,
  comments: [] as unknown[],
  quality: "",
  privacy: "public",
  engagementScore: 0,
};

describe("PAGE-014 video detail API", () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
  });

  it("requests only GET /api/videos/:id", async () => {
    apiRequestMock.mockResolvedValue({ data: video, error: null });
    const res = await apiFetchVideoById(video.id);
    expect(apiRequestMock).toHaveBeenCalledTimes(1);
    expect(apiRequestMock).toHaveBeenCalledWith(`/api/videos/${video.id}`);
    expect(res.video?.id).toBe(video.id);
    expect(res.video?.isLiked).toBe(true);
    expect(res.video?.isFollowing).toBe(true);
  });

  it("does not scan the catalog when the id is empty", async () => {
    const res = await apiFetchVideoById("  ");
    expect(apiRequestMock).not.toHaveBeenCalled();
    expect(res.video).toBeNull();
    expect(res.status).toBe(404);
  });

  it("surfaces 404 without a For You fallback", async () => {
    apiRequestMock.mockResolvedValue({
      data: null,
      error: { message: "Video not found", status: 404, code: "not_found" },
    });
    const res = await apiFetchVideoById(video.id);
    expect(res.video).toBeNull();
    expect(res.status).toBe(404);
    expect(apiRequestMock.mock.calls.some((call) => String(call[0]).includes("/feed/foryou"))).toBe(false);
  });
});
