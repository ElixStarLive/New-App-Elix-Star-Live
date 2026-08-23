import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FriendsFeed from "./FriendsFeed";

const feedApi = vi.hoisted(() => ({
  apiFetchFriendsFeed: vi.fn(),
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

const friendItem = {
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

function renderFriends(): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <MemoryRouter>
        <div style={{ height: "800px" }}>
          <FriendsFeed />
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

describe("PAGE-010 Friends", () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  beforeEach(() => {
    Object.values(feedApi).forEach((fn) => fn.mockReset());
    ws.on.mockReset();
    ws.off.mockReset();
    ws.connect.mockReset();
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

  it("loads GET /api/feed/friends once and does not open For You, Following, or a second socket", async () => {
    feedApi.apiFetchFriendsFeed.mockResolvedValue({ feed: { videos: [friendItem] }, error: null });
    const mounted = renderFriends();
    root = mounted.root;
    container = mounted.container;
    await flush();
    expect(feedApi.apiFetchFriendsFeed).toHaveBeenCalledTimes(1);
    expect(feedApi.apiFetchFriendsFeed).toHaveBeenCalledWith();
    expect(feedApi.apiFetchForYouFeed).not.toHaveBeenCalled();
    expect(feedApi.apiFetchFollowingFeed).not.toHaveBeenCalled();
    expect(ws.connect).not.toHaveBeenCalled();
    expect(container.querySelector("h1")?.textContent).toBe("Friends");
    expect(container.querySelector("button[aria-label='Search']")).toBeTruthy();
    expect(container.querySelector("button[aria-label='Back']")).toBeTruthy();
    expect(container.textContent).toContain("Creator");
    expect(container.textContent).not.toContain("No friends posts yet");
  });

  it("shows the OLD empty friends copy, Add story, and Discover people", async () => {
    feedApi.apiFetchFriendsFeed.mockResolvedValue({ feed: { videos: [] }, error: null });
    const mounted = renderFriends();
    root = mounted.root;
    container = mounted.container;
    await flush();
    expect(container.textContent).toContain("No friend videos yet");
    expect(container.textContent).toContain("Add a photo or video story, or follow people who post");
    expect(container.textContent).toContain("Add story");
    expect(container.textContent).toContain("Discover people");
    expect(container.textContent).not.toContain("No friends posts yet");
    expect(container.textContent).not.toContain("No videos from people you follow");
  });

  it("shows initial failure and retry without falling back to For You", async () => {
    feedApi.apiFetchFriendsFeed.mockResolvedValueOnce({ feed: null, error: "FEED_ERROR" });
    feedApi.apiFetchFriendsFeed.mockResolvedValueOnce({ feed: { videos: [friendItem] }, error: null });
    const mounted = renderFriends();
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
    expect(feedApi.apiFetchFriendsFeed).toHaveBeenCalledTimes(2);
    expect(feedApi.apiFetchForYouFeed).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Creator");
  });

  it("opens comments for the active friends video without leaving the page", async () => {
    feedApi.apiFetchFriendsFeed.mockResolvedValue({ feed: { videos: [friendItem] }, error: null });
    const mounted = renderFriends();
    root = mounted.root;
    container = mounted.container;
    await flush();
    const comments = [...container.querySelectorAll("button")].find((btn) => btn.getAttribute("title") === "Comments");
    await act(async () => {
      comments?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.textContent).toContain("Comments");
    expect(feedApi.apiFetchVideoComments).toHaveBeenCalledWith(friendItem.id);
  });

  it("likes through the real API and rolls back on failure", async () => {
    feedApi.apiFetchFriendsFeed.mockResolvedValue({ feed: { videos: [friendItem] }, error: null });
    feedApi.apiLikeVideo.mockResolvedValue({ ok: false, error: "LIKE_FAIL" });
    const mounted = renderFriends();
    root = mounted.root;
    container = mounted.container;
    await flush();
    const like = [...container.querySelectorAll("button")].find((btn) => btn.getAttribute("title") === "Like");
    await act(async () => {
      like?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(feedApi.apiLikeVideo).toHaveBeenCalledWith(friendItem.id);
    expect(like?.textContent).toContain("2");
  });

  it("removes that creator after a successful unfollow", async () => {
    feedApi.apiFetchFriendsFeed.mockResolvedValue({ feed: { videos: [friendItem] }, error: null });
    const mounted = renderFriends();
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
    expect(feedApi.apiUnfollow).toHaveBeenCalledWith(friendItem.user.id);
    expect(container.textContent).toContain("No friend videos yet");
  });
});
