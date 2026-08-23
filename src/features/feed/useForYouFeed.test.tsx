import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useForYouFeed } from "./useForYouFeed";

const feedApi = vi.hoisted(() => ({
  apiFetchForYouFeed: vi.fn(),
  apiLiveStreams: vi.fn(),
  apiFetchProfile: vi.fn(),
}));

vi.mock("@/features/feed/feedApi", () => feedApi);
vi.mock("@/lib/wsClient", () => ({
  wsClient: { on: vi.fn(), off: vi.fn() },
}));
vi.mock("@/lib/toast", () => ({ showToast: vi.fn() }));
vi.mock("@/store/useAuthStore", () => ({
  useAuthStore: Object.assign(
    () => ({ user: { id: "11111111-1111-1111-1111-111111111111" } }),
    { getState: () => ({ checkUser: vi.fn() }) },
  ),
}));

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

describe("useForYouFeed", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  beforeEach(() => {
    feedApi.apiFetchForYouFeed.mockReset();
    feedApi.apiLiveStreams.mockReset();
    feedApi.apiLiveStreams.mockResolvedValue({ streams: [], error: null });
  });

  it("does not keep videos without a media URL", async () => {
    feedApi.apiFetchForYouFeed.mockResolvedValue({
      page: {
        videos: [emptyVideo],
        mutualUserIds: [],
        page: 1,
        limit: 20,
        hasMore: false,
        total: 1,
        source: "foryou",
      },
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
});
