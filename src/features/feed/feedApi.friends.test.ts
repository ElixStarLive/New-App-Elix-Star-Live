import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetchFriendsFeed } from "./feedApi";

vi.mock("@/lib/apiClient", () => ({
  apiRequest: vi.fn(),
  apiUploadForm: vi.fn(),
}));

import { apiRequest } from "@/lib/apiClient";

const apiRequestMock = vi.mocked(apiRequest);

describe("PAGE-010 friends feed API", () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
  });

  it("does not treat an empty friends catalog as invalid", async () => {
    apiRequestMock.mockResolvedValue({ data: { items: [], nextCursor: null }, error: null });
    const res = await apiFetchFriendsFeed();
    expect(apiRequestMock).toHaveBeenCalledWith("/api/feed/friends");
    expect(res.error).toBeNull();
    expect(res.page).toEqual({ items: [], nextCursor: null });
  });

  it("keeps NEW items/nextCursor pages", async () => {
    apiRequestMock.mockResolvedValue({
      data: {
        items: [
          {
            id: "00000000-0000-4000-8000-000000000101",
            kind: "video",
            userId: "00000000-0000-4000-8000-000000000001",
            username: "andrei",
            displayName: "Andrei",
            avatarUrl: null,
            mediaUrl: "https://cdn.example.com/a.mp4",
          },
        ],
        nextCursor: "k1",
      },
      error: null,
    });
    const res = await apiFetchFriendsFeed("k1");
    expect(apiRequestMock).toHaveBeenCalledWith("/api/feed/friends?cursor=k1");
    expect(res.page?.nextCursor).toBe("k1");
    expect(res.page?.items).toHaveLength(1);
  });

  it("rejects an old videos[] body instead of mapping it", async () => {
    apiRequestMock.mockResolvedValue({
      data: { videos: [{ id: "vid-friends", url: "https://cdn.example.com/f.mp4" }] },
      error: null,
    });
    const res = await apiFetchFriendsFeed();
    expect(res.page).toBeNull();
    expect(res.error).toBe("Invalid feed response");
  });
});
