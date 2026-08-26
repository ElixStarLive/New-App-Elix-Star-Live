import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserPublic } from "@shared/contracts";
import { createFollowingSession } from "./followingSession";

const api = vi.hoisted(() => ({
  apiFetchFollowing: vi.fn(),
  apiFollowFollowingRow: vi.fn(),
  apiUnfollowFollowingRow: vi.fn(),
}));

vi.mock("./followingApi", () => api);

const followee: UserPublic = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  username: "star",
  displayName: "Star",
  avatarUrl: null,
  bio: "",
  isVerified: false,
  followerCount: 0,
  followingCount: 1,
  isFollowing: true,
};

describe("PAGE-028 following session", () => {
  beforeEach(() => {
    api.apiFetchFollowing.mockReset();
    api.apiFollowFollowingRow.mockReset();
    api.apiUnfollowFollowingRow.mockReset();
  });

  it("hydrates following and drops A data on dispose", async () => {
    api.apiFetchFollowing.mockResolvedValue({ users: [followee], error: null });
    const session = createFollowingSession();
    await session.load("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(session.getSnapshot().users).toHaveLength(1);
    session.dispose();
    expect(session.getSnapshot().users).toHaveLength(0);
    expect(session.getSnapshot().ownerUserId).toBe("");
  });

  it("does not let a late A response overwrite B", async () => {
    let resolveA: (value: { users: UserPublic[]; error: null }) => void = () => undefined;
    api.apiFetchFollowing.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveA = resolve as (value: { users: UserPublic[]; error: null }) => void;
        }),
    );
    api.apiFetchFollowing.mockResolvedValueOnce({
      users: [{ ...followee, id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", username: "b-star" }],
      error: null,
    });
    const session = createFollowingSession();
    const first = session.load("owner-a");
    await session.load("owner-b");
    resolveA({ users: [followee], error: null });
    await first;
    expect(session.getSnapshot().users[0]?.username).toBe("b-star");
  });

  it("unfollows on a public list without removing the owner's row", async () => {
    api.apiFetchFollowing.mockResolvedValue({ users: [followee], error: null });
    api.apiUnfollowFollowingRow.mockResolvedValue({ ok: false, error: "forbidden" });
    const session = createFollowingSession();
    await session.load("owner", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    const res = await session.toggleFollow(followee.id, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(res.ok).toBe(false);
    expect(session.getSnapshot().users).toHaveLength(1);
    expect(session.getSnapshot().users[0]?.isFollowing).toBe(true);
  });

  it("blocks a second unfollow tap while the first is in flight", async () => {
    api.apiFetchFollowing.mockResolvedValue({ users: [followee], error: null });
    let release: (value: { ok: true }) => void = () => undefined;
    api.apiUnfollowFollowingRow.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve as (value: { ok: true }) => void;
        }),
    );
    const session = createFollowingSession();
    await session.load("owner", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    const first = session.toggleFollow(followee.id, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    const second = await session.toggleFollow(followee.id, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(second).toEqual({ ok: false, error: "busy" });
    release({ ok: true });
    await first;
    expect(api.apiUnfollowFollowingRow).toHaveBeenCalledTimes(1);
    expect(session.getSnapshot().users).toHaveLength(1);
    expect(session.getSnapshot().users[0]?.isFollowing).toBe(false);
  });

  it("removes the row when the owner unfollows from their own Following list", async () => {
    const ownerId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    api.apiFetchFollowing.mockResolvedValue({ users: [followee], error: null });
    api.apiUnfollowFollowingRow.mockResolvedValue({ ok: true });
    const session = createFollowingSession();
    await session.load(ownerId, ownerId);
    const res = await session.toggleFollow(followee.id, ownerId);
    expect(res).toEqual({ ok: true });
    expect(session.getSnapshot().users).toHaveLength(0);
  });

  it("updates public-list row state from the shared follow bus without dropping membership", async () => {
    api.apiFetchFollowing.mockResolvedValue({ users: [{ ...followee, isFollowing: false }], error: null });
    const session = createFollowingSession();
    await session.load("owner", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    session.applyFollowEvent({ targetId: followee.id, following: true });
    expect(session.getSnapshot().users).toHaveLength(1);
    expect(session.getSnapshot().users[0]?.isFollowing).toBe(true);
  });

  it("drops own-list membership from the shared follow bus on unfollow", async () => {
    const ownerId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    api.apiFetchFollowing.mockResolvedValue({ users: [followee], error: null });
    const session = createFollowingSession();
    await session.load(ownerId, ownerId);
    session.applyFollowEvent({ targetId: followee.id, following: false });
    expect(session.getSnapshot().users).toHaveLength(0);
  });

  it("keeps prior rows when a later load fails", async () => {
    api.apiFetchFollowing.mockResolvedValueOnce({ users: [followee], error: null });
    api.apiFetchFollowing.mockResolvedValueOnce({ users: [], error: "offline", status: 0 });
    const session = createFollowingSession();
    await session.load("owner");
    await session.load("owner");
    expect(session.getSnapshot().users).toHaveLength(1);
    expect(session.getSnapshot().error).toBe("offline");
    expect(session.getSnapshot().phase).toBe("ready");
  });

  it("clears A rows when loading B so a B failure cannot show A", async () => {
    api.apiFetchFollowing.mockResolvedValueOnce({ users: [followee], error: null });
    api.apiFetchFollowing.mockResolvedValueOnce({
      users: [],
      error: "You cannot view this profile",
      status: 403,
    });
    const session = createFollowingSession();
    await session.load("owner-a");
    expect(session.getSnapshot().users).toHaveLength(1);
    await session.load("owner-b");
    const snap = session.getSnapshot();
    expect(snap.users).toHaveLength(0);
    expect(snap.phase).toBe("error");
    expect(snap.errorStatus).toBe(403);
  });
});
