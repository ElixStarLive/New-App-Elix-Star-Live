import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Discover from "./Discover";

const feedApi = vi.hoisted(() => ({
  apiFetchDiscover: vi.fn(),
  apiDiscoverSearch: vi.fn(),
  apiFetchStories: vi.fn(),
  apiLiveStreams: vi.fn(),
  apiFollowList: vi.fn(),
  apiFetchProfiles: vi.fn(),
  apiFollow: vi.fn(),
  apiLikeVideo: vi.fn(),
  apiSaveVideo: vi.fn(),
}));

const ws = vi.hoisted(() => ({
  on: vi.fn(),
  off: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
}));

vi.mock("@/features/feed/feedApi", () => feedApi);
vi.mock("@/lib/wsClient", () => ({ wsClient: ws }));
vi.mock("@/store/useAuthStore", () => ({
  useAuthStore: Object.assign(
    (selector?: (state: { user: { id: string } }) => unknown) => {
      const state = { user: { id: "11111111-1111-1111-1111-111111111111" } };
      return selector ? selector(state) : state;
    },
    {
      getState: () => ({
        user: { id: "11111111-1111-1111-1111-111111111111" },
        checkUser: async () => undefined,
      }),
    },
  ),
}));
vi.mock("@/lib/platform", async () => {
  const actual = await vi.importActual<typeof import("@/lib/platform")>("@/lib/platform");
  return { ...actual, nativeShareUrl: vi.fn(async () => true), platform: { ...actual.platform, isNative: true } };
});

const trendingItem = {
  id: "22222222-2222-4222-8222-222222222222",
  url: "https://cdn.example/video.mp4",
  thumbnail: "https://cdn.example/t.jpg",
  duration: "0:15",
  user: {
    id: "33333333-3333-4333-8333-333333333333",
    username: "creator",
    name: "Creator",
    avatar: "https://cdn.example/a.jpg",
    level: 1,
    isVerified: false,
    followers: 0,
    following: 0,
  },
  description: "nsfw clip",
  hashtags: [] as string[],
  music: null,
  stats: { views: 40, likes: 2, comments: 1, shares: 0, saves: 0 },
  createdAt: null,
  location: "",
  isLiked: false,
  isSaved: false,
  isFollowing: false,
  comments: [] as unknown[],
  quality: "",
  privacy: "public",
  engagementScore: 0,
};

function renderDiscover(path = "/discover") {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/discover" element={<Discover />} />
          <Route path="/search" element={<div>SEARCH PAGE</div>} />
          <Route path="/video/:videoId" element={<div>VIDEO PAGE</div>} />
          <Route path="/profile/:userId" element={<div>PROFILE PAGE</div>} />
          <Route path="/hashtag/:tag" element={<div>HASHTAG PAGE</div>} />
          <Route path="/rising-stars" element={<div>RISING PAGE</div>} />
          <Route path="/music" element={<div>MUSIC PAGE</div>} />
          <Route path="/feed" element={<div>FEED PAGE</div>} />
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

describe("PAGE-011 Discover", () => {
  let root: Root | null = null;
  let container: HTMLElement | null = null;

  beforeEach(() => {
    feedApi.apiFetchDiscover.mockReset();
    feedApi.apiDiscoverSearch.mockReset();
    feedApi.apiFetchStories.mockReset();
    feedApi.apiLiveStreams.mockReset();
    feedApi.apiFollowList.mockReset();
    feedApi.apiFetchProfiles.mockReset();
    feedApi.apiFollow.mockReset();
    feedApi.apiLikeVideo.mockReset();
    feedApi.apiSaveVideo.mockReset();
    ws.on.mockReset();
    ws.off.mockReset();
    ws.connect.mockReset();
    feedApi.apiFetchStories.mockResolvedValue({ users: [], error: null });
    feedApi.apiLiveStreams.mockResolvedValue({ streams: [], error: null });
    feedApi.apiFollowList.mockResolvedValue({ users: [], error: null });
    feedApi.apiFetchProfiles.mockResolvedValue({ profiles: [], error: null });
    feedApi.apiFetchDiscover.mockResolvedValue({
      trending: [trendingItem],
      hashtags: [{ tag: "dance", useCount: 4 }],
      rankings: [
        {
          rank: 1,
          userId: "44444444-4444-4444-8444-444444444444",
          username: "star",
          displayName: "Star",
          avatarUrl: null,
          totalCoins: 1200,
        },
      ],
      error: null,
    });
    feedApi.apiDiscoverSearch.mockResolvedValue({
      users: [
        {
          userId: "55555555-5555-4555-8555-555555555555",
          username: "maya",
          displayName: "Maya",
          avatarUrl: null,
          followerCount: 12,
          isFollowing: false,
        },
      ],
      videos: [trendingItem],
      error: null,
    });
    feedApi.apiFollow.mockResolvedValue({ ok: true });
    HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
    HTMLMediaElement.prototype.pause = vi.fn();
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        observe() {}
        disconnect() {}
        unobserve() {}
      },
    );
  });

  afterEach(() => {
    if (root && container) {
      act(() => root!.unmount());
      container.remove();
    }
    root = null;
    container = null;
  });

  it("loads Explore chrome, Trending snap, and does not open PAGE-012 Search", async () => {
    const mounted = renderDiscover();
    root = mounted.root;
    container = mounted.container;
    await flush();
    expect(container.textContent).toContain("Explore");
    expect(container.textContent).toContain("Trending");
    expect(container.textContent).toContain("Rising");
    expect(container.textContent).toContain("Top 99");
    expect(container.textContent).toContain("Tags");
    expect(container.textContent).toContain("@creator");
    expect(container.textContent).not.toContain("SEARCH PAGE");
    expect(feedApi.apiFetchDiscover).toHaveBeenCalledTimes(1);
    expect(ws.connect).not.toHaveBeenCalled();
    const input = container.querySelector("#discover-search") as HTMLInputElement | null;
    expect(input?.placeholder).toBe("Search videos, users, hashtags...");
  });

  it("shows the OLD empty trending copy", async () => {
    feedApi.apiFetchDiscover.mockResolvedValue({ trending: [], hashtags: [], rankings: [], error: null });
    const mounted = renderDiscover();
    root = mounted.root;
    container = mounted.container;
    await flush();
    expect(container.textContent).toContain("No matching videos yet");
    expect(container.textContent).toContain("Creators add tags like nsfw, sexy, or 18+");
  });

  it("retries Explore from the Trending chip after a failed load", async () => {
    feedApi.apiFetchDiscover.mockResolvedValueOnce({ trending: [], hashtags: [], rankings: [], error: "DISCOVER_DOWN" });
    feedApi.apiFetchDiscover.mockResolvedValueOnce({
      trending: [trendingItem],
      hashtags: [],
      rankings: [],
      error: null,
    });
    const mounted = renderDiscover();
    root = mounted.root;
    container = mounted.container;
    await flush();
    expect(container.textContent).toContain("Could not load Explore");
    const trending = [...container.querySelectorAll("button")].find((btn) => btn.textContent?.includes("Trending"));
    expect(trending).toBeTruthy();
    await act(async () => {
      trending?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(feedApi.apiFetchDiscover).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("@creator");
  });

  it("opens Tags with server rank and hashtag handoff", async () => {
    const mounted = renderDiscover();
    root = mounted.root;
    container = mounted.container;
    await flush();
    const tags = [...container.querySelectorAll("button")].find((btn) => btn.textContent?.includes("Tags"));
    await act(async () => {
      tags?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.textContent).toContain("#dance");
    expect(container.textContent).toContain("4 videos");
    const row = [...container.querySelectorAll("button")].find((btn) => btn.textContent?.includes("#dance"));
    await act(async () => {
      row?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.textContent).toContain("HASHTAG PAGE");
  });

  it("opens Top 99 weekly ranking and profile handoff", async () => {
    const mounted = renderDiscover();
    root = mounted.root;
    container = mounted.container;
    await flush();
    const top = [...container.querySelectorAll("button")].find((btn) => btn.textContent?.includes("Top 99"));
    await act(async () => {
      top?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.textContent).toContain("Weekly Ranking");
    expect(container.textContent).toContain("Star");
    const creator = [...container.querySelectorAll("button")].find((btn) => btn.textContent?.includes("@star"));
    await act(async () => {
      creator?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.textContent).toContain("PROFILE PAGE");
  });

  it("Music chip stays on Discover in-page search and can follow", async () => {
    const mounted = renderDiscover();
    root = mounted.root;
    container = mounted.container;
    await flush();
    const music = [...container.querySelectorAll("button")].find((btn) => btn.textContent?.includes("Music"));
    await act(async () => {
      music?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.textContent).not.toContain("MUSIC PAGE");
    expect(container.textContent).not.toContain("SEARCH PAGE");
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 320));
    });
    expect(feedApi.apiDiscoverSearch).toHaveBeenCalledWith("music");
    expect(container.textContent).toContain("Users");
    const follow = [...container.querySelectorAll("span")].find((el) => el.textContent === "Follow");
    await act(async () => {
      follow?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
    expect(feedApi.apiFollow).toHaveBeenCalledWith("55555555-5555-4555-8555-555555555555");
  });

  it("Rising chip hands off to /rising-stars", async () => {
    const mounted = renderDiscover();
    root = mounted.root;
    container = mounted.container;
    await flush();
    const rising = [...container.querySelectorAll("button")].find((btn) => btn.textContent?.includes("Rising"));
    await act(async () => {
      rising?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.textContent).toContain("RISING PAGE");
  });

  it("overlay Search focuses the Discover field instead of opening PAGE-012", async () => {
    const mounted = renderDiscover();
    root = mounted.root;
    container = mounted.container;
    await flush();
    const overlaySearch = container.querySelector('button[aria-label="Search"]') as HTMLButtonElement | null;
    const input = container.querySelector("#discover-search") as HTMLInputElement | null;
    const focus = vi.spyOn(input!, "focus");
    await act(async () => {
      overlaySearch?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(focus).toHaveBeenCalled();
    expect(container.textContent).not.toContain("SEARCH PAGE");
  });

  it("video card hands off to /video/:id", async () => {
    const mounted = renderDiscover();
    root = mounted.root;
    container = mounted.container;
    await flush();
    const more = container.querySelector('button[title="More"]') as HTMLButtonElement | null;
    await act(async () => {
      more?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.textContent).toContain("VIDEO PAGE");
  });
});
