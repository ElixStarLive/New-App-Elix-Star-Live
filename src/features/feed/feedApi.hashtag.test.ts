import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetchHashtag } from "./feedApi";

vi.mock("@/lib/apiClient", () => ({
  apiRequest: vi.fn(),
  apiUploadForm: vi.fn(),
}));

import { apiRequest } from "@/lib/apiClient";

const apiRequestMock = vi.mocked(apiRequest);

describe("PAGE-013 Hashtag API", () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
  });

  it("requests the normalized tag on the single hashtag endpoint", async () => {
    apiRequestMock.mockResolvedValue({
      data: {
        tag: "music",
        useCount: 2,
        videos: [{ id: "v1", thumbnailUrl: "https://cdn.example/t.jpg", viewCount: 9 }],
      },
      error: null,
    });
    const res = await apiFetchHashtag("#Music");
    expect(apiRequestMock).toHaveBeenCalledWith("/api/hashtags/music");
    expect(res.tag).toBe("music");
    expect(res.useCount).toBe(2);
    expect(res.videos).toHaveLength(1);
  });

  it("does not call the removed /videos feed path", async () => {
    apiRequestMock.mockResolvedValue({ data: { tag: "x", useCount: 0, videos: [] }, error: null });
    await apiFetchHashtag("x");
    expect(apiRequestMock.mock.calls.some((call) => String(call[0]).includes("/videos"))).toBe(false);
  });

  it("skips the network for an empty tag", async () => {
    const res = await apiFetchHashtag("#");
    expect(apiRequestMock).not.toHaveBeenCalled();
    expect(res.videos).toEqual([]);
  });
});
