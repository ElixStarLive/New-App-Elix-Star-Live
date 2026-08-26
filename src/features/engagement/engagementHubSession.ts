import type { EngagementHub } from "@shared/contracts";
import type { EngagementHubApiFailure } from "./engagementHubApi";

export type EngagementHubViewKind = "loading" | "ready" | "error";

export type EngagementHubView =
  | { kind: "loading"; hub: null; error: null }
  | { kind: "ready"; hub: EngagementHub; error: null }
  | { kind: "error"; hub: null; error: string };

export const ENGAGEMENT_HUB_LOAD_ERROR = "Could not load Engagement Hub";

type HubDeps = {
  getAccountId: () => string | null;
  loadHub: () => Promise<{ ok: true; hub: EngagementHub } | EngagementHubApiFailure>;
  toast: (message: string) => void;
  onSessionExpired: () => void;
  onDisabled: () => void;
};

const emptyView: EngagementHubView = {
  kind: "loading",
  hub: null,
  error: null,
};

export function createEngagementHubSession(deps: HubDeps) {
  let view: EngagementHubView = { ...emptyView };
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
        view = { kind: "error", hub: null, error: ENGAGEMENT_HUB_LOAD_ERROR };
        emit();
        return;
      }
      accountId = expectedAccountId;
      // Bump so an older in-flight Hub GET cannot overwrite a newer summary.
      const gen = ++generation;
      view = { kind: "loading", hub: null, error: null };
      emit();
      const result = await deps.loadHub();
      if (gen !== generation || deps.getAccountId() !== expectedAccountId) return;
      if (!result.ok) {
        if (result.sessionExpired) deps.onSessionExpired();
        if (result.disabled) deps.onDisabled();
        view = { kind: "error", hub: null, error: result.error || ENGAGEMENT_HUB_LOAD_ERROR };
        emit();
        deps.toast(result.error || ENGAGEMENT_HUB_LOAD_ERROR);
        return;
      }
      view = { kind: "ready", hub: result.hub, error: null };
      emit();
    },
  };
}

export type EngagementHubSession = ReturnType<typeof createEngagementHubSession>;
