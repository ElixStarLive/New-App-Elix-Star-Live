import { useSyncExternalStore } from "react";
import type { OwnProfileSession, OwnProfileSnapshot } from "./ownProfileSession";

const empty: OwnProfileSnapshot = {
  phase: "idle",
  error: null,
  profile: null,
  hasStory: false,
  tab: "videos",
  items: [],
  shopItems: [],
  nextCursor: null,
  tabLoading: false,
  tabLoadingMore: false,
  tabError: null,
  uploadingAvatar: false,
  shareOpen: false,
};

export function useOwnProfileSession(session: OwnProfileSession): OwnProfileSnapshot {
  return useSyncExternalStore(session.subscribe, session.getSnapshot, () => empty);
}
