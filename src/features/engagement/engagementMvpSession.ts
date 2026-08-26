import type { EngagementMvpPeriod, EngagementMvpResponse } from "@shared/contracts";
import type { EngagementMvpApiFailure } from "./engagementMvpApi";

export type EngagementMvpView =
  | { kind: "loading"; period: EngagementMvpPeriod; board: null; error: null }
  | { kind: "ready"; period: EngagementMvpPeriod; board: EngagementMvpResponse; error: null }
  | { kind: "error"; period: EngagementMvpPeriod; board: null; error: string };

export const ENGAGEMENT_MVP_LOAD_ERROR = "Could not load MVP board";

type MvpDeps = {
  getAccountId: () => string | null;
  loadMvp: (
    period: EngagementMvpPeriod,
  ) => Promise<{ ok: true; board: EngagementMvpResponse } | EngagementMvpApiFailure>;
  toast: (message: string) => void;
  onSessionExpired: () => void;
  onDisabled: () => void;
};

const emptyView = (period: EngagementMvpPeriod): EngagementMvpView => ({
  kind: "loading",
  period,
  board: null,
  error: null,
});

export function createEngagementMvpSession(deps: MvpDeps) {
  let view: EngagementMvpView = emptyView("today");
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
    view = emptyView(view.period);
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
    load: async (expectedAccountId: string | null, period: EngagementMvpPeriod) => {
      if (!expectedAccountId || deps.getAccountId() !== expectedAccountId) {
        view = { kind: "error", period, board: null, error: ENGAGEMENT_MVP_LOAD_ERROR };
        emit();
        return;
      }
      accountId = expectedAccountId;
      // Bump so an older in-flight MVP GET cannot overwrite a newer period/account board.
      const gen = ++generation;
      view = { kind: "loading", period, board: null, error: null };
      emit();
      const result = await deps.loadMvp(period);
      if (gen !== generation || deps.getAccountId() !== expectedAccountId) return;
      if (!result.ok) {
        if (result.sessionExpired) deps.onSessionExpired();
        if (result.disabled) deps.onDisabled();
        view = { kind: "error", period, board: null, error: result.error || ENGAGEMENT_MVP_LOAD_ERROR };
        emit();
        deps.toast(result.error || ENGAGEMENT_MVP_LOAD_ERROR);
        return;
      }
      view = { kind: "ready", period: result.board.period, board: result.board, error: null };
      emit();
    },
  };
}

export type EngagementMvpSession = ReturnType<typeof createEngagementMvpSession>;
