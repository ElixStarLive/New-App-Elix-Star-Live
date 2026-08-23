import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserPublic } from "@shared/contracts";
import { createInboxSession } from "./inboxSession";

const api = vi.hoisted(() => ({
  apiListChatThreads: vi.fn(),
  apiDeleteChatThread: vi.fn(),
  apiFetchFollowers: vi.fn(),
  apiFollowFollowerRow: vi.fn(),
  apiUnfollowFollowerRow: vi.fn(),
  apiListInboxActivity: vi.fn(),
  apiListInboxCircles: vi.fn(),
  apiListInboxNotices: vi.fn(),
  apiListLiveShareRequests: vi.fn(),
  apiMarkInboxNoticesRead: vi.fn(),
}));

vi.mock("@/features/chat/chatApi", () => ({
  apiListChatThreads: (...args: unknown[]) => api.apiListChatThreads(...args),
  apiDeleteChatThread: (...args: unknown[]) => api.apiDeleteChatThread(...args),
}));
vi.mock("@/features/profile/followersApi", () => ({
  apiFetchFollowers: (...args: unknown[]) => api.apiFetchFollowers(...args),
  apiFollowFollowerRow: (...args: unknown[]) => api.apiFollowFollowerRow(...args),
  apiUnfollowFollowerRow: (...args: unknown[]) => api.apiUnfollowFollowerRow(...args),
}));
vi.mock("./inboxApi", () => ({
  apiListInboxActivity: (...args: unknown[]) => api.apiListInboxActivity(...args),
  apiListInboxCircles: (...args: unknown[]) => api.apiListInboxCircles(...args),
  apiListInboxNotices: (...args: unknown[]) => api.apiListInboxNotices(...args),
  apiListLiveShareRequests: (...args: unknown[]) => api.apiListLiveShareRequests(...args),
  apiMarkInboxNoticesRead: (...args: unknown[]) => api.apiMarkInboxNoticesRead(...args),
}));

const fan: UserPublic = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  username: "fan",
  displayName: "Fan",
  avatarUrl: null,
  bio: "",
  isVerified: false,
  followerCount: 0,
  followingCount: 0,
  isFollowing: false,
};

const thread = {
  id: "thread-1",
  otherUserId: fan.id,
  otherUsername: "fan",
  otherDisplayName: "Fan",
  otherAvatarUrl: null,
  lastMessage: "hi",
  unread: true,
  unreadCount: 2,
  updatedAt: "2026-08-21T00:00:00.000Z",
};

function emptyOk() {
  api.apiListChatThreads.mockResolvedValue({ threads: [], error: null });
  api.apiFetchFollowers.mockResolvedValue({ users: [], error: null });
  api.apiListInboxCircles.mockResolvedValue({ users: [], error: null });
  api.apiListInboxActivity.mockResolvedValue({ items: [], total: 0, error: null });
  api.apiListInboxNotices.mockResolvedValue({
    gifts: [],
    giftCount: 0,
    shop: [],
    alerts: [],
    alertCount: 0,
    unreadIds: [],
    error: null,
  });
  api.apiListLiveShareRequests.mockResolvedValue({ items: [], error: null });
  api.apiMarkInboxNoticesRead.mockResolvedValue({ ok: true });
}

describe("PAGE-030 inbox session", () => {
  beforeEach(() => {
    for (const fn of Object.values(api)) fn.mockReset();
    emptyOk();
  });

  it("hydrates threads and drops A data on dispose", async () => {
    api.apiListChatThreads.mockResolvedValue({ threads: [thread], error: null });
    const session = createInboxSession();
    await session.load("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(session.getSnapshot().threads).toHaveLength(1);
    expect(session.getSnapshot().threads[0]?.unreadCount).toBe(2);
    session.dispose();
    expect(session.getSnapshot().threads).toHaveLength(0);
    expect(session.getSnapshot().viewerId).toBe("");
  });

  it("does not let a late A thread list overwrite B", async () => {
    let resolveA: (value: { threads: typeof thread[]; error: null }) => void = () => undefined;
    api.apiListChatThreads.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveA = resolve as (value: { threads: typeof thread[]; error: null }) => void;
        }),
    );
    api.apiListChatThreads.mockResolvedValueOnce({
      threads: [{ ...thread, id: "thread-b", otherUsername: "b-user" }],
      error: null,
    });
    const session = createInboxSession();
    const first = session.load("owner-a");
    await session.load("owner-b");
    resolveA({ threads: [thread], error: null });
    await first;
    expect(session.getSnapshot().threads[0]?.otherUsername).toBe("b-user");
  });

  it("keeps prior threads when the list fails", async () => {
    api.apiListChatThreads.mockResolvedValueOnce({ threads: [thread], error: null });
    const session = createInboxSession();
    await session.load("owner");
    api.apiListChatThreads.mockResolvedValueOnce({ threads: [], error: "offline" });
    await session.load("owner");
    expect(session.getSnapshot().threads).toHaveLength(1);
    expect(session.getSnapshot().threadsError).toBe("offline");
  });

  it("clears A threads when loading B so a B failure cannot show A's DMs", async () => {
    api.apiListChatThreads.mockResolvedValueOnce({ threads: [thread], error: null });
    const session = createInboxSession();
    await session.load("owner-a");
    expect(session.getSnapshot().threads).toHaveLength(1);
    api.apiListChatThreads.mockResolvedValueOnce({ threads: [], error: "offline" });
    await session.load("owner-b");
    const snap = session.getSnapshot();
    expect(snap.threads).toHaveLength(0);
    expect(snap.phase).toBe("error");
    expect(snap.threadsError).toBe("offline");
    expect(snap.viewerId).toBe("owner-b");
  });

  it("treats a failed empty load as error, not empty success", async () => {
    api.apiListChatThreads.mockResolvedValue({ threads: [], error: "offline" });
    const session = createInboxSession();
    await session.load("owner");
    expect(session.getSnapshot().phase).toBe("error");
    expect(session.getSnapshot().threads).toHaveLength(0);
  });

  it("uses server activity total, not loaded row length, for the hub count", async () => {
    api.apiListInboxActivity.mockResolvedValue({
      items: [
        {
          id: "like_1",
          kind: "like",
          videoId: "v1",
          actorUserId: fan.id,
          actorUsername: "fan",
          actorDisplayName: "Fan",
          actorAvatarUrl: null,
          snippet: null,
          createdAt: "2026-08-21T00:00:00.000Z",
        },
      ],
      total: 12,
      error: null,
    });
    const session = createInboxSession();
    await session.load("owner");
    expect(session.getSnapshot().activityItems).toHaveLength(1);
    expect(session.getSnapshot().activityTotal).toBe(12);
  });

  it("removes a deleted thread from Main and Unread after server success", async () => {
    api.apiListChatThreads.mockResolvedValue({ threads: [thread], error: null });
    api.apiDeleteChatThread.mockResolvedValue({ ok: true });
    const session = createInboxSession();
    await session.load("owner");
    const res = await session.deleteThread(thread.id);
    expect(res.ok).toBe(true);
    expect(session.getSnapshot().threads).toHaveLength(0);
  });

  it("does not keep delete success when the server rejects", async () => {
    api.apiListChatThreads.mockResolvedValue({ threads: [thread], error: null });
    api.apiDeleteChatThread.mockResolvedValue({ ok: false, error: "forbidden" });
    const session = createInboxSession();
    await session.load("owner");
    const res = await session.deleteThread(thread.id);
    expect(res.ok).toBe(false);
    expect(session.getSnapshot().threads).toHaveLength(1);
  });

  it("blocks a second delete while the first is in flight", async () => {
    api.apiListChatThreads.mockResolvedValue({ threads: [thread, { ...thread, id: "thread-2" }], error: null });
    let release: (value: { ok: true }) => void = () => undefined;
    api.apiDeleteChatThread.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve as (value: { ok: true }) => void;
        }),
    );
    const session = createInboxSession();
    await session.load("owner");
    const first = session.deleteThread(thread.id);
    const second = await session.deleteThread("thread-2");
    expect(second.ok).toBe(false);
    release({ ok: true });
    await first;
  });

  it("opens only one inbox overlay at a time", () => {
    const session = createInboxSession();
    session.openFollowersPanel();
    session.requestActivityOverlay();
    expect(session.getSnapshot().activityOverlayRequested).toBe(true);
    expect(session.getSnapshot().showFollowersPanel).toBe(false);
    expect(session.getSnapshot().showGiftsPanel).toBe(false);
    session.openGiftsPanel();
    expect(session.getSnapshot().activityOverlayRequested).toBe(false);
    expect(session.getSnapshot().showGiftsPanel).toBe(true);
    session.clearActivityOverlayRequest();
    expect(session.getSnapshot().activityOverlayRequested).toBe(false);
  });

  it("reverts follow when the server rejects", async () => {
    api.apiFetchFollowers.mockResolvedValue({ users: [fan], error: null });
    api.apiFollowFollowerRow.mockResolvedValue({ ok: false, error: "forbidden" });
    const session = createInboxSession();
    await session.load("owner");
    const res = await session.toggleFollow(fan.id);
    expect(res.ok).toBe(false);
    expect(session.getSnapshot().followers[0]?.isFollowing).toBe(false);
  });
});
