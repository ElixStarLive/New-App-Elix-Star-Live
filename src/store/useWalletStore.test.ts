import { beforeEach, describe, expect, it, vi } from "vitest";

const { apiFetchWallet } = vi.hoisted(() => ({ apiFetchWallet: vi.fn() }));

vi.mock("@/features/wallet/walletApi", () => ({ apiFetchWallet }));

import { useWalletStore } from "./useWalletStore";

const EMPTY = { paidCoins: 0, promoCoins: 0, starterCoins: 0, testCoins: 0 };

function balances(): Record<string, number> {
  const { paidCoins, promoCoins, starterCoins, testCoins } = useWalletStore.getState();
  return { paidCoins, promoCoins, starterCoins, testCoins };
}

describe("useWalletStore", () => {
  beforeEach(() => {
    apiFetchWallet.mockReset();
    useWalletStore.getState().clear();
  });

  it("starts empty", () => {
    expect(balances()).toEqual(EMPTY);
    expect(useWalletStore.getState().lastFetchedAt).toBeNull();
    expect(useWalletStore.getState().isLoading).toBe(false);
  });

  it("stores fetched balances and stamps the fetch time", async () => {
    apiFetchWallet.mockResolvedValue({
      balances: { paidCoins: 120, promoCoins: 5, starterCoins: 1, testCoins: 0 },
      error: null,
    });
    await expect(useWalletStore.getState().fetchWallet()).resolves.toEqual({ ok: true, error: null });
    expect(balances()).toEqual({ paidCoins: 120, promoCoins: 5, starterCoins: 1, testCoins: 0 });
    expect(useWalletStore.getState().lastFetchedAt).toBeTypeOf("number");
    expect(useWalletStore.getState().isLoading).toBe(false);
    expect(useWalletStore.getState().lastError).toBeNull();
  });

  it("keeps the previous balances and records the error when the fetch fails", async () => {
    useWalletStore.getState().applyServerBalances({ paidCoins: 40 });
    apiFetchWallet.mockResolvedValue({ balances: null, error: "Network error" });
    await expect(useWalletStore.getState().fetchWallet()).resolves.toEqual({ ok: false, error: "Network error" });
    expect(balances().paidCoins).toBe(40);
    expect(useWalletStore.getState().lastError).toBe("Network error");
    expect(useWalletStore.getState().isLoading).toBe(false);
  });

  it("uses a default message when the api reports no balances and no error", async () => {
    apiFetchWallet.mockResolvedValue({ balances: null, error: null });
    await expect(useWalletStore.getState().fetchWallet()).resolves.toEqual({
      ok: false,
      error: "Wallet fetch failed",
    });
    expect(useWalletStore.getState().lastError).toBe("Wallet fetch failed");
  });

  it("merges partial server balances without clearing the others", () => {
    useWalletStore.getState().applyServerBalances({ paidCoins: 10, promoCoins: 2 });
    useWalletStore.getState().applyServerBalances({ paidCoins: 25 });
    expect(balances()).toEqual({ paidCoins: 25, promoCoins: 2, starterCoins: 0, testCoins: 0 });
  });

  it("floors test coins and never stores a negative balance", () => {
    useWalletStore.getState().setTestCoins(12.9);
    expect(balances().testCoins).toBe(12);
    useWalletStore.getState().setTestCoins(-5);
    expect(balances().testCoins).toBe(0);
  });

  it("clears every balance and the error state on sign out", async () => {
    apiFetchWallet.mockResolvedValue({ balances: null, error: "boom" });
    await useWalletStore.getState().fetchWallet();
    useWalletStore.getState().applyServerBalances({ paidCoins: 9 });
    useWalletStore.getState().clear();
    expect(balances()).toEqual(EMPTY);
    expect(useWalletStore.getState().lastError).toBeNull();
    expect(useWalletStore.getState().lastFetchedAt).toBeNull();
  });
});
