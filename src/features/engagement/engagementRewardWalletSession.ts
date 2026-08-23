import type { EngagementRewardWallet } from "@shared/contracts";
import type { EngagementRewardWalletApiFailure } from "./engagementRewardWalletApi";

export type EngagementRewardWalletView =
  | { kind: "loading"; wallet: null; error: null }
  | { kind: "ready"; wallet: EngagementRewardWallet; error: null }
  | { kind: "error"; wallet: null; error: string };

export const ENGAGEMENT_REWARD_WALLET_LOAD_ERROR = "Could not load reward wallet";

type RewardWalletDeps = {
  getAccountId: () => string | null;
  loadWallet: () => Promise<{ ok: true; wallet: EngagementRewardWallet } | EngagementRewardWalletApiFailure>;
  toast: (message: string) => void;
  onSessionExpired: () => void;
  onDisabled: () => void;
};

const emptyView: EngagementRewardWalletView = {
  kind: "loading",
  wallet: null,
  error: null,
};

export function createEngagementRewardWalletSession(deps: RewardWalletDeps) {
  let view: EngagementRewardWalletView = { ...emptyView };
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
        view = { kind: "error", wallet: null, error: ENGAGEMENT_REWARD_WALLET_LOAD_ERROR };
        emit();
        return;
      }
      accountId = expectedAccountId;
      const gen = ++generation;
      view = { kind: "loading", wallet: null, error: null };
      emit();
      const result = await deps.loadWallet();
      if (gen !== generation || deps.getAccountId() !== expectedAccountId) return;
      if (!result.ok) {
        if (result.sessionExpired) deps.onSessionExpired();
        if (result.disabled) deps.onDisabled();
        view = {
          kind: "error",
          wallet: null,
          error: result.error || ENGAGEMENT_REWARD_WALLET_LOAD_ERROR,
        };
        emit();
        deps.toast(result.error || ENGAGEMENT_REWARD_WALLET_LOAD_ERROR);
        return;
      }
      view = { kind: "ready", wallet: result.wallet, error: null };
      emit();
    },
  };
}

export type EngagementRewardWalletSession = ReturnType<typeof createEngagementRewardWalletSession>;
