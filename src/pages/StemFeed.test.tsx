import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import StemFeed from "./StemFeed";

const feedApi = vi.hoisted(() => ({
  apiFetchStemFeed: vi.fn(),
  apiFetchForYouFeed: vi.fn(),
  apiLiveStreams: vi.fn(),
  apiFetchStories: vi.fn(),
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

const stemItem = {
  id: "22222222-2222-4222-8222-222222222222",
  url: "https://cdn.example/video.mp4",
  thumbnail: "",
  duration: "0:15",
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
  hashtags: [] as string[],
  music: null,
  stats: { views: 4, likes: 2, comments: 1, shares: 0, saves: 0 },
  createdAt: "2026-08-20T00:00:00.000Z",
  location: "",
  isLiked: false,
  isSaved: false,
  isFollowing: false,
  comments: [] as unknown[],
  quality: "",
  privacy: "public",
  engagementScore: 0,
};

function renderStem(): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <MemoryRouter initialEntries={["/stem"]}>
        <div style={{ height: "800px" }}>
          <StemFeed />
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

describe("PAGE-008 STEM", () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  beforeEach(() => {
    Object.values(feedApi).forEach((fn) => fn.mockReset());
    ws.on.mockReset();
    ws.off.mockReset();
    ws.connect.mockReset();
    feedApi.apiFetchStories.mockResolvedValue({ users: [], error: null });
    feedApi.apiLiveStreams.mockResolvedValue({ streams: [], error: null });
    feedApi.apiMusicPreview.mockResolvedValue({ url: null, error: "none" });
    feedApi.apiFetchVideoComments.mockResolvedValue({ comments: [], error: null });
    feedApi.apiLikeVideo.mockResolvedValue({ ok: true });
    feedApi.apiUnlikeVideo.mockResolvedValue({ ok: true });
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

  it("loads GET /api/feed/stem once, shows STEM chrome, and does not open a second socket", async () => {
    feedApi.apiFetchStemFeed.mockResolvedValue({ page: { videos: [stemItem], nextCursor: null }, error: null });
    const mounted = renderStem();
    root = mounted.root;
    container = mounted.container;
    await flush();
    expect(feedApi.apiFetchStemFeed).toHaveBeenCalledTimes(1);
    expect(feedApi.apiFetchStemFeed).toHaveBeenCalledWith(null);
    expect(feedApi.apiFetchForYouFeed).not.toHaveBeenCalled();
    expect(ws.connect).not.toHaveBeenCalled();
    expect(container.textContent).toContain("STEM");
    expect(container.querySelector('button[aria-label="Search"]')).toBeTruthy();
    expect(container.querySelector('button[aria-label="Back"]')).toBeTruthy();
    expect(container.querySelector("button[data-elix-watch-id]")).toBeNull();
    expect(container.textContent).toContain("Creator");
  });

  it("shows the OLD empty STEM copy", async () => {
    feedApi.apiFetchStemFeed.mockResolvedValue({ page: { videos: [], nextCursor: null }, error: null });
    const mounted = renderStem();
    root = mounted.root;
    container = mounted.container;
    await flush();
    expect(container.textContent).toContain("Most viewed");
    expect(container.textContent).toContain("Nothing in the global list yet. STEM uses trending views plus caption-tagged clips.");
    expect(container.textContent).toContain("Refresh");
  });

  it("shows failure and refresh without falling back to For You", async () => {
    feedApi.apiFetchStemFeed.mockResolvedValueOnce({ page: null, error: "STEM_ERROR" });
    feedApi.apiFetchStemFeed.mockResolvedValueOnce({ page: { videos: [stemItem], nextCursor: null }, error: null });
    const mounted = renderStem();
    root = mounted.root;
    container = mounted.container;
    await flush();
    expect(container.textContent).toContain("STEM_ERROR");
    const refresh = [...container.querySelectorAll("button")].find((btn) => btn.textContent === "Refresh");
    await act(async () => {
      refresh?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(feedApi.apiFetchStemFeed).toHaveBeenCalledTimes(2);
    expect(feedApi.apiFetchForYouFeed).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Creator");
  });

  it("opens comments for the active STEM video", async () => {
    feedApi.apiFetchStemFeed.mockResolvedValue({ page: { videos: [stemItem], nextCursor: null }, error: null });
    const mounted = renderStem();
    root = mounted.root;
    container = mounted.container;
    await flush();
    const comments = [...container.querySelectorAll("button")].find((btn) => btn.getAttribute("title") === "Comments");
    await act(async () => {
      comments?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.textContent).toContain("Comments");
    expect(feedApi.apiFetchVideoComments).toHaveBeenCalledWith(stemItem.id);
  });

  it("likes through the shared API", async () => {
    feedApi.apiFetchStemFeed.mockResolvedValue({ page: { videos: [stemItem], nextCursor: null }, error: null });
    const mounted = renderStem();
    root = mounted.root;
    container = mounted.container;
    await flush();
    const like = [...container.querySelectorAll("button")].find((btn) => btn.getAttribute("title") === "Like");
    await act(async () => {
      like?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(feedApi.apiLikeVideo).toHaveBeenCalledWith(stemItem.id);
  });

  it("unmounts STEM without ending a live stream", async () => {
    feedApi.apiFetchStemFeed.mockResolvedValue({ page: { videos: [stemItem], nextCursor: null }, error: null });
    const mounted = renderStem();
    root = mounted.root;
    container = mounted.container;
    await flush();
    act(() => mounted.root.unmount());
    root = undefined;
    expect(feedApi.apiFetchStemFeed.mock.calls.every((call) => !String(call[0] || "").includes("/end"))).toBe(true);
    expect(ws.disconnect).not.toHaveBeenCalled();
  });
});
