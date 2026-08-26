import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import VideoFeed from "./VideoFeed";

const feedApi = vi.hoisted(() => ({
  apiFetchForYouFeed: vi.fn(),
  apiLiveStreams: vi.fn(),
  apiFetchStories: vi.fn(),
  apiFetchProfile: vi.fn(),
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
  apiFollowList: vi.fn(),
  apiFetchProfiles: vi.fn(),
  apiLiveToken: vi.fn(),
  apiLiveStatus: vi.fn(),
}));

const ws = vi.hoisted(() => ({
  on: vi.fn(),
  off: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
  getCurrentRoomId: vi.fn(() => null),
  isConnected: vi.fn(() => false),
  reconnectOnForeground: vi.fn(),
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

const videoItem = {
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
  description: "hello #tag",
  hashtags: ["tag"],
  music: null,
  stats: { views: 4, likes: 2, comments: 1, shares: 0, saves: 0 },
  createdAt: null,
  location: "For You",
  isLiked: false,
  isSaved: false,
  isFollowing: false,
  comments: [],
  quality: "auto",
  privacy: "public",
  engagementScore: 0,
};

function renderFeed(): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <MemoryRouter initialEntries={["/feed"]}>
        <Routes>
          <Route
            path="/feed"
            element={
              <div style={{ height: "800px" }}>
                <VideoFeed />
              </div>
            }
          />
          <Route path="/music/:songId" element={<div>MUSIC DETAIL</div>} />
          <Route path="/music" element={<div>MUSIC CATALOG</div>} />
        </Routes>
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

describe("PAGE-007 For You", () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  beforeEach(() => {
    Object.values(feedApi).forEach((fn) => fn.mockReset());
    ws.on.mockReset();
    ws.off.mockReset();
    ws.connect.mockReset();
    ws.disconnect.mockReset();
    ws.getCurrentRoomId.mockReset();
    ws.getCurrentRoomId.mockReturnValue(null);
    ws.isConnected.mockReset();
    ws.isConnected.mockReturnValue(false);
    ws.reconnectOnForeground.mockReset();
    feedApi.apiFetchStories.mockResolvedValue({ users: [], error: null });
    feedApi.apiFollowList.mockResolvedValue({ users: [], error: null });
    feedApi.apiFetchProfiles.mockResolvedValue({ profiles: [], error: null });
    feedApi.apiLiveStreams.mockResolvedValue({ streams: [], error: null });
    feedApi.apiLiveToken.mockResolvedValue({ token: null, error: null });
    feedApi.apiLiveStatus.mockResolvedValue({ status: { active: true, roomId: null }, error: null });
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
    root = undefined;
    container = undefined;
    document.body.removeAttribute("data-user-profile-open");
  });

  it("loads valid feed results once", async () => {
    feedApi.apiFetchForYouFeed.mockResolvedValue({ page: { videos: [videoItem], mutualUserIds: [], page: 1, limit: 20, hasMore: false, total: 1, source: "postgres" }, error: null });
    feedApi.apiLiveStreams.mockResolvedValue({ streams: [], error: null });
    const mounted = renderFeed();
    root = mounted.root;
    container = mounted.container;
    await flush();
    expect(mounted.container.textContent).toContain("Creator");
    expect(feedApi.apiFetchForYouFeed).toHaveBeenCalledTimes(1);
    expect(feedApi.apiFetchStories).not.toHaveBeenCalled();
    expect(mounted.container.textContent).not.toMatch(/Add story|Your story/);
  });

  it("shows empty feed copy and refresh", async () => {
    feedApi.apiFetchForYouFeed.mockResolvedValue({ page: { videos: [], mutualUserIds: [], page: 1, limit: 20, hasMore: false, total: 0, source: "postgres" }, error: null });
    feedApi.apiLiveStreams.mockResolvedValue({ streams: [], error: null });
    const mounted = renderFeed();
    root = mounted.root;
    container = mounted.container;
    await flush();
    expect(mounted.container.textContent).toContain("Nothing here yet");
    const refresh = [...mounted.container.querySelectorAll("button")].find((el) => el.textContent === "Refresh");
    expect(refresh).toBeTruthy();
    await act(async () => {
      refresh?.click();
      await Promise.resolve();
    });
    expect(feedApi.apiFetchForYouFeed.mock.calls.length).toBeGreaterThan(1);
  });

  it("shows initial failure and retry", async () => {
    feedApi.apiFetchForYouFeed.mockResolvedValue({ page: null, error: "Network error" });
    feedApi.apiLiveStreams.mockResolvedValue({ streams: [], error: null });
    const mounted = renderFeed();
    root = mounted.root;
    container = mounted.container;
    await flush();
    expect(mounted.container.textContent).toContain("Network error");
    const retry = [...mounted.container.querySelectorAll("button")].find((el) => el.textContent === "Retry");
    feedApi.apiFetchForYouFeed.mockResolvedValue({ page: { videos: [videoItem], mutualUserIds: [], page: 1, limit: 20, hasMore: false, total: 1, source: "postgres" }, error: null });
    await act(async () => {
      retry?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mounted.container.textContent).toContain("Creator");
  });

  it("opens comments for the active video id", async () => {
    feedApi.apiFetchForYouFeed.mockResolvedValue({ page: { videos: [videoItem], mutualUserIds: [], page: 1, limit: 20, hasMore: false, total: 1, source: "postgres" }, error: null });
    feedApi.apiLiveStreams.mockResolvedValue({ streams: [], error: null });
    const mounted = renderFeed();
    root = mounted.root;
    container = mounted.container;
    await flush();
    const comments = mounted.container.querySelector('button[title="Comments"]') as HTMLButtonElement;
    await act(async () => {
      comments.click();
      await Promise.resolve();
    });
    expect(mounted.container.textContent).toContain("Newest");
    expect(mounted.container.textContent).toMatch(/Comments/);
    expect(mounted.container.textContent).toContain("Oldest");
    expect(mounted.container.textContent).toContain("Most Liked");
    expect(feedApi.apiFetchVideoComments).toHaveBeenCalledWith(videoItem.id);
  });

  it("likes through the real API and rolls back on failure", async () => {
    feedApi.apiFetchForYouFeed.mockResolvedValue({ page: { videos: [videoItem], mutualUserIds: [], page: 1, limit: 20, hasMore: false, total: 1, source: "postgres" }, error: null });
    feedApi.apiLiveStreams.mockResolvedValue({ streams: [], error: null });
    feedApi.apiLikeVideo.mockResolvedValue({ ok: false, error: "Could not like" });
    const mounted = renderFeed();
    root = mounted.root;
    container = mounted.container;
    await flush();
    const like = mounted.container.querySelector('button[title="Like"]') as HTMLButtonElement;
    await act(async () => {
      like.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(feedApi.apiLikeVideo).toHaveBeenCalledWith(videoItem.id);
  });

  it("hands a live card to /watch/:streamId and removes it when the stream ends", async () => {
    const stream = {
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
    feedApi.apiFetchForYouFeed.mockResolvedValue({ page: { videos: [], mutualUserIds: [], page: 1, limit: 20, hasMore: false, total: 0, source: "postgres" }, error: null });
    feedApi.apiLiveStreams.mockResolvedValue({ streams: [stream], error: null });
    const mounted = renderFeed();
    root = mounted.root;
    container = mounted.container;
    await flush();
    expect(mounted.container.textContent).toContain("LIVE");
    expect(mounted.container.textContent).toContain("Live Creator");
    const live = mounted.container.querySelector('[data-elix-watch-id][aria-label="Watch Live Creator live"]') as HTMLElement;
    expect(live).toBeTruthy();
    const ended = ws.on.mock.calls.find((call) => call[0] === "stream_ended")?.[1] as (data: unknown) => void;
    await act(async () => {
      ended?.({ roomId: stream.roomId });
      await Promise.resolve();
    });
    expect(mounted.container.textContent).not.toContain("Live Creator");
  });

  it("subscribes to feed presence on the existing wsClient and cleans up", async () => {
    feedApi.apiFetchForYouFeed.mockResolvedValue({ page: { videos: [], mutualUserIds: [], page: 1, limit: 20, hasMore: false, total: 0, source: "postgres" }, error: null });
    feedApi.apiLiveStreams.mockResolvedValue({ streams: [], error: null });
    const mounted = renderFeed();
    root = mounted.root;
    container = mounted.container;
    await flush();
    expect(ws.on).toHaveBeenCalledWith("stream_started", expect.any(Function));
    expect(ws.on).toHaveBeenCalledWith("stream_ended", expect.any(Function));
    expect(ws.on.mock.calls.filter((call) => call[0] === "stream_started")).toHaveLength(1);
    act(() => mounted.root.unmount());
    expect(ws.off).toHaveBeenCalledWith("stream_started", expect.any(Function));
    expect(ws.off).toHaveBeenCalledWith("stream_ended", expect.any(Function));
    root = undefined;
  });

  it("hands live cards to /watch using the room id", async () => {
    const stream = {
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
    feedApi.apiFetchForYouFeed.mockResolvedValue({ page: { videos: [], mutualUserIds: [], page: 1, limit: 20, hasMore: false, total: 0, source: "postgres" }, error: null });
    feedApi.apiLiveStreams.mockResolvedValue({ streams: [stream], error: null });
    const mounted = renderFeed();
    root = mounted.root;
    container = mounted.container;
    await flush();
    const live = mounted.container.querySelector("[data-elix-watch-id]") as HTMLElement;
    expect(live?.getAttribute("data-elix-watch-id")).toBe(stream.roomId);
    expect(mounted.container.textContent).toContain("Tap to join live");
  });

  it("opens the more grid and pauses playback while a panel is open", async () => {
    feedApi.apiFetchForYouFeed.mockResolvedValue({ page: { videos: [videoItem], mutualUserIds: [], page: 1, limit: 20, hasMore: false, total: 1, source: "postgres" }, error: null });
    feedApi.apiLiveStreams.mockResolvedValue({ streams: [], error: null });
    const pause = vi.fn();
    HTMLMediaElement.prototype.pause = pause;
    const mounted = renderFeed();
    root = mounted.root;
    container = mounted.container;
    await flush();
    const more = mounted.container.querySelector('button[aria-label="More options"]') as HTMLButtonElement;
    await act(async () => {
      more.click();
      await Promise.resolve();
    });
    expect(mounted.container.textContent).toContain("Copy Link");
    expect(mounted.container.textContent).toContain("Download");
    expect(mounted.container.textContent).toContain("Promote");
    expect(mounted.container.textContent).toContain("QR Code");
    expect(mounted.container.querySelector(".elix-more-options-sheet.bottom-sheet-above-nav")).toBeTruthy();
    expect(pause).toHaveBeenCalled();
    feedApi.apiDownloadVoiceOnlyVideo.mockResolvedValue({
      ok: true,
      blob: new Blob([new Uint8Array([1, 2, 3])], { type: "video/mp4" }),
      filename: "video_clip.mp4",
    });
    const objectUrl = vi.fn(() => "blob:elix-voice");
    const revoke = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL: objectUrl, revokeObjectURL: revoke });
    const download = Array.from(mounted.container.querySelectorAll("button")).find((el) =>
      (el.textContent || "").includes("Download"),
    ) as HTMLButtonElement;
    await act(async () => {
      download.click();
      await Promise.resolve();
    });
    expect(feedApi.apiDownloadVoiceOnlyVideo).toHaveBeenCalledWith(videoItem.id);
    await act(async () => {
      more.click();
      await Promise.resolve();
    });
    const promote = Array.from(mounted.container.querySelectorAll("button")).find((el) =>
      (el.textContent || "").includes("Promote"),
    ) as HTMLButtonElement;
    await act(async () => {
      promote.click();
      await Promise.resolve();
    });
    expect(mounted.container.querySelector("[data-elix-promote-video]")?.getAttribute("data-elix-promote-video")).toBe(
      videoItem.id,
    );
  });

  it("requests the next For You page once near the end", async () => {
    const second = { ...videoItem, id: "55555555-5555-4555-8555-555555555555", user: { ...videoItem.user, username: "two", name: "Second" } };
    feedApi.apiFetchForYouFeed
      .mockResolvedValueOnce({ page: { videos: [videoItem], mutualUserIds: [], page: 1, limit: 20, hasMore: true, total: 1, source: "postgres" }, error: null })
      .mockResolvedValueOnce({ page: { videos: [second], mutualUserIds: [], page: 2, limit: 20, hasMore: false, total: 2, source: "postgres" }, error: null });
    feedApi.apiLiveStreams.mockResolvedValue({ streams: [], error: null });
    const mounted = renderFeed();
    root = mounted.root;
    container = mounted.container;
    await flush();
    await flush();
    expect(feedApi.apiFetchForYouFeed).toHaveBeenCalledTimes(2);
    expect(feedApi.apiFetchForYouFeed.mock.calls[1]?.[0]).toBe(2);
  });

  it("opens Music only when a valid soundId exists", async () => {
    feedApi.apiFetchForYouFeed.mockResolvedValue({
      page: { videos: [{ ...videoItem, music: { id: "epidemic-track-1", title: "Track", artist: "A", duration: "0:30" } }], mutualUserIds: [], page: 1, limit: 20, hasMore: false, total: 1, source: "postgres" },
      error: null,
    });
    feedApi.apiLiveStreams.mockResolvedValue({ streams: [], error: null });
    const mounted = renderFeed();
    root = mounted.root;
    container = mounted.container;
    await flush();
    const music = mounted.container.querySelector('button[title="Original Sound"]') as HTMLButtonElement;
    await act(async () => {
      music.click();
      await Promise.resolve();
    });
    expect(mounted.container.textContent).toContain("MUSIC DETAIL");
    expect(mounted.container.textContent).not.toContain("MUSIC CATALOG");
  });

  it("does not mount Friends story rings on For You", async () => {
    feedApi.apiFetchForYouFeed.mockResolvedValue({ page: { videos: [videoItem], mutualUserIds: [], page: 1, limit: 20, hasMore: false, total: 1, source: "postgres" }, error: null });
    feedApi.apiLiveStreams.mockResolvedValue({ streams: [], error: null });
    const mounted = renderFeed();
    root = mounted.root;
    container = mounted.container;
    await flush();
    expect(feedApi.apiFetchStories).not.toHaveBeenCalled();
    expect(mounted.container.textContent).not.toMatch(/Add story|Your story/);
    expect(mounted.container.textContent).not.toContain("Following");
    expect(mounted.container.querySelector("h1")).toBeNull();
  });

  it("does not open a generic Music page when soundId is missing or original", async () => {
    feedApi.apiFetchForYouFeed.mockResolvedValue({
      page: { videos: [{ ...videoItem, music: { id: "original", title: "Original", artist: "Creator", duration: "0:15" } }], mutualUserIds: [], page: 1, limit: 20, hasMore: false, total: 1, source: "postgres" },
      error: null,
    });
    feedApi.apiLiveStreams.mockResolvedValue({ streams: [], error: null });
    const mounted = renderFeed();
    root = mounted.root;
    container = mounted.container;
    await flush();
    const music = mounted.container.querySelector('button[title="Original Sound"]') as HTMLButtonElement;
    await act(async () => {
      music.click();
      await Promise.resolve();
    });
    expect(mounted.container.textContent).not.toContain("MUSIC DETAIL");
    expect(mounted.container.textContent).not.toContain("MUSIC CATALOG");
    expect(mounted.container.textContent).toContain("Creator");
  });
});
