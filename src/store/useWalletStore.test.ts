import { beforeEach, describe, expect, it, vi } from "vitest";

const authState = { user: { id: "user-a" } as { id: string } | null, checkUser: vi.fn() };

vi.mock("@/store/useAuthStore", () => ({
  useAuthStore: {
    getState: () => authState,
  },
}));

const fetchMock = vi.fn();
vi.mock("@/features/wallet/walletApi", () => ({
  apiFetchWallet: () => fetchMock(),
}));

describe("useWalletStore", () => {
  beforeEach(async () => {
    authState.user = { id: "user-a" };
    fetchMock.mockReset();
    const { useWalletStore } = await import("./useWalletStore");
    useWalletStore.getState().clear();
  });

  it("does not treat an API error as an authoritative zero", async () => {
    fetchMock.mockResolvedValue({ balances: null, error: "DATABASE_UNAVAILABLE", status: 503 });
    const { useWalletStore } = await import("./useWalletStore");
    const result = await useWalletStore.getState().fetchWallet();
    expect(result.ok).toBe(false);
    expect(useWalletStore.getState().status).toBe("error");
    expect(useWalletStore.getState().paidCoins).toBeNull();
    expect(useWalletStore.getState().starterCoins).toBeNull();
    expect(useWalletStore.getState().promoCoins).toBeNull();
  });

  it("accepts a successful zero paid balance", async () => {
    fetchMock.mockResolvedValue({
      balances: { paidCoins: 0, starterCoins: 50000, promoCoins: 0 },
      error: null,
      status: 200,
    });
    const { useWalletStore } = await import("./useWalletStore");
    const result = await useWalletStore.getState().fetchWallet();
    expect(result.ok).toBe(true);
    expect(useWalletStore.getState().status).toBe("ready");
    expect(useWalletStore.getState().paidCoins).toBe(0);
    expect(useWalletStore.getState().starterCoins).toBe(50000);
    expect(useWalletStore.getState().promoCoins).toBe(0);
  });

  it("drops a stale User A response after switching to User B", async () => {
    let releaseA: (value: unknown) => void = () => undefined;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseA = resolve;
        }),
    );
    const { useWalletStore } = await import("./useWalletStore");
    const first = useWalletStore.getState().fetchWallet();
    authState.user = { id: "user-b" };
    fetchMock.mockResolvedValueOnce({
      balances: { paidCoins: 7, starterCoins: 1, promoCoins: 2 },
      error: null,
      status: 200,
    });
    const second = await useWalletStore.getState().fetchWallet();
    expect(second.ok).toBe(true);
    releaseA({
      balances: { paidCoins: 999, starterCoins: 888, promoCoins: 777 },
      error: null,
      status: 200,
    });
    await first;
    expect(useWalletStore.getState().accountId).toBe("user-b");
    expect(useWalletStore.getState().paidCoins).toBe(7);
    expect(useWalletStore.getState().starterCoins).toBe(1);
    expect(useWalletStore.getState().promoCoins).toBe(2);
  });

  it("clears money instead of leaving User A balances after logout", async () => {
    fetchMock.mockResolvedValue({
      balances: { paidCoins: 40, starterCoins: 9, promoCoins: 2 },
      error: null,
      status: 200,
    });
    const { useWalletStore } = await import("./useWalletStore");
    await useWalletStore.getState().fetchWallet();
    useWalletStore.getState().clear();
    expect(useWalletStore.getState().status).toBe("idle");
    expect(useWalletStore.getState().paidCoins).toBeNull();
    expect(useWalletStore.getState().accountId).toBeNull();
  });
});
