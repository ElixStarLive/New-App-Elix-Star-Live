import type { UserPublic } from "@shared/contracts";
import { apiFetchFollowing, apiFollowFollowingRow, apiUnfollowFollowingRow } from "./followingApi";

export type FollowingPhase = "idle" | "loading" | "ready" | "error";

export type FollowingSnapshot = {
  phase: FollowingPhase;
  error: string | null;
  errorStatus: number | null;
  ownerUserId: string;
  users: UserPublic[];
  followBusyId: string | null;
};

type Listener = () => void;

const empty: FollowingSnapshot = {
  phase: "idle",
  error: null,
  errorStatus: null,
  ownerUserId: "",
  users: [],
  followBusyId: null,
};

export function createFollowingSession() {
  let phase: FollowingPhase = "idle";
  let error: string | null = null;
  let errorStatus: number | null = null;
  let ownerUserId = "";
  let viewerId: string | null = null;
  let users: UserPublic[] = [];
  let followBusyId: string | null = null;
  let loadGen = 0;
  const listeners = new Set<Listener>();
  let cached: FollowingSnapshot = { ...empty };

  const snapshot = (): FollowingSnapshot => cached;

  const notify = () => {
    cached = { phase, error, errorStatus, ownerUserId, users, followBusyId };
    for (const fn of listeners) fn();
  };

  const isOwnList = () => Boolean(viewerId && ownerUserId && viewerId === ownerUserId);

  return {
    subscribe(fn: Listener) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    getSnapshot: snapshot,
    async load(userId: string, nextViewerId?: string | null) {
      const gen = ++loadGen;
      const ownerChanged = ownerUserId !== userId;
      ownerUserId = userId;
      if (nextViewerId !== undefined) viewerId = nextViewerId;
      phase = "loading";
      error = null;
      errorStatus = null;
      followBusyId = null;
      // Drop prior owner rows immediately so A→B never flashes A while B loads / fails.
      if (ownerChanged) users = [];
      notify();
      const res = await apiFetchFollowing(userId);
      if (gen !== loadGen) return;
      if (res.error) {
        // Same-owner soft fail keeps prior rows (toast at page); empty list is hard error.
        phase = users.length > 0 ? "ready" : "error";
        error = res.error;
        errorStatus = res.status ?? null;
        notify();
        return;
      }
      users = res.users;
      phase = "ready";
      error = null;
      errorStatus = null;
      notify();
    },
    async toggleFollow(targetId: string, nextViewerId: string | undefined) {
      if (!nextViewerId) return { ok: false as const, error: "Log in to follow" };
      viewerId = nextViewerId;
      if (targetId === nextViewerId) return { ok: false as const, error: "busy" };
      if (followBusyId) return { ok: false as const, error: "busy" };
      const row = users.find((user) => user.id === targetId);
      if (!row) return { ok: false as const, error: "User not found" };
      const was = Boolean(row.isFollowing);
      followBusyId = targetId;
      users = users.map((user) => (user.id === targetId ? { ...user, isFollowing: !was } : user));
      notify();
      const res = was ? await apiUnfollowFollowingRow(targetId) : await apiFollowFollowingRow(targetId);
      followBusyId = null;
      if (!res.ok) {
        users = users.map((user) => (user.id === targetId ? { ...user, isFollowing: was } : user));
        notify();
        return { ok: false as const, error: res.error };
      }
      // Own Following membership is owner→row. Unfollow removes the Neon edge → drop the row.
      // Public Following: only viewer→row changes; owner→row remains so the row stays.
      if (isOwnList() && was) {
        users = users.filter((user) => user.id !== targetId);
      }
      notify();
      return { ok: true as const };
    },
    applyFollowEvent(ev: { targetId: string; following: boolean }) {
      if (!ownerUserId) return;
      if (isOwnList()) {
        if (!ev.following && users.some((user) => user.id === ev.targetId)) {
          users = users.filter((user) => user.id !== ev.targetId);
          notify();
          return;
        }
        if (ev.following) {
          void this.load(ownerUserId, viewerId);
        }
        return;
      }
      const row = users.find((user) => user.id === ev.targetId);
      if (!row || Boolean(row.isFollowing) === ev.following) return;
      users = users.map((user) => (user.id === ev.targetId ? { ...user, isFollowing: ev.following } : user));
      notify();
    },
    dispose() {
      loadGen += 1;
      phase = "idle";
      error = null;
      errorStatus = null;
      ownerUserId = "";
      viewerId = null;
      users = [];
      followBusyId = null;
      notify();
    },
  };
}

export type FollowingSession = ReturnType<typeof createFollowingSession>;
