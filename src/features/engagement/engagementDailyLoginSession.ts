import type { EngagementDailyLoginState } from "@shared/contracts";
import type { EngagementDailyLoginApiFailure } from "./engagementDailyLoginApi";

export type EngagementDailyLoginView =
  | { kind: "loading"; daily: null; error: null; claiming: false }
  | { kind: "ready"; daily: EngagementDailyLoginState; error: null; claiming: boolean }
  | { kind: "error"; daily: null; error: string; claiming: false };

export const ENGAGEMENT_DAILY_LOGIN_LOAD_ERROR = "Could not load daily login";
export const ENGAGEMENT_DAILY_LOGIN_CLAIM_ERROR = "Claim failed";

type DailyLoginDeps = {
  getAccountId: () => string | null;
  loadDaily: () => Promise<{ ok: true; daily: EngagementDailyLoginState } | EngagementDailyLoginApiFailure>;
  claimDaily: () => Promise<
    { ok: true; alreadyClaimed?: boolean; daily: EngagementDailyLoginState; reward: { reward_label: string } | null } | EngagementDailyLoginApiFailure
  >;
  toast: (message: string) => void;
  onSessionExpired: () => void;
  onDisabled: () => void;
};

const emptyView: EngagementDailyLoginView = {
  kind: "loading",
  daily: null,
  error: null,
  claiming: false,
};

export function createEngagementDailyLoginSession(deps: DailyLoginDeps) {
  let view: EngagementDailyLoginView = { ...emptyView };
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

  const applyFailure = (result: EngagementDailyLoginApiFailure, fallback: string) => {
    if (result.sessionExpired) deps.onSessionExpired();
    if (result.disabled) deps.onDisabled();
    view = { kind: "error", daily: null, error: result.error || fallback, claiming: false };
    emit();
    deps.toast(result.error || fallback);
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
        view = { kind: "error", daily: null, error: ENGAGEMENT_DAILY_LOGIN_LOAD_ERROR, claiming: false };
        emit();
        return;
      }
      accountId = expectedAccountId;
      const gen = generation;
      view = { kind: "loading", daily: null, error: null, claiming: false };
      emit();
      const result = await deps.loadDaily();
      if (gen !== generation || deps.getAccountId() !== expectedAccountId) return;
      if (!result.ok) {
        applyFailure(result, ENGAGEMENT_DAILY_LOGIN_LOAD_ERROR);
        return;
      }
      view = { kind: "ready", daily: result.daily, error: null, claiming: false };
      emit();
    },
    claim: async (expectedAccountId: string | null) => {
      if (!expectedAccountId || deps.getAccountId() !== expectedAccountId) return;
      if (view.kind !== "ready" || view.claiming || !view.daily.can_claim) return;
      const gen = generation;
      view = { ...view, claiming: true };
      emit();
      const result = await deps.claimDaily();
      if (gen !== generation || deps.getAccountId() !== expectedAccountId) return;
      if (!result.ok) {
        view = { ...view, claiming: false };
        emit();
        if (result.sessionExpired) deps.onSessionExpired();
        if (result.disabled) deps.onDisabled();
        deps.toast(result.error || ENGAGEMENT_DAILY_LOGIN_CLAIM_ERROR);
        return;
      }
      deps.toast(
        result.alreadyClaimed ? "Already claimed today." : result.reward?.reward_label || "Reward claimed",
      );
      const next = await deps.loadDaily();
      if (gen !== generation || deps.getAccountId() !== expectedAccountId) return;
      if (!next.ok) {
        applyFailure(next, ENGAGEMENT_DAILY_LOGIN_LOAD_ERROR);
        return;
      }
      view = { kind: "ready", daily: next.daily, error: null, claiming: false };
      emit();
    },
  };
}

export type EngagementDailyLoginSession = ReturnType<typeof createEngagementDailyLoginSession>;
