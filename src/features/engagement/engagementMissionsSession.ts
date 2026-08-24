import type { EngagementMission } from "@shared/contracts";
import type { EngagementMissionsApiFailure } from "./engagementMissionsApi";

export type EngagementMissionsView =
  | { kind: "loading"; missions: null; error: null; claimingId: null }
  | { kind: "ready"; missions: EngagementMission[]; error: null; claimingId: string | null }
  | { kind: "error"; missions: null; error: string; claimingId: null };

export const ENGAGEMENT_MISSIONS_LOAD_ERROR = "Could not load missions";
export const ENGAGEMENT_MISSION_CLAIM_ERROR = "Claim failed";

type MissionsDeps = {
  getAccountId: () => string | null;
  loadMissions: () => Promise<{ ok: true; missions: EngagementMission[] } | EngagementMissionsApiFailure>;
  claimMission: (
    missionId: string,
  ) => Promise<{ ok: true; alreadyClaimed?: boolean } | EngagementMissionsApiFailure>;
  toast: (message: string) => void;
  onSessionExpired: () => void;
  onDisabled: () => void;
};

const emptyView: EngagementMissionsView = {
  kind: "loading",
  missions: null,
  error: null,
  claimingId: null,
};

export function createEngagementMissionsSession(deps: MissionsDeps) {
  let view: EngagementMissionsView = { ...emptyView };
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

  const applyFailure = (result: EngagementMissionsApiFailure, fallback: string) => {
    if (result.sessionExpired) deps.onSessionExpired();
    if (result.disabled) deps.onDisabled();
    view = { kind: "error", missions: null, error: result.error || fallback, claimingId: null };
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
        view = { kind: "error", missions: null, error: ENGAGEMENT_MISSIONS_LOAD_ERROR, claimingId: null };
        emit();
        return;
      }
      accountId = expectedAccountId;
      const gen = generation;
      view = { kind: "loading", missions: null, error: null, claimingId: null };
      emit();
      const result = await deps.loadMissions();
      if (gen !== generation || deps.getAccountId() !== expectedAccountId) return;
      if (!result.ok) {
        applyFailure(result, ENGAGEMENT_MISSIONS_LOAD_ERROR);
        return;
      }
      view = { kind: "ready", missions: result.missions, error: null, claimingId: null };
      emit();
    },
    claim: async (missionId: string, expectedAccountId: string | null) => {
      if (!expectedAccountId || deps.getAccountId() !== expectedAccountId) return;
      if (view.kind !== "ready" || view.claimingId) return;
      const target = view.missions.find((row) => row.id === missionId);
      if (!target || !target.completed || target.claimed) return;
      const gen = generation;
      view = { ...view, claimingId: missionId };
      emit();
      const result = await deps.claimMission(missionId);
      if (gen !== generation || deps.getAccountId() !== expectedAccountId) return;
      if (!result.ok) {
        view = { ...view, claimingId: null };
        emit();
        if (result.sessionExpired) deps.onSessionExpired();
        if (result.disabled) deps.onDisabled();
        deps.toast(result.error || ENGAGEMENT_MISSION_CLAIM_ERROR);
        return;
      }
      deps.toast("Reward claimed");
      const next = await deps.loadMissions();
      if (gen !== generation || deps.getAccountId() !== expectedAccountId) return;
      if (!next.ok) {
        applyFailure(next, ENGAGEMENT_MISSIONS_LOAD_ERROR);
        return;
      }
      view = { kind: "ready", missions: next.missions, error: null, claimingId: null };
      emit();
    },
  };
}

export type EngagementMissionsSession = ReturnType<typeof createEngagementMissionsSession>;
