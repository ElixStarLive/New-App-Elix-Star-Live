import { create } from "zustand";
import type { WalletBalance } from "@shared/contracts";
import { apiFetchWallet } from "@/features/wallet/walletApi";

type WalletState = {
  paidCoins: number;
  promoCoins: number;
  starterCoins: number;
  testCoins: number;
  lastFetchedAt: number | null;
  isLoading: boolean;
  lastError: string | null;
  fetchWallet: () => Promise<{ ok: boolean; error: string | null }>;
  applyServerBalances: (partial: Partial<WalletBalance>) => void;
  setTestCoins: (amount: number) => void;
  clear: () => void;
};

function applyBalances(current: WalletState, partial: Partial<WalletBalance>): Pick<
  WalletState,
  "paidCoins" | "promoCoins" | "starterCoins" | "testCoins" | "lastFetchedAt"
> {
  return {
    paidCoins: partial.paidCoins ?? current.paidCoins,
    promoCoins: partial.promoCoins ?? current.promoCoins,
    starterCoins: partial.starterCoins ?? current.starterCoins,
    testCoins: partial.testCoins ?? current.testCoins,
    lastFetchedAt: Date.now(),
  };
}

export const useWalletStore = create<WalletState>((set, get) => ({
  paidCoins: 0,
  promoCoins: 0,
  starterCoins: 0,
  testCoins: 0,
  lastFetchedAt: null,
  isLoading: false,
  lastError: null,

  fetchWallet: async () => {
    set({ isLoading: true, lastError: null });
    const { balances, error } = await apiFetchWallet();
    if (error || !balances) {
      set({ isLoading: false, lastError: error || "Wallet fetch failed" });
      return { ok: false, error: error || "Wallet fetch failed" };
    }
    set({
      ...applyBalances(get(), balances),
      isLoading: false,
      lastError: null,
    });
    return { ok: true, error: null };
  },

  applyServerBalances: (partial) => {
    set((s) => applyBalances(s, partial));
  },

  setTestCoins: (amount) => {
    set({ testCoins: Math.max(0, Math.floor(amount)) });
  },

  clear: () =>
    set({
      paidCoins: 0,
      promoCoins: 0,
      starterCoins: 0,
      testCoins: 0,
      lastFetchedAt: null,
      isLoading: false,
      lastError: null,
    }),
}));
