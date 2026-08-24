import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LiveNotifyBanner } from "./LiveNotifyBanner";

const listeners = vi.hoisted(() => new Map<string, Set<(data: unknown) => void>>());

const authState = vi.hoisted(() => ({
  user: {
    id: "11111111-1111-1111-1111-111111111111",
    username: "tester",
    displayName: "Tester",
    avatarUrl: null,
  },
  session: { token: "session-token" },
}));

vi.mock("@/lib/wsClient", () => ({
  wsClient: {
    on: (event: string, listener: (data: unknown) => void) => {
      const set = listeners.get(event) ?? new Set<(data: unknown) => void>();
      set.add(listener);
      listeners.set(event, set);
    },
    off: (event: string, listener: (data: unknown) => void) => {
      listeners.get(event)?.delete(listener);
    },
    send: vi.fn(),
  },
}));

vi.mock("@/store/useAuthStore", () => ({
  useAuthStore: (selector: (state: typeof authState) => unknown) => selector(authState),
}));

vi.mock("@/store/useSettingsStore", () => ({
  useSettingsStore: (selector: (state: { liveNotifications: boolean }) => unknown) =>
    selector({ liveNotifications: true }),
}));

vi.mock("@/features/feed/feedApi", () => ({
  apiLiveStreams: async () => ({ streams: [{ roomId: "room-1", streamId: "room-1" }], error: null }),
  apiLiveToken: async () => ({ token: { token: "live-token" }, error: null }),
}));

function emit(event: string, data: unknown) {
  listeners.get(event)?.forEach((listener) => listener(data));
}

function renderBanner(path: string): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="*" element={<LiveNotifyBanner />} />
        </Routes>
      </MemoryRouter>,
    );
  });
  return { container, root };
}

describe("PAGE-006 LiveNotifyBanner", () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = undefined;
    container = undefined;
    listeners.clear();
  });

  it("shows a started-live banner off live surfaces", async () => {
    const mounted = renderBanner("/feed");
    root = mounted.root;
    container = mounted.container;
    await act(async () => {
      emit("stream_started", {
        streamId: "99999999-9999-4999-8999-999999999999",
        roomId: "room-9",
        hostId: "22222222-2222-2222-2222-222222222222",
        displayName: "Creator",
        username: "creator",
        avatarUrl: null,
        title: "LIVE",
        viewerCount: 1,
        startedAt: "2026-08-21T00:00:00.000Z",
      });
    });
    expect(mounted.container.textContent).toContain("Creator");
    expect(mounted.container.textContent).toContain("is live now — tap to watch");
    expect(mounted.container.textContent).toContain("LIVE");
  });

  it("does not show started banners on watch", async () => {
    const mounted = renderBanner("/watch/room-9");
    root = mounted.root;
    container = mounted.container;
    await act(async () => {
      emit("stream_started", {
        streamId: "99999999-9999-4999-8999-999999999999",
        roomId: "room-9",
        hostId: "22222222-2222-2222-2222-222222222222",
        displayName: "Creator",
        username: "creator",
        avatarUrl: null,
        title: "LIVE",
        viewerCount: 1,
        startedAt: "2026-08-21T00:00:00.000Z",
      });
    });
    expect(mounted.container.textContent).not.toContain("is live now — tap to watch");
  });
});
