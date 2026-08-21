import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
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
}));

const ws = vi.hoisted(() => ({
  on: vi.fn(),
  off: vi.fn(),
}));

vi.mock("@/features/feed/feedApi", () => feedApi);
vi.mock("@/lib/wsClient", () => ({ wsClient: ws }));
vi.mock("@/store/useAuthStore", () => ({
  useAuthStore: (selector?: (state: { user: { id: string } }) => unknown) => {
    const state = { user: { id: "11111111-1111-1111-1111-111111111111" } };
    return selector ? selector(state) : state;
  },
}));
vi.mock("@/store/useSettingsStore", () => ({
  useSettingsStore: (selector?: (state: { muteAllSounds: boolean }) => unknown) => {
    const state = { muteAllSounds: false };
    return selector ? selector(state) : state;
  },
}));
vi.mock("@/lib/platform", async () => {
  const actual = await vi.importActual<typeof import("@/lib/platform")>("@/lib/platform");
  return { ...actual, nativeShareUrl: vi.fn(async () => true), platform: { ...actual.platform, isNative: true } };
});

const videoItem = {
  id: "22222222-2222-4222-8222-222222222222",
  kind: "video" as const,
  userId: "33333333-3333-4333-8333-333333333333",
  username: "creator",
  displayName: "Creator",
  avatarUrl: null,
  caption: "hello #tag",
  mediaUrl: "https://cdn.example/video.mp4",
  thumbnailUrl: null,
  likeCount: 2,
  commentCount: 1,
  saveCount: 0,
  viewCount: 4,
  liked: false,
  saved: false,
  isFollowing: false,
  isLive: false,
  hashtags: ["tag"],
  createdAt: "2026-08-20T00:00:00.000Z",
};

function renderFeed(): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <MemoryRouter>
        <div style={{ height: "800px" }}>
          <VideoFeed />
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

describe("PAGE-007 For You", () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  beforeEach(() => {
    Object.values(feedApi).forEach((fn) => fn.mockReset());
    ws.on.mockReset();
    ws.off.mockReset();
    feedApi.apiFetchStories.mockResolvedValue({ users: [], error: null });
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
    feedApi.apiFetchForYouFeed.mockResolvedValue({ page: { items: [videoItem], nextCursor: null }, error: null });
    feedApi.apiLiveStreams.mockResolvedValue({ streams: [], error: null });
    const mounted = renderFeed();
    root = mounted.root;
    container = mounted.container;
    await flush();
    expect(mounted.container.textContent).toContain("Creator");
    expect(feedApi.apiFetchForYouFeed).toHaveBeenCalledTimes(1);
  });

  it("shows empty feed copy and refresh", async () => {
    feedApi.apiFetchForYouFeed.mockResolvedValue({ page: { items: [], nextCursor: null }, error: null });
    feedApi.apiLiveStreams.mockResolvedValue({ streams: [], error: null });
    const mounted = renderFeed();
    root = mounted.root;
    container = mounted.container;
    await flush();
    expect(mounted.container.textContent).toContain("Nothing here yet");
    expect(mounted.container.textContent).not.toContain("Add story");
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
    feedApi.apiFetchForYouFeed.mockResolvedValue({ page: { items: [videoItem], nextCursor: null }, error: null });
    await act(async () => {
      retry?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mounted.container.textContent).toContain("Creator");
  });

  it("opens comments for the active video id", async () => {
    feedApi.apiFetchForYouFeed.mockResolvedValue({ page: { items: [videoItem], nextCursor: null }, error: null });
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
    feedApi.apiFetchForYouFeed.mockResolvedValue({ page: { items: [videoItem], nextCursor: null }, error: null });
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
    feedApi.apiFetchForYouFeed.mockResolvedValue({ page: { items: [], nextCursor: null }, error: null });
    feedApi.apiLiveStreams.mockResolvedValue({ streams: [stream], error: null });
    const mounted = renderFeed();
    root = mounted.root;
    container = mounted.container;
    await flush();
    expect(mounted.container.textContent).toContain("LIVE");
    expect(mounted.container.textContent).toContain("Live Creator");
    const live = mounted.container.querySelector('button[aria-label="Watch Live Creator live"]') as HTMLButtonElement;
    expect(live).toBeTruthy();
    const ended = ws.on.mock.calls.find((call) => call[0] === "stream_ended")?.[1] as (data: unknown) => void;
    await act(async () => {
      ended?.({ stream_key: stream.roomId, room_id: stream.roomId, streamId: stream.streamId });
      await Promise.resolve();
    });
    expect(mounted.container.textContent).not.toContain("Live Creator");
  });

  it("subscribes to feed presence on the existing wsClient and cleans up", async () => {
    feedApi.apiFetchForYouFeed.mockResolvedValue({ page: { items: [], nextCursor: null }, error: null });
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
});
