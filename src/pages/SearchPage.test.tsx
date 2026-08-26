import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SearchPage from "./SearchPage";

const feedApi = vi.hoisted(() => ({
  apiFetchSearch: vi.fn(),
}));

vi.mock("@/features/feed/feedApi", () => feedApi);
vi.mock("@/lib/toast", () => ({ showToast: vi.fn() }));

import { showToast } from "@/lib/toast";

const browseVideo = {
  id: "22222222-2222-4222-8222-222222222222",
  url: "https://cdn.example/v.mp4",
  thumbnail: "",
  duration: "0:10",
  user: {
    id: "33333333-3333-4333-8333-333333333333",
    username: "creator",
    name: "Creator",
    avatar: "",
    level: 1,
    isVerified: false,
    followers: 0,
    following: 0,
  },
  description: "hello",
  hashtags: [],
  music: null,
  stats: { views: 4, likes: 0, comments: 0, shares: 0, saves: 0 },
  createdAt: "2026-08-20T00:00:00.000Z",
  location: "",
  isLiked: false,
  isSaved: false,
  isFollowing: false,
  comments: [],
  quality: "",
  privacy: "public",
  engagementScore: 0,
};

const userHit = {
  userId: "55555555-5555-4555-8555-555555555555",
  username: "maya",
  displayName: "Maya",
  avatarUrl: null,
};

function renderSearch(entry: string | { pathname: string; search?: string; state?: unknown } = "/search") {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <MemoryRouter initialEntries={[typeof entry === "string" ? entry : entry]}>
        <Routes>
          <Route path="/search" element={<SearchPage />} />
          <Route path="/stem" element={<div>STEM PAGE</div>} />
          <Route path="/feed" element={<div>FEED PAGE</div>} />
          <Route path="/inbox" element={<div>INBOX PAGE</div>} />
          <Route path="/profile/:userId" element={<div>PROFILE PAGE</div>} />
          <Route path="/video/:videoId" element={<div>VIDEO PAGE</div>} />
          <Route path="/hashtag/:tag" element={<div>HASHTAG PAGE</div>} />
        </Routes>
      </MemoryRouter>,
    );
  });
  return { root, container };
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function typeQuery(input: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  await act(async () => {
    descriptor?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
  });
}

function fireCloseTransition(container: HTMLElement) {
  const panel = container.querySelector(".app-live-column");
  const ev = new Event("transitionend", { bubbles: true });
  Object.defineProperty(ev, "propertyName", { value: "transform" });
  panel?.dispatchEvent(ev);
}

describe("PAGE-012 Search", () => {
  let root: Root | null = null;
  let container: HTMLElement | null = null;

  beforeEach(() => {
    feedApi.apiFetchSearch.mockReset();
    feedApi.apiFetchSearch.mockResolvedValue({ users: [], videos: [browseVideo], error: null });
    HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
    HTMLMediaElement.prototype.pause = vi.fn();
  });

  afterEach(() => {
    if (root && container) {
      act(() => root!.unmount());
      container.remove();
    }
    root = null;
    container = null;
  });

  it("shows OLD empty chrome and browse categories without opening hashtags", async () => {
    const mounted = renderSearch();
    root = mounted.root;
    container = mounted.container;
    await flush();
    expect(container.textContent).toContain("Search");
    expect(container.textContent).toContain("All");
    expect(container.textContent).toContain("For You");
    expect(container.textContent).toContain("Dance");
    expect(container.textContent).toContain("@creator");
    expect(feedApi.apiFetchSearch).toHaveBeenCalledWith({ category: "All" });
    const dance = [...container.querySelectorAll("button")].find((btn) => btn.textContent === "Dance");
    await act(async () => {
      dance?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.textContent).not.toContain("HASHTAG PAGE");
    expect(feedApi.apiFetchSearch).toHaveBeenCalledWith({ category: "Dance" });
  });

  it("searches on a one-character query and lists users then videos", async () => {
    feedApi.apiFetchSearch.mockResolvedValue({ users: [userHit], videos: [browseVideo], error: null });
    const mounted = renderSearch();
    root = mounted.root;
    container = mounted.container;
    await flush();
    const input = container.querySelector('input[aria-label="Search"]') as HTMLInputElement;
    await typeQuery(input, "m");
    expect(feedApi.apiFetchSearch).toHaveBeenCalledWith({ q: "m" });
    expect(container.textContent).toContain("@maya");
    expect(container.textContent).toContain("Maya");
    expect(container.textContent).toContain("Videos");
    expect(container.textContent).not.toContain("HASHTAG PAGE");
  });

  it("keeps whitespace-only as the empty browse state", async () => {
    const mounted = renderSearch();
    root = mounted.root;
    container = mounted.container;
    await flush();
    const input = container.querySelector('input[aria-label="Search"]') as HTMLInputElement;
    await typeQuery(input, "   ");
    expect(container.textContent).toContain("All");
    expect(container.textContent).not.toContain("No videos found.");
  });

  it("shows no-videos copy for a query with zero video hits", async () => {
    feedApi.apiFetchSearch.mockResolvedValue({ users: [], videos: [], error: null });
    const mounted = renderSearch();
    root = mounted.root;
    container = mounted.container;
    await flush();
    const input = container.querySelector('input[aria-label="Search"]') as HTMLInputElement;
    await typeQuery(input, "zzzz");
    expect(container.textContent).toContain("No videos found.");
    expect(container.textContent).not.toContain("@maya");
  });

  it("toasts a server failure instead of leaving a spinner", async () => {
    feedApi.apiFetchSearch.mockResolvedValue({ users: [], videos: [], error: "SEARCH_DOWN" });
    const mounted = renderSearch();
    root = mounted.root;
    container = mounted.container;
    await flush();
    expect(showToast).toHaveBeenCalledWith("Search failed. Try again.");
    expect(container.textContent).not.toContain("Searching...");
  });

  it("drops a stale slower response", async () => {
    const mounted = renderSearch();
    root = mounted.root;
    container = mounted.container;
    await flush();
    let finishFirst: ((value: { users: typeof userHit[]; videos: []; error: null }) => void) | undefined;
    feedApi.apiFetchSearch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishFirst = resolve;
        }),
    );
    feedApi.apiFetchSearch.mockResolvedValue({
      users: [{ ...userHit, username: "andrei" }],
      videos: [],
      error: null,
    });
    const input = container.querySelector('input[aria-label="Search"]') as HTMLInputElement;
    await typeQuery(input, "and");
    await typeQuery(input, "andrei");
    await act(async () => {
      finishFirst?.({ users: [{ ...userHit, username: "andonly" }], videos: [], error: null });
      await Promise.resolve();
    });
    expect(container.textContent).toContain("@andrei");
    expect(container.textContent).not.toContain("@andonly");
  });

  it("hands users and videos to profile/video without building those pages", async () => {
    feedApi.apiFetchSearch.mockResolvedValue({ users: [userHit], videos: [browseVideo], error: null });
    const mounted = renderSearch();
    root = mounted.root;
    container = mounted.container;
    await flush();
    const input = container.querySelector('input[aria-label="Search"]') as HTMLInputElement;
    await typeQuery(input, "maya");
    const userBtn = [...container.querySelectorAll("button")].find((btn) => btn.textContent?.includes("@maya"));
    await act(async () => {
      userBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.textContent).toContain("PROFILE PAGE");
  });

  it("returns STEM → Search → STEM", async () => {
    const mounted = renderSearch({ pathname: "/search", state: { returnTo: "/stem" } });
    root = mounted.root;
    container = mounted.container;
    await flush();
    const back = container.querySelector('button[aria-label="Back"]') as HTMLButtonElement;
    await act(async () => {
      back.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();
    await act(async () => {
      fireCloseTransition(container!);
    });
    expect(container.textContent).toContain("STEM PAGE");
  });

  it("returns Inbox → Search → Inbox", async () => {
    const mounted = renderSearch({ pathname: "/search", state: { returnTo: "/inbox" } });
    root = mounted.root;
    container = mounted.container;
    await flush();
    const back = container.querySelector('button[aria-label="Back"]') as HTMLButtonElement;
    await act(async () => {
      back.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();
    await act(async () => {
      fireCloseTransition(container!);
    });
    expect(container.textContent).toContain("INBOX PAGE");
  });

  it("closes on swipe-down from the header chrome", async () => {
    const mounted = renderSearch({ pathname: "/search", state: { returnTo: "/feed" } });
    root = mounted.root;
    container = mounted.container;
    await flush();
    const header = container.querySelector(".app-live-column > .flex.flex-col.shrink-0") as HTMLElement | null;
    expect(header).toBeTruthy();
    await act(async () => {
      header?.dispatchEvent(
        new TouchEvent("touchstart", {
          bubbles: true,
          touches: [{ clientX: 40, clientY: 20 } as Touch],
        }),
      );
      header?.dispatchEvent(
        new TouchEvent("touchend", {
          bubbles: true,
          changedTouches: [{ clientX: 40, clientY: 140 } as Touch],
        }),
      );
    });
    await act(async () => {
      fireCloseTransition(container!);
    });
    expect(container.textContent).toContain("FEED PAGE");
  });
});
