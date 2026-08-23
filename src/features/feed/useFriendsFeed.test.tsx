import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useFriendsFeed } from "./useFriendsFeed";

const feedApi = vi.hoisted(() => ({
  apiFetchFriendsFeed: vi.fn(),
}));

vi.mock("@/features/feed/feedApi", () => feedApi);
vi.mock("@/lib/toast", () => ({ showToast: vi.fn() }));
vi.mock("@/store/useAuthStore", () => ({
  useAuthStore: Object.assign(
    () => ({ user: { id: "11111111-1111-1111-1111-111111111111" } }),
    { getState: () => ({ checkUser: vi.fn() }) },
  ),
}));

function HookProbe({ onValue }: { onValue: (value: ReturnType<typeof useFriendsFeed>) => void }) {
  const value = useFriendsFeed();
  onValue(value);
  return null;
}

describe("useFriendsFeed", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  beforeEach(() => {
    feedApi.apiFetchFriendsFeed.mockReset();
  });

  it("does not keep Friends rows without a media URL", async () => {
    feedApi.apiFetchFriendsFeed.mockResolvedValue({
      feed: {
        videos: [
          {
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
            hashtags: [],
            music: null,
            stats: { views: 0, likes: 0, comments: 0, shares: 0, saves: 0 },
            createdAt: null,
            location: "",
            isLiked: false,
            isSaved: false,
            isFollowing: false,
            comments: [],
            quality: "",
            privacy: "public",
            engagementScore: 0,
          },
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
    expect(latest?.videos).toEqual([]);
    root.unmount();
  });
});
