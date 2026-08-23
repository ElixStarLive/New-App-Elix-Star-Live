import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useForYouFeed } from "./useForYouFeed";

const feedApi = vi.hoisted(() => ({
  apiFetchForYouFeed: vi.fn(),
  apiLiveStreams: vi.fn(),
  apiFetchProfile: vi.fn(),
}));

const auth = vi.hoisted(() => {
  let user: { id: string } | null = { id: "11111111-1111-1111-1111-111111111111" };
  const listeners = new Set<() => void>();
  return {
    get user() {
      return user;
    },
    setUser(next: { id: string } | null) {
      user = next;
      for (const fn of listeners) fn();
    },
    subscribe(fn: () => void) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    checkUser: vi.fn(),
  };
});

vi.mock("@/features/feed/feedApi", () => feedApi);
vi.mock("@/lib/wsClient", () => ({
  wsClient: { on: vi.fn(), off: vi.fn() },
}));
vi.mock("@/lib/toast", () => ({ showToast: vi.fn() }));
vi.mock("@/store/useAuthStore", async () => {
  const { useSyncExternalStore } = await import("react");
  const useAuthStore = Object.assign(
    (selector?: (state: { user: { id: string } | null }) => unknown) => {
      const user = useSyncExternalStore(auth.subscribe, () => auth.user, () => auth.user);
      const state = { user };
      return selector ? selector(state) : state;
    },
    {
      getState: () => ({ user: auth.user, checkUser: auth.checkUser }),
    },
  );
  return { useAuthStore };
});

function HookProbe({ onValue }: { onValue: (value: ReturnType<typeof useForYouFeed>) => void }) {
  const value = useForYouFeed();
  onValue(value);
  return null;
}

const emptyVideo = {
  id: "22222222-2222-4222-8222-222222222222",
  url: "",
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
  description: "",
  hashtags: [] as string[],
  music: null,
  stats: { views: 0, likes: 0, comments: 0, shares: 0, saves: 0 },
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

const playableA = {
  ...emptyVideo,
  id: "22222222-2222-4222-8222-222222222222",
  url: "https://cdn.example/a.mp4",
  user: { ...emptyVideo.user, name: "CreatorA", username: "a" },
};

const playableB = {
  ...emptyVideo,
  id: "55555555-5555-4555-8555-555555555555",
  url: "https://cdn.example/b.mp4",
  user: { ...emptyVideo.user, id: "44444444-4444-4444-8444-444444444444", name: "CreatorB", username: "b" },
};

function pageOf(videos: typeof playableA[]) {
  return {
    videos,
    mutualUserIds: [] as string[],
    page: 1,
    limit: 20,
    hasMore: false,
    total: videos.length,
    source: "foryou",
  };
}

describe("useForYouFeed", () => {
  afterEach(() => {
    document.body.replaceChildren();
    auth.setUser({ id: "11111111-1111-1111-1111-111111111111" });
  });

  beforeEach(() => {
    feedApi.apiFetchForYouFeed.mockReset();
    feedApi.apiLiveStreams.mockReset();
    feedApi.apiLiveStreams.mockResolvedValue({ streams: [], error: null });
    auth.setUser({ id: "11111111-1111-1111-1111-111111111111" });
  });

  it("does not keep videos without a media URL", async () => {
    feedApi.apiFetchForYouFeed.mockResolvedValue({
      page: pageOf([emptyVideo]),
      error: null,
    });
    let latest: ReturnType<typeof useForYouFeed> | undefined;
    const root = createRoot(document.body);
    await act(async () => {
      root.render(<HookProbe onValue={(value) => { latest = value; }} />);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(latest?.slides).toEqual([]);
    root.unmount();
  });

  it("clears the prior viewer slides when the signed-in user changes", async () => {
    feedApi.apiFetchForYouFeed.mockResolvedValue({ page: pageOf([playableA]), error: null });
    let latest: ReturnType<typeof useForYouFeed> | undefined;
    const root = createRoot(document.body);
    await act(async () => {
      root.render(<HookProbe onValue={(value) => { latest = value; }} />);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(latest?.slides.some((slide) => slide.kind === "video" && slide.item.id === playableA.id)).toBe(true);

    feedApi.apiFetchForYouFeed.mockResolvedValue({ page: pageOf([playableB]), error: null });
    await act(async () => {
      auth.setUser({ id: "99999999-9999-4999-8999-999999999999" });
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(latest?.slides.some((slide) => slide.kind === "video" && slide.item.id === playableA.id)).toBe(false);
    expect(latest?.slides.some((slide) => slide.kind === "video" && slide.item.id === playableB.id)).toBe(true);
    root.unmount();
  });
});
