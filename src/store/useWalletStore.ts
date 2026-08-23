import { create } from "zustand";
import type { WalletMoneyBalances } from "@shared/contracts";
import { apiFetchWallet } from "@/features/wallet/walletApi";
import { useAuthStore } from "@/store/useAuthStore";

export type WalletSurfaceStatus = "idle" | "loading" | "ready" | "error";

type WalletState = {
  accountId: string | null;
  paidCoins: number | null;
  promoCoins: number | null;
  starterCoins: number | null;
  status: WalletSurfaceStatus;
  lastFetchedAt: number | null;
  lastError: string | null;
  fetchGeneration: number;
  fetchWallet: () => Promise<{ ok: boolean; error: string | null }>;
  applyServerBalances: (partial: Partial<WalletMoneyBalances>) => void;
  clear: () => void;
};

function emptyMoney(): Pick<WalletState, "paidCoins" | "promoCoins" | "starterCoins" | "lastFetchedAt" | "lastError"> {
  return {
    paidCoins: null,
    promoCoins: null,
    starterCoins: null,
    lastFetchedAt: null,
    lastError: null,
  };
}

export const useWalletStore = create<WalletState>((set, get) => ({
  accountId: null,
  paidCoins: null,
  promoCoins: null,
  starterCoins: null,
  status: "idle",
  lastFetchedAt: null,
  lastError: null,
  fetchGeneration: 0,

  fetchWallet: async () => {
    const accountId = useAuthStore.getState().user?.id ?? null;
    if (!accountId) {
      set({
        ...emptyMoney(),
        accountId: null,
        status: "idle",
        fetchGeneration: get().fetchGeneration + 1,
      });
      return { ok: false, error: "Sign in required" };
    }
    const generation = get().fetchGeneration + 1;
    set({
      accountId,
      status: "loading",
      lastError: null,
      fetchGeneration: generation,
    });
    const result = await apiFetchWallet();
    if (get().fetchGeneration !== generation) {
      return { ok: false, error: "stale" };
    }
    if (useAuthStore.getState().user?.id !== accountId) {
      return { ok: false, error: "stale" };
    }
    if (result.status === 401) {
      set({
        ...emptyMoney(),
        accountId: null,
        status: "error",
        lastError: result.error,
      });
      void useAuthStore.getState().checkUser();
      return { ok: false, error: result.error };
    }
    if (result.error || !result.balances) {
      set({
        status: "error",
        lastError: result.error || "Wallet fetch failed",
      });
      return { ok: false, error: result.error || "Wallet fetch failed" };
    }
    set({
      accountId,
      paidCoins: result.balances.paidCoins,
      promoCoins: result.balances.promoCoins,
      starterCoins: result.balances.starterCoins,
      status: "ready",
      lastFetchedAt: Date.now(),
      lastError: null,
    });
    return { ok: true, error: null };
  },

  applyServerBalances: (partial) => {
    const accountId = useAuthStore.getState().user?.id ?? null;
    if (!accountId) return;
    if (get().accountId && get().accountId !== accountId) return;
    set((s) => ({
      accountId,
      paidCoins:
        partial.paidCoins != null && Number.isFinite(partial.paidCoins)
          ? Math.max(0, Math.trunc(partial.paidCoins))
          : s.paidCoins,
      promoCoins:
        partial.promoCoins != null && Number.isFinite(partial.promoCoins)
          ? Math.max(0, Math.trunc(partial.promoCoins))
          : s.promoCoins,
      starterCoins:
        partial.starterCoins != null && Number.isFinite(partial.starterCoins)
          ? Math.max(0, Math.trunc(partial.starterCoins))
          : s.starterCoins,
      status: "ready",
      lastFetchedAt: Date.now(),
      lastError: null,
    }));
  },

  clear: () =>
    set({
      ...emptyMoney(),
      accountId: null,
      status: "idle",
      fetchGeneration: get().fetchGeneration + 1,
    }),
}));
