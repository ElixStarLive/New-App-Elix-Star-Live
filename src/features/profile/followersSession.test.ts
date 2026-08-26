import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserPublic } from "@shared/contracts";
import { createFollowersSession } from "./followersSession";

const api = vi.hoisted(() => ({
  apiFetchFollowers: vi.fn(),
  apiFollowFollowerRow: vi.fn(),
  apiUnfollowFollowerRow: vi.fn(),
}));

vi.mock("./followersApi", () => api);

const fan: UserPublic = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  username: "fan",
  displayName: "Fan",
  avatarUrl: null,
  bio: "",
  isVerified: false,
  followerCount: 1,
  followingCount: 0,
  isFollowing: false,
};

describe("PAGE-027 followers session", () => {
  beforeEach(() => {
    api.apiFetchFollowers.mockReset();
    api.apiFollowFollowerRow.mockReset();
    api.apiUnfollowFollowerRow.mockReset();
  });

  it("hydrates followers and drops A data on dispose", async () => {
    api.apiFetchFollowers.mockResolvedValue({ users: [fan], error: null });
    const session = createFollowersSession();
    await session.load("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(session.getSnapshot().users).toHaveLength(1);
    session.dispose();
    expect(session.getSnapshot().users).toHaveLength(0);
    expect(session.getSnapshot().ownerUserId).toBe("");
  });

  it("does not let a late A response overwrite B", async () => {
    let resolveA: (value: { users: UserPublic[]; error: null }) => void = () => undefined;
    api.apiFetchFollowers.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveA = resolve as (value: { users: UserPublic[]; error: null }) => void;
        }),
    );
    api.apiFetchFollowers.mockResolvedValueOnce({
      users: [{ ...fan, id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", username: "b-fan" }],
      error: null,
    });
    const session = createFollowersSession();
    const first = session.load("owner-a");
    await session.load("owner-b");
    resolveA({ users: [fan], error: null });
    await first;
    expect(session.getSnapshot().users[0]?.username).toBe("b-fan");
  });

  it("reverts follow when the server rejects", async () => {
    api.apiFetchFollowers.mockResolvedValue({ users: [fan], error: null });
    api.apiFollowFollowerRow.mockResolvedValue({ ok: false, error: "forbidden" });
    const session = createFollowersSession();
    await session.load("owner");
    const res = await session.toggleFollow(fan.id, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(res.ok).toBe(false);
    expect(session.getSnapshot().users[0]?.isFollowing).toBe(false);
  });

  it("blocks a second follow tap while the first is in flight", async () => {
    api.apiFetchFollowers.mockResolvedValue({ users: [fan], error: null });
    let release: (value: { ok: true }) => void = () => undefined;
    api.apiFollowFollowerRow.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve as (value: { ok: true }) => void;
        }),
    );
    const session = createFollowersSession();
    await session.load("owner");
    const first = session.toggleFollow(fan.id, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    const second = await session.toggleFollow(fan.id, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(second).toEqual({ ok: false, error: "busy" });
    release({ ok: true });
    await first;
    expect(api.apiFollowFollowerRow).toHaveBeenCalledTimes(1);
  });

  it("clears A rows when loading B so a B failure cannot show A", async () => {
    api.apiFetchFollowers.mockResolvedValueOnce({ users: [fan], error: null });
    api.apiFetchFollowers.mockResolvedValueOnce({
      users: [],
      error: "You cannot view this profile",
      status: 403,
    });
    const session = createFollowersSession();
    await session.load("owner-a");
    expect(session.getSnapshot().users).toHaveLength(1);
    await session.load("owner-b");
    const snap = session.getSnapshot();
    expect(snap.users).toHaveLength(0);
    expect(snap.phase).toBe("error");
    expect(snap.errorStatus).toBe(403);
    expect(snap.error).toBe("You cannot view this profile");
  });

  it("keeps same-owner rows on soft reload failure", async () => {
    api.apiFetchFollowers.mockResolvedValueOnce({ users: [fan], error: null });
    api.apiFetchFollowers.mockResolvedValueOnce({
      users: [],
      error: "Could not load list",
      status: 500,
    });
    const session = createFollowersSession();
    await session.load("owner-a");
    await session.load("owner-a");
    const snap = session.getSnapshot();
    expect(snap.users).toHaveLength(1);
    expect(snap.phase).toBe("ready");
    expect(snap.error).toBe("Could not load list");
  });

  it("updates row follow state from the shared relationship bus", async () => {
    api.apiFetchFollowers.mockResolvedValue({ users: [fan], error: null });
    const session = createFollowersSession();
    await session.load("owner");
    session.applyFollowEvent({ targetId: fan.id, following: true });
    expect(session.getSnapshot().users[0]?.isFollowing).toBe(true);
    session.applyFollowEvent({ targetId: fan.id, following: false });
    expect(session.getSnapshot().users[0]?.isFollowing).toBe(false);
  });

  it("reloads membership when the viewer follows the list owner", async () => {
    api.apiFetchFollowers
      .mockResolvedValueOnce({ users: [fan], error: null })
      .mockResolvedValueOnce({
        users: [{ ...fan, id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", username: "me" }],
        error: null,
      });
    const session = createFollowersSession();
    await session.load("owner");
    expect(session.getSnapshot().users).toHaveLength(1);
    session.applyFollowEvent({ targetId: "owner", following: true });
    for (let i = 0; i < 20 && api.apiFetchFollowers.mock.calls.length < 2; i += 1) {
      await Promise.resolve();
    }
    expect(api.apiFetchFollowers).toHaveBeenCalledTimes(2);
  });
});
