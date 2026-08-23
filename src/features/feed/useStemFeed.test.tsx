import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useStemFeed } from "./useStemFeed";

const feedApi = vi.hoisted(() => ({
  apiFetchStemFeed: vi.fn(),
}));

vi.mock("@/features/feed/feedApi", () => feedApi);
vi.mock("@/lib/toast", () => ({ showToast: vi.fn() }));
vi.mock("@/store/useAuthStore", () => ({
  useAuthStore: Object.assign(
    () => ({ user: { id: "11111111-1111-1111-1111-111111111111" } }),
    { getState: () => ({ checkUser: vi.fn() }) },
  ),
}));

function HookProbe({ onValue }: { onValue: (value: ReturnType<typeof useStemFeed>) => void }) {
  const value = useStemFeed();
  onValue(value);
  return null;
}

function stemVideo(id: string, name: string, url: string) {
  return {
    id,
    url,
    thumbnail: "",
    duration: "0:15",
    user: {
      id: "33333333-3333-4333-8333-333333333333",
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
    isFollowing: false,
    comments: [] as unknown[],
    quality: "",
    privacy: "public",
    engagementScore: 0,
  };
}

describe("useStemFeed", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  beforeEach(() => {
    feedApi.apiFetchStemFeed.mockReset();
  });

  it("does not keep STEM rows without a media URL", async () => {
    feedApi.apiFetchStemFeed.mockResolvedValue({
      page: {
        videos: [stemVideo("22222222-2222-4222-8222-222222222222", "Creator", "")],
        nextCursor: null,
      },
      error: null,
    });
    let latest: ReturnType<typeof useStemFeed> | undefined;
    const root = createRoot(document.body);
    await act(async () => {
      root.render(<HookProbe onValue={(value) => { latest = value; }} />);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(latest?.videos).toEqual([]);
    root.unmount();
  });

  it("ignores a stale first page when a newer load started", async () => {
    let resolveFirst: ((value: unknown) => void) | undefined;
    feedApi.apiFetchStemFeed.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
    );
    feedApi.apiFetchStemFeed.mockResolvedValueOnce({
      page: {
        videos: [stemVideo("55555555-5555-4555-8555-555555555555", "Second", "https://cdn.example/b.mp4")],
        nextCursor: null,
      },
      error: null,
    });
    let latest: ReturnType<typeof useStemFeed> | undefined;
    const root = createRoot(document.body);
    await act(async () => {
      root.render(<HookProbe onValue={(value) => { latest = value; }} />);
      await Promise.resolve();
    });
    await act(async () => {
      await latest?.reload();
    });
    await act(async () => {
      resolveFirst?.({
        page: {
          videos: [stemVideo("44444444-4444-4444-8444-444444444444", "First", "https://cdn.example/a.mp4")],
          nextCursor: null,
        },
        error: null,
      });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(latest?.videos.map((row) => row.user.name)).toEqual(["Second"]);
    root.unmount();
  });
});
