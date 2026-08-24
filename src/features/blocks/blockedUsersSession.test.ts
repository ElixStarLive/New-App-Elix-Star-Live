import { describe, expect, it, vi } from "vitest";
import { BLOCKED_LIST_ERROR, createBlockedUsersSession } from "./blockedUsersSession";

const userA = "11111111-1111-4111-8111-111111111111";
const userB = "22222222-2222-4222-8222-222222222222";
const target = {
  blocked_user_id: "33333333-3333-4333-8333-333333333333",
  username: "maya",
  display_name: "Maya",
  created_at: "2026-08-21T00:00:00.000Z",
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function createDeps(accountId: string | null = userA) {
  let current = accountId;
  const listBlockedUsers = vi.fn();
  const unblockUser = vi.fn();
  const toast = vi.fn();
  const onSessionExpired = vi.fn();
  const session = createBlockedUsersSession({
    getAccountId: () => current,
    listBlockedUsers,
    unblockUser,
    toast,
    onSessionExpired,
  });
  return {
    session,
    listBlockedUsers,
    unblockUser,
    toast,
    onSessionExpired,
    setAccount: (id: string | null) => {
      current = id;
    },
  };
}

describe("PAGE-044 blocked-users session", () => {
  it("starts loading and does not treat a failed list as empty", async () => {
    const deps = createDeps();
    expect(deps.session.getSnapshot().kind).toBe("loading");
    expect(deps.session.getSnapshot().users).toEqual([]);
    deps.listBlockedUsers.mockResolvedValueOnce({ ok: false, error: "offline", sessionExpired: false });
    await deps.session.load(userA);
    expect(deps.session.getSnapshot()).toMatchObject({
      kind: "error",
      users: [],
      error: "offline",
    });
    expect(deps.session.getSnapshot().kind).not.toBe("ready");
  });

  it("keeps a successful empty list distinct from error", async () => {
    const deps = createDeps();
    deps.listBlockedUsers.mockResolvedValueOnce({ ok: true, rows: [] });
    await deps.session.load(userA);
    expect(deps.session.getSnapshot()).toMatchObject({ kind: "ready", users: [], error: null });
  });

  it("drops a late User A list after User B is active", async () => {
    const deps = createDeps(userA);
    const first = deferred<{ ok: true; rows: typeof target[] }>();
    deps.listBlockedUsers.mockReturnValueOnce(first.promise);
    const loadA = deps.session.load(userA);
    deps.setAccount(userB);
    deps.listBlockedUsers.mockResolvedValueOnce({ ok: true, rows: [] });
    const loadB = deps.session.load(userB);
    first.resolve({ ok: true, rows: [target] });
    await loadA;
    await loadB;
    expect(deps.session.getSnapshot()).toMatchObject({ kind: "ready", users: [] });
  });

  it("expires only an unauthenticated list failure", async () => {
    const deps = createDeps();
    deps.listBlockedUsers.mockResolvedValueOnce({
      ok: false,
      error: "Session expired",
      sessionExpired: true,
    });
    await deps.session.load(userA);
    expect(deps.onSessionExpired).toHaveBeenCalledTimes(1);
    expect(deps.session.getSnapshot().kind).toBe("error");
    expect(deps.session.getSnapshot().error).toBe("Session expired");
  });

  it("removes a row only after authoritative unblock success", async () => {
    const deps = createDeps();
    deps.listBlockedUsers.mockResolvedValueOnce({ ok: true, rows: [target] });
    await deps.session.load(userA);
    const hold = deferred<{ ok: true } | { ok: false; error: string; sessionExpired: boolean }>();
    deps.unblockUser.mockReturnValueOnce(hold.promise);
    const first = deps.session.unblock(target.blocked_user_id);
    const second = deps.session.unblock(target.blocked_user_id);
    expect(deps.session.getSnapshot().pendingIds).toEqual([target.blocked_user_id]);
    expect(deps.session.getSnapshot().users).toHaveLength(1);
    await second;
    hold.resolve({ ok: true });
    await first;
    expect(deps.unblockUser).toHaveBeenCalledTimes(1);
    expect(deps.session.getSnapshot().users).toEqual([]);
    expect(deps.session.getSnapshot().kind).toBe("ready");
  });

  it("keeps the row when unblock fails", async () => {
    const deps = createDeps();
    deps.listBlockedUsers.mockResolvedValueOnce({ ok: true, rows: [target] });
    await deps.session.load(userA);
    deps.unblockUser.mockResolvedValueOnce({ ok: false, error: "Failed to unblock user", sessionExpired: false });
    await deps.session.unblock(target.blocked_user_id);
    expect(deps.session.getSnapshot().users).toEqual([target]);
    expect(deps.toast).toHaveBeenCalledWith("Failed to unblock user");
  });

  it("does not load a list without an account id", async () => {
    const deps = createDeps(null);
    await deps.session.load(null);
    expect(deps.listBlockedUsers).not.toHaveBeenCalled();
    expect(deps.session.getSnapshot()).toMatchObject({
      kind: "error",
      users: [],
      error: BLOCKED_LIST_ERROR,
    });
  });
});
