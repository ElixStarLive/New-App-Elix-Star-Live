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

describe("parseForYouPage", () => {
  it("keeps the NEW items/nextCursor page", () => {
    const page = parseForYouPage({ items: [newItem], nextCursor: "off:20" });
    expect(page).toEqual({ items: [expect.objectContaining({ id: newItem.id, kind: "video" })], nextCursor: "off:20" });
  });

  it("keeps viewer liked/saved/follow flags on NEW foryou items", () => {
    const page = parseForYouPage({
      items: [{ ...newItem, liked: true, saved: true, isFollowing: true }],
      nextCursor: null,
    });
    expect(page?.items[0]).toEqual(
      expect.objectContaining({ id: newItem.id, liked: true, saved: true, isFollowing: true }),
    );
  });

  it("rejects bodies that are not a NEW feed page", () => {
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

  it("loads GET /api/feed/foryou with the NEW page only", async () => {
    apiRequestMock.mockResolvedValue({
      data: { items: [newItem], nextCursor: null },
      error: null,
    });
    const res = await apiFetchForYouFeed();
    expect(apiRequestMock).toHaveBeenCalledWith("/api/feed/foryou");
    expect(res.error).toBeNull();
    expect(res.page?.items[0]?.id).toBe(newItem.id);
    expect(res.page?.nextCursor).toBeNull();
  });

  it("sends only the NEW offset cursor", async () => {
    apiRequestMock.mockResolvedValue({
      data: { items: [], nextCursor: null },
      error: null,
    });
    await apiFetchForYouFeed("off:20");
    expect(apiRequestMock).toHaveBeenCalledWith("/api/feed/foryou?cursor=off%3A20");
  });
});
