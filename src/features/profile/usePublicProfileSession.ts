import { useSyncExternalStore } from "react";
import type { PublicProfileSession, PublicProfileSnapshot } from "./publicProfileSession";

const empty: PublicProfileSnapshot = {
  phase: "idle",
  error: null,
  errorStatus: null,
  profile: null,
  stories: [],
  tab: "videos",
  items: [],
  shopItems: [],
  nextCursor: null,
  tabLoading: false,
  tabLoadingMore: false,
  tabError: null,
  followBusy: false,
  blockBusy: false,
  shareOpen: false,
};

export function usePublicProfileSession(session: PublicProfileSession): PublicProfileSnapshot {
  return useSyncExternalStore(session.subscribe, session.getSnapshot, () => empty);
}
