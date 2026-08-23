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

const snakeCaseStream = {
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

  it("rejects snake_case live rows instead of mapping them", () => {
    expect(parseLiveStreamsResponse({ streams: [snakeCaseStream] })).toBeNull();
  });

  it("accepts an empty list", () => {
    expect(parseLiveStreamsResponse({ streams: [] })).toEqual([]);
  });

  it("rejects bodies that are not a streams array", () => {
    expect(parseLiveStreamsResponse({ ok: true })).toBeNull();
  });

  it("rejects a streams array that cannot be parsed", () => {
    expect(parseLiveStreamsResponse({ streams: [{ title: "x" }] })).toBeNull();
  });
});

describe("mapLiveStreamCard", () => {
  it("accepts a NEW live card and rejects snake_case WS payloads", () => {
    expect(mapLiveStreamCard(newCard)).toEqual(newCard);
    expect(
      mapLiveStreamCard({
        stream_key: snakeCaseStream.stream_key,
        user_id: snakeCaseStream.user_id,
        display_name: "Maya",
        viewers: 2,
      }),
    ).toBeNull();
  });
});

describe("apiLiveStreams", () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
  });

  it("loads GET /api/live/streams only", async () => {
    apiRequestMock.mockResolvedValue({ data: { streams: [newCard] }, error: null });
    const res = await apiLiveStreams();
    expect(apiRequestMock).toHaveBeenCalledWith("/api/live/streams");
    expect(res.error).toBeNull();
    expect(res.streams[0]?.displayName).toBe("Live Creator");
  });
});

describe("apiLiveStart", () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
  });

  it("posts title only and never sends a client room id", async () => {
    const { apiLiveStart } = await import("./feedApi");
    apiRequestMock.mockResolvedValue({
      data: {
        streamId: newCard.streamId,
        roomId: newCard.roomId,
        livekitToken: "tok",
        livekitUrl: "wss://livekit.example",
      },
      error: null,
    });
    const res = await apiLiveStart("Hello");
    expect(apiRequestMock).toHaveBeenCalledWith("/api/live/start", {
      method: "POST",
      body: JSON.stringify({ title: "Hello" }),
    });
    expect(res.error).toBeNull();
    expect(res.session?.roomId).toBe(newCard.roomId);
  });
});
