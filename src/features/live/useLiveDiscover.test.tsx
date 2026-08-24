import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLiveDiscover } from "./useLiveDiscover";

const feedApi = vi.hoisted(() => ({
  apiLiveStreams: vi.fn(),
}));

const ws = vi.hoisted(() => ({
  on: vi.fn(),
  off: vi.fn(),
}));

vi.mock("@/features/feed/feedApi", () => feedApi);
vi.mock("@/lib/wsClient", () => ({ wsClient: ws }));
vi.mock("@/lib/toast", () => ({ showToast: vi.fn() }));
vi.mock("@/store/useAuthStore", () => ({
  useAuthStore: Object.assign(
    () => ({ user: { id: "11111111-1111-1111-1111-111111111111" } }),
    { getState: () => ({ checkUser: vi.fn() }) },
  ),
}));

import { showToast } from "@/lib/toast";

const card = {
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

function HookProbe({ onValue }: { onValue: (value: ReturnType<typeof useLiveDiscover>) => void }) {
  const value = useLiveDiscover();
  onValue(value);
  return null;
}

async function mountHook() {
  let latest: ReturnType<typeof useLiveDiscover> | undefined;
  const root = createRoot(document.body);
  await act(async () => {
    root.render(<HookProbe onValue={(value) => { latest = value; }} />);
    await Promise.resolve();
    await Promise.resolve();
  });
  return { root, latest: () => latest };
}

describe("PAGE-017 useLiveDiscover", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  beforeEach(() => {
    feedApi.apiLiveStreams.mockReset();
    ws.on.mockReset();
    ws.off.mockReset();
    vi.mocked(showToast).mockReset();
    feedApi.apiLiveStreams.mockResolvedValue({ streams: [], error: null });
  });

  it("loads GET /api/live/streams once and does not connect a second websocket", async () => {
    const { root } = await mountHook();
    expect(feedApi.apiLiveStreams).toHaveBeenCalledTimes(1);
    expect(ws.on).toHaveBeenCalledWith("stream_started", expect.any(Function));
    expect(ws.on).toHaveBeenCalledWith("stream_ended", expect.any(Function));
    expect(ws.on.mock.calls.filter((call) => call[0] === "stream_started")).toHaveLength(1);
    root.unmount();
    expect(ws.off).toHaveBeenCalledWith("stream_started", expect.any(Function));
    expect(ws.off).toHaveBeenCalledWith("stream_ended", expect.any(Function));
  });

  it("toasts a failed snapshot and keeps an existing lobby", async () => {
    feedApi.apiLiveStreams.mockResolvedValueOnce({ streams: [card], error: null });
    const { root, latest } = await mountHook();
    expect(latest()?.streams).toHaveLength(1);
    feedApi.apiLiveStreams.mockResolvedValueOnce({ streams: [], error: "network down" });
    await act(async () => {
      latest()?.reload();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(showToast).toHaveBeenCalledWith("network down");
    expect(latest()?.streams).toHaveLength(1);
    root.unmount();
  });

  it("inserts once for REST then matching stream_started", async () => {
    feedApi.apiLiveStreams.mockResolvedValue({ streams: [card], error: null });
    const { root, latest } = await mountHook();
    const started = ws.on.mock.calls.find((call) => call[0] === "stream_started")?.[1] as (data: unknown) => void;
    await act(async () => {
      started?.(card);
      started?.(card);
      await Promise.resolve();
    });
    expect(latest()?.streams).toHaveLength(1);
    expect(latest()?.streams[0]?.roomId).toBe(card.roomId);
    root.unmount();
  });

  it("removes only the ended room", async () => {
    const other = { ...card, streamId: "55555555-5555-4555-8555-555555555555", roomId: "66666666-6666-4666-8666-666666666666" };
    feedApi.apiLiveStreams.mockResolvedValue({ streams: [card, other], error: null });
    const { root, latest } = await mountHook();
    const ended = ws.on.mock.calls.find((call) => call[0] === "stream_ended")?.[1] as (data: unknown) => void;
    await act(async () => {
      ended?.({ streamId: card.streamId, roomId: card.roomId });
      await Promise.resolve();
    });
    expect(latest()?.streams.map((row) => row.roomId)).toEqual([other.roomId]);
    root.unmount();
  });

  it("refresh replaces ended streams instead of appending", async () => {
    feedApi.apiLiveStreams.mockResolvedValueOnce({ streams: [card], error: null });
    const { root, latest } = await mountHook();
    feedApi.apiLiveStreams.mockResolvedValueOnce({ streams: [], error: null });
    await act(async () => {
      latest()?.reload();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(latest()?.streams).toEqual([]);
    root.unmount();
  });
});
