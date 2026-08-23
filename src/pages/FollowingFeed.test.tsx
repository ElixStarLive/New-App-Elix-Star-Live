import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FollowingFeed from "./FollowingFeed";

const feedApi = vi.hoisted(() => ({
  apiFetchFollowingFeed: vi.fn(),
  apiFetchForYouFeed: vi.fn(),
  apiLiveStreams: vi.fn(),
  apiFetchStories: vi.fn(),
  apiFollowList: vi.fn(),
  apiLikeVideo: vi.fn(),
  apiUnlikeVideo: vi.fn(),
  apiSaveVideo: vi.fn(),
  apiUnsaveVideo: vi.fn(),
  apiFollow: vi.fn(),
  apiUnfollow: vi.fn(),
  apiTrackView: vi.fn(),
  apiTrackInteraction: vi.fn(),
  apiFetchVideoComments: vi.fn(),
  apiPostVideoComment: vi.fn(),
  apiMusicPreview: vi.fn(),
  apiDownloadVoiceOnlyVideo: vi.fn(),
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
vi.mock("@/store/useSettingsStore", () => ({
  useSettingsStore: (selector?: (state: { muteAllSounds: boolean }) => unknown) => {
    const state = { muteAllSounds: false };
    return selector ? selector(state) : state;
  },
}));
vi.mock("@/lib/platform", async () => {
  const actual = await vi.importActual<typeof import("@/lib/platform")>("@/lib/platform");
  return { ...actual, nativeShareUrl: vi.fn(async () => true), nativeShareMedia: vi.fn(async () => "shared"), platform: { ...actual.platform, isNative: true } };
});
vi.mock("@capacitor/app", () => ({
  App: {
    addListener: vi.fn(async () => ({ remove: vi.fn() })),
  },
}));

const followedItem = {
  id: "22222222-2222-4222-8222-222222222222",
  url: "https://cdn.example/video.mp4",
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
  stats: { views: 4, likes: 2, comments: 1, shares: 0, saves: 0 },
  createdAt: "2026-08-20T00:00:00.000Z",
  location: "",
  isLiked: false,
  isSaved: false,
  isFollowing: true,
  comments: [],
  quality: "",
  privacy: "public",
  engagementScore: 0,
};

function renderFollowing(): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <MemoryRouter>
        <div style={{ height: "800px" }}>
          <FollowingFeed />
        </div>
      </MemoryRouter>,
    );
  });
  return { container, root };
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("PAGE-009 Following", () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  beforeEach(() => {
    Object.values(feedApi).forEach((fn) => fn.mockReset());
    ws.on.mockReset();
    ws.off.mockReset();
    feedApi.apiMusicPreview.mockResolvedValue({ url: null, error: "none" });
    feedApi.apiFetchVideoComments.mockResolvedValue({ comments: [], error: null });
    feedApi.apiFetchStories.mockResolvedValue({ users: [], error: null });
    feedApi.apiFollowList.mockResolvedValue({ users: [], error: null });
    feedApi.apiLiveStreams.mockResolvedValue({ streams: [], error: null });
    feedApi.apiLikeVideo.mockResolvedValue({ ok: true });
    feedApi.apiUnlikeVideo.mockResolvedValue({ ok: true });
    feedApi.apiUnfollow.mockResolvedValue({ ok: true });
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
    act(() => root?.unmount());
    container?.remove();
  });

  it("loads GET /api/feed/following once and does not open a second socket or For You", async () => {
    feedApi.apiFetchFollowingFeed.mockResolvedValue({ feed: { videos: [followedItem] }, error: null });
    const mounted = renderFollowing();
    root = mounted.root;
    container = mounted.container;
    await flush();
    expect(feedApi.apiFetchFollowingFeed).toHaveBeenCalledTimes(1);
    expect(feedApi.apiFetchFollowingFeed).toHaveBeenCalledWith();
    expect(feedApi.apiFetchForYouFeed).not.toHaveBeenCalled();
    expect(ws.connect).not.toHaveBeenCalled();
    expect(container.querySelector("h1")?.textContent).toBe("Following");
    expect(container.querySelector("button[aria-label='Search']")).toBeTruthy();
    expect(container.querySelector("button[aria-label='Back']")).toBeTruthy();
    expect(container.querySelector("button[aria-label='For You']")).toBeNull();
    expect(container.textContent).toContain("Creator");
    expect(container.querySelector("button[title='Load more']")).toBeNull();
  });

  it("shows the OLD empty following copy and Discover people", async () => {
    feedApi.apiFetchFollowingFeed.mockResolvedValue({ feed: { videos: [] }, error: null });
    const mounted = renderFollowing();
    root = mounted.root;
    container = mounted.container;
    await flush();
    expect(container.textContent).toContain("No videos from people you follow");
    expect(container.textContent).toContain("Follow people to see their videos here");
    expect(container.textContent).toContain("Discover people");
    expect(container.textContent).not.toContain("Nothing here yet");
  });

  it("shows initial failure and retry without falling back to For You", async () => {
    feedApi.apiFetchFollowingFeed.mockResolvedValueOnce({ feed: null, error: "FEED_ERROR" });
    feedApi.apiFetchFollowingFeed.mockResolvedValueOnce({ feed: { videos: [followedItem] }, error: null });
    const mounted = renderFollowing();
    root = mounted.root;
    container = mounted.container;
    await flush();
    expect(container.textContent).toContain("FEED_ERROR");
    const retry = [...container.querySelectorAll("button")].find((btn) => btn.textContent === "Retry");
    expect(retry).toBeTruthy();
    await act(async () => {
      retry?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(feedApi.apiFetchFollowingFeed).toHaveBeenCalledTimes(2);
    expect(feedApi.apiFetchForYouFeed).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Creator");
  });

  it("opens comments for the active following video without leaving the page", async () => {
    feedApi.apiFetchFollowingFeed.mockResolvedValue({ feed: { videos: [followedItem] }, error: null });
    const mounted = renderFollowing();
    root = mounted.root;
    container = mounted.container;
    await flush();
    const comments = [...container.querySelectorAll("button")].find((btn) => btn.getAttribute("title") === "Comments");
    await act(async () => {
      comments?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.textContent).toContain("Comments");
    expect(feedApi.apiFetchVideoComments).toHaveBeenCalledWith(followedItem.id);
  });

  it("likes through the real API and rolls back on failure", async () => {
    feedApi.apiFetchFollowingFeed.mockResolvedValue({ feed: { videos: [followedItem] }, error: null });
    feedApi.apiLikeVideo.mockResolvedValue({ ok: false, error: "LIKE_FAIL" });
    const mounted = renderFollowing();
    root = mounted.root;
    container = mounted.container;
    await flush();
    const like = [...container.querySelectorAll("button")].find((btn) => btn.getAttribute("title") === "Like");
    await act(async () => {
      like?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(feedApi.apiLikeVideo).toHaveBeenCalledWith(followedItem.id);
    expect(like?.textContent).toContain("2");
  });

  it("removes that creator after a successful unfollow", async () => {
    feedApi.apiFetchFollowingFeed.mockResolvedValue({ feed: { videos: [followedItem] }, error: null });
    const mounted = renderFollowing();
    root = mounted.root;
    container = mounted.container;
    await flush();
    const more = [...container.querySelectorAll("button")].find((btn) => btn.getAttribute("title") === "More");
    await act(async () => {
      more?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const unfollow = [...container.querySelectorAll("button")].find((btn) => btn.textContent === "Unfollow");
    await act(async () => {
      unfollow?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(feedApi.apiUnfollow).toHaveBeenCalledWith(followedItem.user.id);
    expect(container.textContent).toContain("No videos from people you follow");
  });
});
