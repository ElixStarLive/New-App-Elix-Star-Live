import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LiveDiscover from "./LiveDiscover";

const feedApi = vi.hoisted(() => ({
  apiLiveStreams: vi.fn(),
  apiLiveToken: vi.fn(),
  apiLiveStatus: vi.fn(),
}));

const ws = vi.hoisted(() => ({
  on: vi.fn(),
  off: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
}));

vi.mock("@/features/feed/feedApi", () => feedApi);
vi.mock("@/lib/wsClient", () => ({ wsClient: ws }));
vi.mock("@/lib/toast", () => ({ showToast: vi.fn() }));
vi.mock("@/store/useAuthStore", () => ({
  useAuthStore: Object.assign(
    (selector?: (state: { user: { id: string } }) => unknown) => {
      const state = { user: { id: "11111111-1111-1111-1111-111111111111" } };
      return selector ? selector(state) : state;
    },
    { getState: () => ({ checkUser: vi.fn() }) },
  ),
}));

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

function renderLive(entry: string | { pathname: string; state?: unknown } = "/live") {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <MemoryRouter initialEntries={[typeof entry === "string" ? entry : entry]}>
        <Routes>
          <Route path="/live" element={<LiveDiscover />} />
          <Route path="/feed" element={<div>FEED PAGE</div>} />
          <Route path="/watch/:streamId" element={<div>WATCH PAGE</div>} />
        </Routes>
      </MemoryRouter>,
    );
  });
  return { container, root };
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("PAGE-017 Live Discover", () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  beforeEach(() => {
    feedApi.apiLiveStreams.mockReset();
    ws.on.mockReset();
    ws.off.mockReset();
    ws.connect.mockReset();
    ws.disconnect.mockReset();
    feedApi.apiLiveStreams.mockResolvedValue({ streams: [], error: null });
    feedApi.apiLiveToken.mockResolvedValue({ token: null, error: null });
    feedApi.apiLiveStatus.mockResolvedValue({
      status: { room: card.roomId, active: true, hostUserId: card.hostId },
      error: null,
    });
  });

  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    root = null;
    container = null;
  });

  it("uses the live column shell, Live title, and empty copy", async () => {
    const mounted = renderLive();
    root = mounted.root;
    container = mounted.container;
    await flush();
    expect(container.querySelector(".app-live-column")).toBeTruthy();
    expect(container.textContent).toContain("Live");
    expect(container.textContent).toContain("No one is live right now");
    expect(container.textContent).toContain("Check back later to watch creators streaming live");
    expect(container.querySelector('button[title="Back"]')).toBeTruthy();
    expect(container.querySelector('button[aria-label="Refresh"]')).toBeTruthy();
  });

  it("renders a 2-column lobby and hands watch the room id", async () => {
    feedApi.apiLiveStreams.mockResolvedValue({ streams: [card], error: null });
    const mounted = renderLive();
    root = mounted.root;
    container = mounted.container;
    await flush();
    expect(container.querySelector(".grid.grid-cols-2")).toBeTruthy();
    expect(container.textContent).toContain("Live");
    expect(container.textContent).toContain("Live Creator");
    expect(container.textContent).toContain("3 watching");
    const live = container.querySelector("[data-elix-watch-id]") as HTMLElement | null;
    expect(live).toBeTruthy();
    expect(live?.getAttribute("data-elix-watch-id")).toBe(card.roomId);
    act(() => live?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(container.textContent).toContain("WATCH PAGE");
  });

  it("widens the first card only when more than two streams are live", async () => {
    const streams = [1, 2, 3].map((n) => ({
      ...card,
      streamId: `44444444-4444-4444-8444-44444444444${n}`,
      roomId: `33333333-3333-4333-8333-33333333333${n}`,
      displayName: `Host ${n}`,
    }));
    feedApi.apiLiveStreams.mockResolvedValue({ streams, error: null });
    const mounted = renderLive();
    root = mounted.root;
    container = mounted.container;
    await flush();
    const cells = [...container.querySelectorAll(".grid.grid-cols-2 > div")];
    expect(cells[0]?.className).toContain("col-span-2");
    expect(cells[1]?.className).not.toContain("col-span-2");
  });

  it("closes to For You and does not keep a leaked ws listener", async () => {
    const mounted = renderLive();
    root = mounted.root;
    container = mounted.container;
    await flush();
    act(() => {
      (container!.querySelector('button[title="Back"]') as HTMLButtonElement).click();
    });
    expect(container.textContent).toContain("FEED PAGE");
    act(() => mounted.root.unmount());
    expect(ws.off).toHaveBeenCalledWith("stream_started", expect.any(Function));
    expect(ws.off).toHaveBeenCalledWith("stream_ended", expect.any(Function));
    root = null;
  });
});
