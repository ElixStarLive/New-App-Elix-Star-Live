import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useFriendsFeed } from "./useFriendsFeed";

const feedApi = vi.hoisted(() => ({
  apiFetchFriendsFeed: vi.fn(),
}));

vi.mock("@/features/feed/feedApi", () => feedApi);
vi.mock("@/lib/toast", () => ({ showToast: vi.fn() }));

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

function HookProbe({ onValue }: { onValue: (value: ReturnType<typeof useFriendsFeed>) => void }) {
  const value = useFriendsFeed();
  onValue(value);
  return null;
}

function video(id: string, creatorId: string, name: string, url: string, isFollowing = false) {
  return {
    id,
    url,
    thumbnail: "",
    duration: "0:15",
    user: {
      id: creatorId,
      username: "creator",
      name,
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
    isFollowing,
    comments: [] as unknown[],
    quality: "",
    privacy: "public",
    engagementScore: 0,
  };
}

describe("useFriendsFeed", () => {
  afterEach(() => {
    document.body.replaceChildren();
    auth.setUser({ id: "11111111-1111-1111-1111-111111111111" });
  });

  beforeEach(() => {
    feedApi.apiFetchFriendsFeed.mockReset();
    auth.setUser({ id: "11111111-1111-1111-1111-111111111111" });
  });

  it("does not keep Friends rows without a media URL", async () => {
    feedApi.apiFetchFriendsFeed.mockResolvedValue({
      feed: {
        videos: [video("22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333", "Creator", "")],
      },
      error: null,
    });
    let latest: ReturnType<typeof useFriendsFeed> | undefined;
    const root = createRoot(document.body);
    await act(async () => {
      root.render(<HookProbe onValue={(value) => { latest = value; }} />);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(latest?.videos).toEqual([]);
    root.unmount();
  });

  it("clears prior viewer rows on account switch", async () => {
    feedApi.apiFetchFriendsFeed.mockResolvedValue({
      feed: {
        videos: [
          video(
            "22222222-2222-4222-8222-222222222222",
            "33333333-3333-4333-8333-333333333333",
            "CreatorA",
            "https://cdn.example/a.mp4",
            true,
          ),
        ],
      },
      error: null,
    });
    let latest: ReturnType<typeof useFriendsFeed> | undefined;
    const root = createRoot(document.body);
    await act(async () => {
      root.render(<HookProbe onValue={(value) => { latest = value; }} />);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(latest?.videos.some((row) => row.id === "22222222-2222-4222-8222-222222222222")).toBe(true);

    feedApi.apiFetchFriendsFeed.mockResolvedValue({
      feed: {
        videos: [
          video(
            "55555555-5555-4555-8555-555555555555",
            "66666666-6666-4666-8666-666666666666",
            "CreatorB",
            "https://cdn.example/b.mp4",
          ),
        ],
      },
      error: null,
    });
    await act(async () => {
      auth.setUser({ id: "99999999-9999-4999-8999-999999999999" });
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(latest?.videos.some((row) => row.id === "22222222-2222-4222-8222-222222222222")).toBe(false);
    expect(latest?.videos.some((row) => row.id === "55555555-5555-4555-8555-555555555555")).toBe(true);
    root.unmount();
  });
});
