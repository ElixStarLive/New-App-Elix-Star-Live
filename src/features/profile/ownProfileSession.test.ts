import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserPublic } from "@shared/contracts";
import type { FeedVideoPage } from "@/features/feed/feedApi";
import { createOwnProfileSession } from "./ownProfileSession";
import { ownProfileEmailLine } from "./ownProfileApi";

const api = vi.hoisted(() => ({
  apiFetchOwnProfile: vi.fn(),
  apiFetchOwnShop: vi.fn(),
  apiFetchOwnTabPage: vi.fn(),
  apiOwnHasActiveStory: vi.fn(),
  apiUploadOwnAvatar: vi.fn(),
}));

vi.mock("./ownProfileApi", async () => {
  const actual = await vi.importActual<typeof import("./ownProfileApi")>("./ownProfileApi");
  return {
    ...actual,
    apiFetchOwnProfile: api.apiFetchOwnProfile,
    apiFetchOwnShop: api.apiFetchOwnShop,
    apiFetchOwnTabPage: api.apiFetchOwnTabPage,
    apiOwnHasActiveStory: api.apiOwnHasActiveStory,
    apiUploadOwnAvatar: api.apiUploadOwnAvatar,
  };
});

const me: UserPublic = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  username: "owner",
  displayName: "Owner",
  avatarUrl: "https://cdn.example/a.jpg",
  bio: "hello",
  isVerified: false,
  followerCount: 2,
  followingCount: 3,
  likeCount: 4,
  viewCount: 5,
};

function page(ids: string[], nextCursor: string | null = null): FeedVideoPage {
  return {
    videos: ids.map((id) => ({
      id,
      url: `https://cdn.example/${id}.mp4`,
      thumbnail: "",
      duration: "0:15",
      user: {
        id: me.id,
        username: "owner",
        name: "Owner",
        avatar: me.avatarUrl ?? "",
        level: 1,
        isVerified: false,
        followers: 0,
        following: 0,
      },
      description: "",
      hashtags: [],
      music: null,
      stats: { views: 1, likes: 0, comments: 0, shares: 0, saves: 0 },
      createdAt: null,
      location: "",
      isLiked: false,
      isSaved: false,
      isFollowing: false,
      comments: [],
      quality: "",
      privacy: "public",
      engagementScore: 0,
    })),
    nextCursor,
  };
}

describe("ownProfileEmailLine", () => {
  it("shows local-part@ only", () => {
    expect(ownProfileEmailLine("info@elixstarlive.co.uk", "owner")).toBe("info@");
    expect(ownProfileEmailLine("", "owner")).toBe("owner@");
  });
});

describe("PAGE-024 own profile session", () => {
  beforeEach(() => {
    api.apiFetchOwnProfile.mockReset();
    api.apiFetchOwnShop.mockReset();
    api.apiFetchOwnTabPage.mockReset();
    api.apiOwnHasActiveStory.mockReset();
    api.apiUploadOwnAvatar.mockReset();
    api.apiOwnHasActiveStory.mockResolvedValue(false);
    api.apiFetchOwnShop.mockResolvedValue({ items: [], error: null });
  });

  it("loads GET /me metadata then videos without client-filtering a generic catalog", async () => {
    api.apiFetchOwnProfile.mockResolvedValue({ profile: me, error: null });
    api.apiFetchOwnTabPage.mockResolvedValue({ page: page(["v1"]), error: null });
    const session = createOwnProfileSession();
    await session.load();
    const snap = session.getSnapshot();
    expect(snap.phase).toBe("ready");
    expect(snap.profile?.username).toBe("owner");
    expect(snap.profile?.followerCount).toBe(2);
    expect(snap.profile?.likeCount).toBe(4);
    expect(snap.profile?.viewCount).toBe(5);
    expect(snap.items.map((i) => i.id)).toEqual(["v1"]);
    expect(api.apiFetchOwnTabPage).toHaveBeenCalledWith("videos", me.id, null);
  });

  it("keeps a failed profile as error instead of empty counts", async () => {
    api.apiFetchOwnProfile.mockResolvedValue({ profile: null, error: "offline", status: 0 });
    const session = createOwnProfileSession();
    await session.load();
    expect(session.getSnapshot().phase).toBe("error");
    expect(session.getSnapshot().error).toBe("offline");
    expect(session.getSnapshot().profile).toBeNull();
    expect(api.apiFetchOwnTabPage).not.toHaveBeenCalled();
  });

  it("drops a stale videos response after switching to liked", async () => {
    api.apiFetchOwnProfile.mockResolvedValue({ profile: me, error: null });
    let resolveVideos: (value: { page: FeedVideoPage; error: null }) => void = () => undefined;
    let videosStarted = false;
    api.apiFetchOwnTabPage.mockImplementation((tab: string) => {
      if (tab === "videos") {
        videosStarted = true;
        return new Promise((resolve) => {
          resolveVideos = resolve as (value: { page: FeedVideoPage; error: null }) => void;
        });
      }
      return Promise.resolve({ page: page(["liked-1"]), error: null });
    });
    const session = createOwnProfileSession();
    const first = session.load();
    for (let i = 0; i < 20 && !videosStarted; i += 1) {
      await Promise.resolve();
    }
    expect(videosStarted).toBe(true);
    session.setTab("liked");
    await Promise.resolve();
    resolveVideos({ page: page(["stale-video"]), error: null });
    await first;
    expect(session.getSnapshot().tab).toBe("liked");
    expect(session.getSnapshot().items.map((i) => i.id)).toEqual(["liked-1"]);
  });

  it("dispose clears identity so a later load cannot show the previous account", async () => {
    api.apiFetchOwnProfile.mockResolvedValue({ profile: me, error: null });
    api.apiFetchOwnTabPage.mockResolvedValue({ page: page(["mine"]), error: null });
    const session = createOwnProfileSession();
    await session.load();
    expect(session.getSnapshot().profile?.id).toBe(me.id);
    session.dispose();
    expect(session.getSnapshot().profile).toBeNull();
    expect(session.getSnapshot().items).toEqual([]);
  });
});
