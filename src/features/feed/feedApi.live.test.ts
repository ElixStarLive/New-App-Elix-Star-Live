import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiLiveStreams, mapLiveStreamCard, parseLiveStreamsResponse } from "./feedApi";

vi.mock("@/lib/apiClient", () => ({
  apiRequest: vi.fn(),
  apiUploadForm: vi.fn(),
}));

import { apiRequest } from "@/lib/apiClient";

const apiRequestMock = vi.mocked(apiRequest);

const newCard = {
  streamId: "44444444-4444-4444-8444-444444444444",
  roomId: "33333333-3333-4333-8333-333333333333",
  hostId: "33333333-3333-4333-8333-333333333333",
  displayName: "Live Creator",
  username: "livec",
  avatarUrl: null,
  title: "Now",
  viewerCount: 3,
  startedAt: "2026-08-20T00:00:00.000Z",
};

const productionStream = {
  room_id: "33333333-3333-4333-8333-333333333333",
  stream_key: "33333333-3333-4333-8333-333333333333",
  user_id: "33333333-3333-4333-8333-333333333333",
  started_at: "2026-08-20T10:00:00.000Z",
  status: "live",
  title: "Now",
  display_name: "Maya",
  viewer_count: 7,
};

describe("parseLiveStreamsResponse", () => {
  it("keeps the NEW live card page", () => {
    expect(parseLiveStreamsResponse({ streams: [newCard] })).toEqual([newCard]);
  });

  it("maps production snake_case live rows", () => {
    const streams = parseLiveStreamsResponse({ streams: [productionStream] });
    expect(streams).toEqual([
      expect.objectContaining({
        streamId: productionStream.user_id,
        roomId: productionStream.stream_key,
        hostId: productionStream.user_id,
        displayName: "Maya",
        title: "Now",
        viewerCount: 7,
        startedAt: productionStream.started_at,
        avatarUrl: null,
      }),
    ]);
  });

  it("accepts an empty production list", () => {
    expect(parseLiveStreamsResponse({ streams: [] })).toEqual([]);
  });

  it("rejects bodies that are not a streams array", () => {
    expect(parseLiveStreamsResponse({ ok: true })).toBeNull();
  });

  it("rejects a streams array that cannot be mapped", () => {
    expect(parseLiveStreamsResponse({ streams: [{ title: "x" }] })).toBeNull();
  });
});

describe("mapLiveStreamCard", () => {
  it("maps WS stream_started payloads", () => {
    const card = mapLiveStreamCard({
      stream_key: productionStream.stream_key,
      user_id: productionStream.user_id,
      display_name: "Maya",
      viewers: 2,
    });
    expect(card).toEqual(
      expect.objectContaining({
        roomId: productionStream.stream_key,
        hostId: productionStream.user_id,
        displayName: "Maya",
        viewerCount: 2,
      }),
    );
  });
});

describe("apiLiveStreams", () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
  });

  it("loads GET /api/live/streams only", async () => {
    apiRequestMock.mockResolvedValue({ data: { streams: [productionStream] }, error: null });
    const res = await apiLiveStreams();
    expect(apiRequestMock).toHaveBeenCalledWith("/api/live/streams");
    expect(res.error).toBeNull();
    expect(res.streams[0]?.displayName).toBe("Maya");
  });
});
