import { useSyncExternalStore } from "react";
import type { FollowersSession, FollowersSnapshot } from "./followersSession";

const empty: FollowersSnapshot = {
  phase: "idle",
  error: null,
  errorStatus: null,
  ownerUserId: "",
  users: [],
  followBusyId: null,
};

export function useFollowersSession(session: FollowersSession): FollowersSnapshot {
  return useSyncExternalStore(session.subscribe, session.getSnapshot, () => empty);
}
