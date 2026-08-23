import { useSyncExternalStore } from "react";
import type { FollowingSession, FollowingSnapshot } from "./followingSession";

const empty: FollowingSnapshot = {
  phase: "idle",
  error: null,
  errorStatus: null,
  ownerUserId: "",
  users: [],
  followBusyId: null,
};

export function useFollowingSession(session: FollowingSession): FollowingSnapshot {
  return useSyncExternalStore(session.subscribe, session.getSnapshot, () => empty);
}
