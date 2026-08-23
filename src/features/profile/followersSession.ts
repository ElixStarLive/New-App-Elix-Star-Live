import type { UserPublic } from "@shared/contracts/auth";
import { apiFetchFollowers, apiFollowFollowerRow, apiUnfollowFollowerRow } from "./followersApi";

export type FollowersPhase = "idle" | "loading" | "ready" | "error";

export type FollowersSnapshot = {
  phase: FollowersPhase;
  error: string | null;
  errorStatus: number | null;
  ownerUserId: string;
  users: UserPublic[];
  followBusyId: string | null;
};

type Listener = () => void;

const empty: FollowersSnapshot = {
  phase: "idle",
  error: null,
  errorStatus: null,
  ownerUserId: "",
  users: [],
  followBusyId: null,
};

export function createFollowersSession() {
  let phase: FollowersPhase = "idle";
  let error: string | null = null;
  let errorStatus: number | null = null;
  let ownerUserId = "";
  let users: UserPublic[] = [];
  let followBusyId: string | null = null;
  let loadGen = 0;
  const listeners = new Set<Listener>();
  let cached: FollowersSnapshot = { ...empty };

  const snapshot = (): FollowersSnapshot => cached;

  const notify = () => {
    cached = { phase, error, errorStatus, ownerUserId, users, followBusyId };
    for (const fn of listeners) fn();
  };

  return {
    subscribe(fn: Listener) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    getSnapshot: snapshot,
    async load(userId: string) {
      const gen = ++loadGen;
      const ownerChanged = ownerUserId !== userId;
      ownerUserId = userId;
      phase = "loading";
      error = null;
      errorStatus = null;
      followBusyId = null;
      // Drop prior owner rows immediately so A→B never flashes A while B loads / fails.
      if (ownerChanged) users = [];
      notify();
      const res = await apiFetchFollowers(userId);
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
    async toggleFollow(targetId: string, viewerId: string | undefined) {
      if (!viewerId) return { ok: false as const, error: "Log in to follow" };
      if (targetId === viewerId) return { ok: false as const, error: "busy" };
      if (followBusyId) return { ok: false as const, error: "busy" };
      const row = users.find((user) => user.id === targetId);
      if (!row) return { ok: false as const, error: "User not found" };
      const was = Boolean(row.isFollowing);
      followBusyId = targetId;
      users = users.map((user) => (user.id === targetId ? { ...user, isFollowing: !was } : user));
      notify();
      const res = was ? await apiUnfollowFollowerRow(targetId) : await apiFollowFollowerRow(targetId);
      followBusyId = null;
      if (!res.ok) {
        users = users.map((user) => (user.id === targetId ? { ...user, isFollowing: was } : user));
        notify();
        return { ok: false as const, error: res.error };
      }
      notify();
      return { ok: true as const };
    },
    dispose() {
      loadGen += 1;
      phase = "idle";
      error = null;
      errorStatus = null;
      ownerUserId = "";
      users = [];
      followBusyId = null;
      notify();
    },
  };
}

export type FollowersSession = ReturnType<typeof createFollowersSession>;
