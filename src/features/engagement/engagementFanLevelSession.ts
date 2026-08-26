import type { EngagementFanLevel } from "@shared/contracts";
import type { EngagementFanLevelApiFailure } from "./engagementFanLevelApi";

export type EngagementFanLevelView =
  | { kind: "loading"; fanLevel: null; error: null }
  | { kind: "ready"; fanLevel: EngagementFanLevel; error: null }
  | { kind: "error"; fanLevel: null; error: string };

export const ENGAGEMENT_FAN_LEVEL_LOAD_ERROR = "Could not load fan level";

type FanLevelDeps = {
  getAccountId: () => string | null;
  loadFanLevel: () => Promise<{ ok: true; fanLevel: EngagementFanLevel } | EngagementFanLevelApiFailure>;
  toast: (message: string) => void;
  onSessionExpired: () => void;
  onDisabled: () => void;
};

const emptyView: EngagementFanLevelView = {
  kind: "loading",
  fanLevel: null,
  error: null,
};

export function createEngagementFanLevelSession(deps: FanLevelDeps) {
  let view: EngagementFanLevelView = { ...emptyView };
  let generation = 0;
  let accountId: string | null = null;
  const listeners = new Set<() => void>();

  const emit = () => {
    for (const listener of listeners) listener();
  };

  const resetForAccount = (nextAccountId: string | null) => {
    if (nextAccountId === accountId) return;
    accountId = nextAccountId;
    generation += 1;
    view = { ...emptyView };
    emit();
  };

  return {
    getSnapshot: () => view,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    bindAccount: (nextAccountId: string | null) => {
      resetForAccount(nextAccountId);
    },
    load: async (expectedAccountId: string | null) => {
      if (!expectedAccountId || deps.getAccountId() !== expectedAccountId) {
        view = { kind: "error", fanLevel: null, error: ENGAGEMENT_FAN_LEVEL_LOAD_ERROR };
        emit();
        return;
      }
      accountId = expectedAccountId;
      // Bump so an older in-flight fan-level GET cannot overwrite newer XP/level.
      const gen = ++generation;
      view = { kind: "loading", fanLevel: null, error: null };
      emit();
      const result = await deps.loadFanLevel();
      if (gen !== generation || deps.getAccountId() !== expectedAccountId) return;
      if (!result.ok) {
        if (result.sessionExpired) deps.onSessionExpired();
        if (result.disabled) deps.onDisabled();
        view = { kind: "error", fanLevel: null, error: result.error || ENGAGEMENT_FAN_LEVEL_LOAD_ERROR };
        emit();
        deps.toast(result.error || ENGAGEMENT_FAN_LEVEL_LOAD_ERROR);
        return;
      }
      view = { kind: "ready", fanLevel: result.fanLevel, error: null };
      emit();
    },
  };
}

export type EngagementFanLevelSession = ReturnType<typeof createEngagementFanLevelSession>;
