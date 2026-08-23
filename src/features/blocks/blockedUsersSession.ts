import type { BlockedUserRow, BlockedUsersApiFailure } from "./blockedUsersApi";

export type BlockedAccountsKind = "loading" | "ready" | "error";

export type BlockedAccountsView = {
  kind: BlockedAccountsKind;
  users: BlockedUserRow[];
  error: string | null;
  pendingIds: string[];
};

export const BLOCKED_LIST_ERROR = "Failed to load blocked users";
export const BLOCKED_UNBLOCK_ERROR = "Failed to unblock user";

type BlockedUsersDeps = {
  getAccountId: () => string | null;
  listBlockedUsers: () => Promise<{ ok: true; rows: BlockedUserRow[] } | BlockedUsersApiFailure>;
  unblockUser: (blockedUserId: string) => Promise<{ ok: true } | BlockedUsersApiFailure>;
  toast: (message: string) => void;
  onSessionExpired: () => void;
};

const emptyView: BlockedAccountsView = {
  kind: "loading",
  users: [],
  error: null,
  pendingIds: [],
};

export function createBlockedUsersSession(deps: BlockedUsersDeps) {
  let view: BlockedAccountsView = { ...emptyView };
  let generation = 0;
  let accountId: string | null = null;
  const pending = new Set<string>();
  const listeners = new Set<() => void>();

  const emit = () => {
    for (const listener of listeners) listener();
  };

  const snapshotPending = () => [...pending];

  const assign = (next: Partial<BlockedAccountsView>) => {
    view = { ...view, ...next, pendingIds: snapshotPending() };
    emit();
  };

  const expireIfNeeded = (sessionExpired: boolean) => {
    if (sessionExpired) deps.onSessionExpired();
  };

  const load = async (nextAccountId: string | null) => {
    if (nextAccountId !== accountId) {
      accountId = nextAccountId;
      pending.clear();
      view = { ...emptyView };
      emit();
    } else if (view.kind !== "ready") {
      assign({ kind: "loading", users: [], error: null });
    }
    const gen = ++generation;
    if (!nextAccountId) {
      if (gen !== generation) return;
      assign({ kind: "error", users: [], error: BLOCKED_LIST_ERROR });
      return;
    }
    const result = await deps.listBlockedUsers();
    if (gen !== generation || deps.getAccountId() !== nextAccountId) return;
    if (result.ok) {
      assign({ kind: "ready", users: result.rows, error: null });
      return;
    }
    expireIfNeeded(result.sessionExpired);
    assign({ kind: "error", users: [], error: result.error || BLOCKED_LIST_ERROR });
  };

  const unblock = async (blockedUserId: string) => {
    if (!blockedUserId || pending.has(blockedUserId) || view.kind !== "ready") return;
    const expectedAccountId = accountId;
    const gen = generation;
    pending.add(blockedUserId);
    assign({});
    const result = await deps.unblockUser(blockedUserId);
    pending.delete(blockedUserId);
    if (gen !== generation || deps.getAccountId() !== expectedAccountId) return;
    if (!result.ok) {
      expireIfNeeded(result.sessionExpired);
      deps.toast(result.error || BLOCKED_UNBLOCK_ERROR);
      assign({});
      return;
    }
    assign({
      kind: "ready",
      users: view.users.filter((row) => row.blocked_user_id !== blockedUserId),
      error: null,
    });
  };

  return {
    getSnapshot: () => view,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    load,
    unblock,
  };
}

export type BlockedUsersSession = ReturnType<typeof createBlockedUsersSession>;
