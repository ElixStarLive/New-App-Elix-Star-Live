import { create } from "zustand";
import { apiFetchTestCoinsBalance } from "@/features/wallet/testCoinsApi";
import type { WalletSurfaceStatus } from "@/store/useWalletStore";
import { useAuthStore } from "@/store/useAuthStore";

type TestCoinsState = {
  accountId: string | null;
  testCoins: number | null;
  status: WalletSurfaceStatus;
  lastFetchedAt: number | null;
  lastError: string | null;
  fetchGeneration: number;
  fetchTestCoins: () => Promise<{ ok: boolean; error: string | null }>;
  applyServerBalance: (balance: number) => void;
  clear: () => void;
};

export const useTestCoinsStore = create<TestCoinsState>((set, get) => ({
  accountId: null,
  testCoins: null,
  status: "idle",
  lastFetchedAt: null,
  lastError: null,
  fetchGeneration: 0,

  fetchTestCoins: async () => {
    const accountId = useAuthStore.getState().user?.id ?? null;
    if (!accountId) {
      set({
        accountId: null,
        testCoins: null,
        status: "idle",
        lastFetchedAt: null,
        lastError: null,
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
    const result = await apiFetchTestCoinsBalance();
    if (get().fetchGeneration !== generation) {
      return { ok: false, error: "stale" };
    }
    if (useAuthStore.getState().user?.id !== accountId) {
      return { ok: false, error: "stale" };
    }
    if (result.status === 401) {
      set({
        accountId: null,
        testCoins: null,
        status: "error",
        lastFetchedAt: null,
        lastError: result.error,
      });
      void useAuthStore.getState().checkUser();
      return { ok: false, error: result.error };
    }
    if (result.error || result.balance == null) {
      set({
        status: "error",
        lastError: result.error || "Test coin fetch failed",
      });
      return { ok: false, error: result.error || "Test coin fetch failed" };
    }
    set({
      accountId,
      testCoins: result.balance,
      status: "ready",
      lastFetchedAt: Date.now(),
      lastError: null,
    });
    return { ok: true, error: null };
  },

  applyServerBalance: (balance) => {
    const accountId = useAuthStore.getState().user?.id ?? null;
    if (!accountId) return;
    if (get().accountId && get().accountId !== accountId) return;
    if (!Number.isFinite(balance)) return;
    set({
      accountId,
      testCoins: Math.max(0, Math.trunc(balance)),
      status: "ready",
      lastFetchedAt: Date.now(),
      lastError: null,
    });
  },

  clear: () =>
    set({
      accountId: null,
      testCoins: null,
      status: "idle",
      lastFetchedAt: null,
      lastError: null,
      fetchGeneration: get().fetchGeneration + 1,
    }),
}));
