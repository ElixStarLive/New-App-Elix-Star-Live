import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NativeDialogProvider } from "@/components/NativeDialog";
import { namedHardwareBackTarget, returnToFromLocationState } from "@/lib/settingsNav";

const api = vi.hoisted(() => ({
  apiListChatThreads: vi.fn(),
  apiDeleteChatThread: vi.fn(),
  apiFetchFollowers: vi.fn(),
  apiFollowFollowerRow: vi.fn(),
  apiUnfollowFollowerRow: vi.fn(),
  apiListInboxActivity: vi.fn(),
  apiListInboxCircles: vi.fn(),
  apiListInboxNotices: vi.fn(),
  apiListLiveShareRequests: vi.fn(),
  apiMarkInboxNoticesRead: vi.fn(),
  wsOn: vi.fn(),
  wsOff: vi.fn(),
}));

vi.mock("@/lib/toast", () => ({ showToast: vi.fn() }));
vi.mock("@/lib/wsClient", () => ({
  wsClient: {
    on: (...args: unknown[]) => api.wsOn(...args),
    off: (...args: unknown[]) => api.wsOff(...args),
  },
}));
vi.mock("@/features/chat/chatApi", () => ({
  apiListChatThreads: (...args: unknown[]) => api.apiListChatThreads(...args),
  apiDeleteChatThread: (...args: unknown[]) => api.apiDeleteChatThread(...args),
}));
vi.mock("@/features/profile/followersApi", () => ({
  apiFetchFollowers: (...args: unknown[]) => api.apiFetchFollowers(...args),
  apiFollowFollowerRow: (...args: unknown[]) => api.apiFollowFollowerRow(...args),
  apiUnfollowFollowerRow: (...args: unknown[]) => api.apiUnfollowFollowerRow(...args),
}));
vi.mock("@/features/inbox/inboxApi", () => ({
  apiListInboxActivity: (...args: unknown[]) => api.apiListInboxActivity(...args),
  apiListInboxCircles: (...args: unknown[]) => api.apiListInboxCircles(...args),
  apiListInboxNotices: (...args: unknown[]) => api.apiListInboxNotices(...args),
  apiListLiveShareRequests: (...args: unknown[]) => api.apiListLiveShareRequests(...args),
  apiMarkInboxNoticesRead: (...args: unknown[]) => api.apiMarkInboxNoticesRead(...args),
}));
vi.mock("@/store/useAuthStore", () => ({
  useAuthStore: (selector?: (state: { user: { id: string; avatarUrl: string | null } }) => unknown) => {
    const state = { user: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", avatarUrl: null } };
    return selector ? selector(state) : state;
  },
}));

import Inbox from "./Inbox";

function LocationProbe() {
  const location = useLocation();
  const returnTo = returnToFromLocationState(location.state);
  return <div>{`LOC ${location.pathname}${returnTo ? ` RT ${returnTo}` : ""}`}</div>;
}

function emptyOk() {
  api.apiListChatThreads.mockResolvedValue({ threads: [], error: null });
  api.apiFetchFollowers.mockResolvedValue({ users: [], error: null });
  api.apiListInboxCircles.mockResolvedValue({ users: [], error: null });
  api.apiListInboxActivity.mockResolvedValue({ items: [], total: 0, error: null });
  api.apiListInboxNotices.mockResolvedValue({
    gifts: [],
    giftCount: 0,
    shop: [],
    alerts: [],
    alertCount: 0,
    unreadIds: [],
    error: null,
  });
  api.apiListLiveShareRequests.mockResolvedValue({ items: [], error: null });
  api.apiMarkInboxNoticesRead.mockResolvedValue({ ok: true });
}

function renderInbox() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <NativeDialogProvider>
        <MemoryRouter initialEntries={["/inbox"]}>
          <Routes>
            <Route path="/inbox" element={<Inbox />} />
            <Route path="/feed" element={<LocationProbe />} />
            <Route path="/alerts" element={<LocationProbe />} />
            <Route path="/search" element={<LocationProbe />} />
            <Route path="/inbox/:threadId" element={<LocationProbe />} />
            <Route path="/video/:videoId" element={<LocationProbe />} />
          </Routes>
        </MemoryRouter>
      </NativeDialogProvider>,
    );
  });
  return { container, root };
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
  emptyOk();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
});

describe("PAGE-030 Inbox", () => {
  it("shows Main hubs, empty messages, and closes to For You", async () => {
    const view = renderInbox();
    root = view.root;
    container = view.container;
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(view.container.textContent).toContain("Inbox");
    expect(view.container.textContent).toContain("New followers");
    expect(view.container.textContent).toContain("Activity");
    expect(view.container.textContent).toContain("Gift received");
    expect(view.container.textContent).toContain("Alerts");
    expect(view.container.textContent).toContain("No messages yet");
    const close = view.container.querySelector('button[aria-label="Close inbox and go to For You"]');
    expect(close).toBeTruthy();
    act(() => {
      (close as HTMLButtonElement).click();
    });
    expect(view.container.textContent).toContain("LOC /feed");
  });

  it("shows Unread empty copy", async () => {
    const view = renderInbox();
    root = view.root;
    container = view.container;
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    const unread = [...view.container.querySelectorAll("button")].find((btn) => btn.textContent === "Unread");
    expect(unread).toBeTruthy();
    act(() => {
      unread?.click();
    });
    expect(view.container.textContent).toContain("You’re all caught up.");
  });

  it("opens Alerts with Inbox returnTo", async () => {
    const view = renderInbox();
    root = view.root;
    container = view.container;
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    act(() => {
      [...view.container.querySelectorAll("button")].find((btn) => btn.textContent?.includes("Alerts"))?.click();
    });
    expect(view.container.textContent).toContain("LOC /alerts");
  });

  it("does not render PAGE-031 activity overlay copy until Activity is opened", async () => {
    const view = renderInbox();
    root = view.root;
    container = view.container;
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(document.body.textContent).not.toContain("When someone likes, comments on, saves your video");
  });

  it("keeps hardware back on Inbox as a named root", () => {
    expect(namedHardwareBackTarget("/inbox")).toBeNull();
    expect(namedHardwareBackTarget("/inbox/thread-1")).toBe("/inbox");
    expect(namedHardwareBackTarget("/alerts")).toBe("/inbox");
    expect(namedHardwareBackTarget("/search", { returnTo: "/inbox" })).toBe("/inbox");
  });
});

describe("PAGE-031 Inbox Activity overlay", () => {
  it("opens from the Activity hub, lists the real actor, and closes on Inbox", async () => {
    api.apiListInboxActivity.mockResolvedValue({
      items: [
        {
          id: "like_1",
          kind: "like",
          videoId: "video-31",
          actorUserId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          actorUsername: "fan",
          actorDisplayName: "Fan Name",
          actorAvatarUrl: null,
          snippet: null,
          createdAt: "2026-08-21T00:00:00.000Z",
        },
      ],
      total: 1,
      error: null,
    });
    const view = renderInbox();
    root = view.root;
    container = view.container;
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    const hub = [...view.container.querySelectorAll("button")].find((btn) => btn.textContent?.includes("likes, comments"));
    expect(hub).toBeTruthy();
    act(() => {
      hub?.click();
    });
    expect(document.body.textContent).toContain("Fan Name");
    expect(document.body.textContent).toContain("Liked your video");
    expect(document.body.textContent).not.toContain("username: 'user'");
    const close = document.body.querySelector('button[aria-label="Close activity"]');
    expect(close).toBeTruthy();
    act(() => {
      (close as HTMLButtonElement).click();
    });
    expect(document.body.textContent).not.toContain("Liked your video");
    expect(view.container.textContent).toContain("Inbox");
    expect(view.container.textContent).not.toContain("LOC /feed");
  });

  it("hands the video identity and Inbox returnTo to PAGE-014", async () => {
    api.apiListInboxActivity.mockResolvedValue({
      items: [
        {
          id: "comment_1",
          kind: "comment",
          videoId: "video-31",
          actorUserId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          actorUsername: "fan",
          actorDisplayName: "Fan Name",
          actorAvatarUrl: null,
          snippet: "nice clip",
          createdAt: "2026-08-21T00:00:00.000Z",
        },
      ],
      total: 1,
      error: null,
    });
    const view = renderInbox();
    root = view.root;
    container = view.container;
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    act(() => {
      [...view.container.querySelectorAll("button")].find((btn) => btn.textContent?.includes("likes, comments"))?.click();
    });
    const row = [...document.body.querySelectorAll("button")].find((btn) => btn.textContent?.includes("Fan Name"));
    expect(row).toBeTruthy();
    act(() => {
      row?.click();
    });
    expect(view.container.textContent).toContain("LOC /video/video-31");
    expect(view.container.textContent).toContain("RT /inbox");
  });

  it("shows activity API failure instead of empty overlay copy", async () => {
    api.apiListInboxActivity.mockResolvedValue({ items: [], total: 0, error: "offline" });
    const view = renderInbox();
    root = view.root;
    container = view.container;
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    act(() => {
      [...view.container.querySelectorAll("button")].find((btn) => btn.textContent === "Activity")?.click();
    });
    expect(document.body.textContent).toContain("offline");
    expect(document.body.textContent).not.toContain("No activity yet. When someone likes");
  });
});
