import type { EngagementAchievement } from "@shared/contracts";
import type { EngagementAchievementsApiFailure } from "./engagementAchievementsApi";

export type EngagementAchievementsView =
  | { kind: "loading"; achievements: null; error: null }
  | { kind: "ready"; achievements: EngagementAchievement[]; error: null }
  | { kind: "error"; achievements: null; error: string };

export const ENGAGEMENT_ACHIEVEMENTS_LOAD_ERROR = "Could not load achievements";

type AchievementsDeps = {
  getAccountId: () => string | null;
  loadAchievements: () => Promise<
    { ok: true; achievements: EngagementAchievement[] } | EngagementAchievementsApiFailure
  >;
  toast: (message: string) => void;
  onSessionExpired: () => void;
  onDisabled: () => void;
};

const emptyView: EngagementAchievementsView = {
  kind: "loading",
  achievements: null,
  error: null,
};

export function createEngagementAchievementsSession(deps: AchievementsDeps) {
  let view: EngagementAchievementsView = { ...emptyView };
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
        view = { kind: "error", achievements: null, error: ENGAGEMENT_ACHIEVEMENTS_LOAD_ERROR };
        emit();
        return;
      }
      accountId = expectedAccountId;
      const gen = ++generation;
      view = { kind: "loading", achievements: null, error: null };
      emit();
      const result = await deps.loadAchievements();
      if (gen !== generation || deps.getAccountId() !== expectedAccountId) return;
      if (!result.ok) {
        if (result.sessionExpired) deps.onSessionExpired();
        if (result.disabled) deps.onDisabled();
        view = {
          kind: "error",
          achievements: null,
          error: result.error || ENGAGEMENT_ACHIEVEMENTS_LOAD_ERROR,
        };
        emit();
        deps.toast(result.error || ENGAGEMENT_ACHIEVEMENTS_LOAD_ERROR);
        return;
      }
      view = { kind: "ready", achievements: result.achievements, error: null };
      emit();
    },
  };
}

export type EngagementAchievementsSession = ReturnType<typeof createEngagementAchievementsSession>;
