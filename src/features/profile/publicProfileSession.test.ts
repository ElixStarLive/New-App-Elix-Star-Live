import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserPublic } from "@shared/contracts";
import type { FeedVideoPage } from "@/features/feed/feedApi";
import { createPublicProfileSession } from "./publicProfileSession";

const api = vi.hoisted(() => ({
  apiFetchPublicProfile: vi.fn(),
  apiFetchPublicProfileById: vi.fn(),
  apiFetchPublicShop: vi.fn(),
  apiFetchPublicStories: vi.fn(),
  apiFetchPublicTabPage: vi.fn(),
  apiFollowPublicUser: vi.fn(),
  apiUnfollowPublicUser: vi.fn(),
  apiRegisterPublicProfileView: vi.fn(),
  apiBlockUser: vi.fn(),
}));

vi.mock("./publicProfileApi", async () => {
  const actual = await vi.importActual<typeof import("./publicProfileApi")>("./publicProfileApi");
  return {
    ...actual,
    apiFetchPublicProfile: api.apiFetchPublicProfile,
    apiFetchPublicProfileById: api.apiFetchPublicProfileById,
    apiFetchPublicShop: api.apiFetchPublicShop,
    apiFetchPublicStories: api.apiFetchPublicStories,
    apiFetchPublicTabPage: api.apiFetchPublicTabPage,
    apiFollowPublicUser: api.apiFollowPublicUser,
    apiUnfollowPublicUser: api.apiUnfollowPublicUser,
    apiRegisterPublicProfileView: api.apiRegisterPublicProfileView,
    apiBlockUser: api.apiBlockUser,
  };
});

const target: UserPublic = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  username: "creator",
  displayName: "Creator",
  avatarUrl: "https://cdn.example/b.jpg",
  bio: "bio",
  isVerified: true,
  followerCount: 10,
  followingCount: 4,
  likeCount: 8,
  viewCount: 2,
  isLive: false,
  isFollowing: false,
};

const viewerId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function page(ids: string[], nextCursor: string | null = null): FeedVideoPage {
  return {
    videos: ids.map((id) => ({
      id,
      url: `https://cdn.example/${id}.mp4`,
      thumbnail: "",
      duration: "0:15",
      user: {
        id: target.id,
        username: "creator",
        name: "Creator",
        avatar: target.avatarUrl ?? "",
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

describe("PAGE-025 public profile session", () => {
  beforeEach(() => {
    for (const fn of Object.values(api)) fn.mockReset();
    api.apiFetchPublicStories.mockResolvedValue({ stories: [], error: null });
    api.apiFetchPublicShop.mockResolvedValue({ items: [], error: null });
    api.apiRegisterPublicProfileView.mockResolvedValue({ uniqueViews: 3, error: null });
    api.apiFetchPublicTabPage.mockResolvedValue({ page: page(["v1"]), error: null });
  });

  it("loads public metadata then public videos and records a unique view", async () => {
    api.apiFetchPublicProfile.mockResolvedValue({ profile: target, error: null });
    const session = createPublicProfileSession();
    await session.load(target.id, viewerId);
    const snap = session.getSnapshot();
    expect(snap.phase).toBe("ready");
    expect(snap.profile?.username).toBe("creator");
    expect(snap.profile?.followerCount).toBe(10);
    expect(snap.items.map((row) => row.id)).toEqual(["v1"]);
    expect(api.apiFetchPublicTabPage).toHaveBeenCalledWith("videos", target.id, null);
    expect(api.apiRegisterPublicProfileView).toHaveBeenCalledWith(target.id);
    expect(api.apiFetchPublicProfile.mock.calls[0]?.[0]).toBe(target.id);
  });

  it("does not convert a 500 into not-found", async () => {
    api.apiFetchPublicProfile.mockResolvedValue({ profile: null, error: "server_error", status: 500 });
    const session = createPublicProfileSession();
    await session.load(target.id, viewerId);
    expect(session.getSnapshot().phase).toBe("error");
    expect(session.getSnapshot().error).toBe("server_error");
    expect(session.getSnapshot().errorStatus).toBe(500);
    expect(session.getSnapshot().profile).toBeNull();
  });

  it("maps blocked access to the server forbidden copy", async () => {
    api.apiFetchPublicProfile.mockResolvedValue({
      profile: null,
      error: "You cannot view this profile",
      status: 403,
    });
    const session = createPublicProfileSession();
    await session.load(target.id, viewerId);
    expect(session.getSnapshot().error).toBe("You cannot view this profile");
    expect(session.getSnapshot().errorStatus).toBe(403);
    expect(api.apiFetchPublicTabPage).not.toHaveBeenCalled();
  });

  it("drops a stale Profile A response after switching to Profile B", async () => {
    const other: UserPublic = { ...target, id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", username: "other", displayName: "Other" };
    let resolveA: (value: { profile: UserPublic; error: null }) => void = () => undefined;
    let aStarted = false;
    api.apiFetchPublicProfile.mockImplementation((key: string) => {
      if (key === target.id) {
        aStarted = true;
        return new Promise((resolve) => {
          resolveA = resolve as (value: { profile: UserPublic; error: null }) => void;
        });
      }
      return Promise.resolve({ profile: other, error: null });
    });
    api.apiFetchPublicTabPage.mockImplementation((_tab: string, userId: string) =>
      Promise.resolve({ page: page(userId === other.id ? ["b-video"] : ["a-video"]), error: null }),
    );
    const session = createPublicProfileSession();
    const first = session.load(target.id, viewerId);
    for (let i = 0; i < 20 && !aStarted; i += 1) await Promise.resolve();
    expect(aStarted).toBe(true);
    await session.load(other.id, viewerId);
    resolveA({ profile: target, error: null });
    await first;
    expect(session.getSnapshot().profile?.id).toBe(other.id);
    expect(session.getSnapshot().items.map((row) => row.id)).toEqual(["b-video"]);
  });

  it("refetches server counts after follow and ignores a second tap while busy", async () => {
    api.apiFetchPublicProfile.mockResolvedValue({ profile: target, error: null });
    let releaseFollow: (value: { ok: true }) => void = () => undefined;
    api.apiFollowPublicUser.mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseFollow = resolve as (value: { ok: true }) => void;
        }),
    );
    api.apiFetchPublicProfileById.mockResolvedValue({
      profile: { ...target, isFollowing: true, followerCount: 11 },
      error: null,
    });
    const session = createPublicProfileSession();
    await session.load(target.id, viewerId);
    const first = session.toggleFollow();
    const second = await session.toggleFollow();
    expect(second).toEqual({ ok: false, error: "busy" });
    releaseFollow({ ok: true });
    const done = await first;
    expect(done).toEqual({ ok: true });
    expect(session.getSnapshot().profile?.isFollowing).toBe(true);
    expect(session.getSnapshot().profile?.followerCount).toBe(11);
    expect(api.apiFollowPublicUser).toHaveBeenCalledTimes(1);
  });

  it("clears content after a persisted block", async () => {
    api.apiFetchPublicProfile.mockResolvedValue({ profile: target, error: null });
    api.apiBlockUser.mockResolvedValue({ ok: true });
    const session = createPublicProfileSession();
    await session.load(target.id, viewerId);
    const res = await session.blockTarget();
    expect(res).toEqual({ ok: true });
    expect(session.getSnapshot().profile).toBeNull();
    expect(session.getSnapshot().items).toEqual([]);
    expect(session.getSnapshot().errorStatus).toBe(403);
  });

  it("requires login before follow instead of treating a guest as self", async () => {
    api.apiFetchPublicProfile.mockResolvedValue({ profile: target, error: null });
    const session = createPublicProfileSession();
    await session.load(target.id, null);
    const res = await session.toggleFollow();
    expect(res).toEqual({ ok: false, error: "Log in to follow" });
    expect(api.apiFollowPublicUser).not.toHaveBeenCalled();
  });

  it("updates live ring from shared stream presence without inventing host state", async () => {
    api.apiFetchPublicProfile.mockResolvedValue({ profile: target, error: null });
    const session = createPublicProfileSession();
    await session.load(target.id, viewerId);
    expect(session.getSnapshot().profile?.isLive).toBe(false);
    session.applyLivePresence({ hostId: target.id, live: true });
    expect(session.getSnapshot().profile?.isLive).toBe(true);
    session.applyLivePresence({ hostId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", live: true });
    expect(session.getSnapshot().profile?.isLive).toBe(true);
    session.applyLivePresence({ hostId: target.id, live: false });
    expect(session.getSnapshot().profile?.isLive).toBe(false);
  });

  it("removes an unsaved video from the viewer saved tab", async () => {
    api.apiFetchPublicProfile.mockResolvedValue({ profile: target, error: null });
    api.apiFetchPublicTabPage.mockImplementation((tab: string) => {
      if (tab === "saved") return Promise.resolve({ page: page(["s1", "s2"]), error: null });
      return Promise.resolve({ page: page(["v1"]), error: null });
    });
    const session = createPublicProfileSession();
    await session.load(target.id, viewerId);
    session.setTab("saved");
    for (let i = 0; i < 40 && session.getSnapshot().items.map((x) => x.id).join(",") !== "s1,s2"; i += 1) {
      await Promise.resolve();
    }
    expect(session.getSnapshot().items.map((i) => i.id)).toEqual(["s1", "s2"]);
    session.applyCollectionEvent({ type: "saved", videoId: "s1", saved: false });
    expect(session.getSnapshot().items.map((i) => i.id)).toEqual(["s2"]);
  });
});
