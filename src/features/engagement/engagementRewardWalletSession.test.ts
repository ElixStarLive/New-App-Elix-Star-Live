import { describe, expect, it, vi } from "vitest";
import type { EngagementRewardWallet } from "@shared/contracts";
import {
  ENGAGEMENT_REWARD_WALLET_LOAD_ERROR,
  createEngagementRewardWalletSession,
} from "./engagementRewardWalletSession";

const userA = "11111111-1111-4111-8111-111111111111";
const userB = "22222222-2222-4222-8222-222222222222";

const wallet = (patch: Partial<EngagementRewardWallet> = {}): EngagementRewardWallet => ({
  purchasedCoins: 4,
  starterCoins: 50000,
  promotionalCoins: 12,
  totalGiftSpendable: 50016,
  battleEnergy: 3,
  totalXp: 50,
  fanLevel: 0,
  fanTier: "Bronze Fan",
  ...patch,
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function createDeps(accountId: string | null = userA) {
  let current = accountId;
  const loadWallet = vi.fn();
  const toast = vi.fn();
  const onSessionExpired = vi.fn();
  const onDisabled = vi.fn();
  const session = createEngagementRewardWalletSession({
    getAccountId: () => current,
    loadWallet,
    toast,
    onSessionExpired,
    onDisabled,
  });
  session.bindAccount(accountId);
  return {
    session,
    loadWallet,
    toast,
    onSessionExpired,
    onDisabled,
    setAccount: (id: string | null) => {
      current = id;
    },
  };
}

describe("PAGE-052 reward wallet session", () => {
  it("starts loading and does not treat a failed load as zeros", async () => {
    const deps = createDeps();
    expect(deps.session.getSnapshot()).toMatchObject({ kind: "loading", wallet: null });
    deps.loadWallet.mockResolvedValueOnce({
      ok: false,
      error: ENGAGEMENT_REWARD_WALLET_LOAD_ERROR,
      sessionExpired: false,
      disabled: false,
    });
    await deps.session.load(userA);
    expect(deps.session.getSnapshot()).toMatchObject({
      kind: "error",
      wallet: null,
      error: ENGAGEMENT_REWARD_WALLET_LOAD_ERROR,
    });
    expect(deps.toast).toHaveBeenCalledWith(ENGAGEMENT_REWARD_WALLET_LOAD_ERROR);
  });

  it("keeps a successful zero wallet distinct from error", async () => {
    const deps = createDeps();
    deps.loadWallet.mockResolvedValueOnce({
      ok: true,
      wallet: wallet({
        purchasedCoins: 0,
        starterCoins: 0,
        promotionalCoins: 0,
        totalGiftSpendable: 0,
        battleEnergy: 0,
        totalXp: 0,
      }),
    });
    await deps.session.load(userA);
    expect(deps.session.getSnapshot()).toMatchObject({
      kind: "ready",
      wallet: { purchasedCoins: 0, starterCoins: 0, promotionalCoins: 0, battleEnergy: 0, totalXp: 0 },
      error: null,
    });
  });

  it("drops a late User A wallet after User B is active", async () => {
    const deps = createDeps(userA);
    const first = deferred<{ ok: true; wallet: EngagementRewardWallet }>();
    deps.loadWallet.mockReturnValueOnce(first.promise);
    const loadA = deps.session.load(userA);
    deps.setAccount(userB);
    deps.session.bindAccount(userB);
    deps.loadWallet.mockResolvedValueOnce({
      ok: true,
      wallet: wallet({ purchasedCoins: 1, promotionalCoins: 0, totalGiftSpendable: 50001 }),
    });
    const loadB = deps.session.load(userB);
    first.resolve({ ok: true, wallet: wallet({ purchasedCoins: 999, promotionalCoins: 80 }) });
    await loadA;
    await loadB;
    expect(deps.session.getSnapshot().kind).toBe("ready");
    expect(deps.session.getSnapshot().wallet).toMatchObject({
      purchasedCoins: 1,
      promotionalCoins: 0,
    });
  });

  it("does not let a stale wallet GET overwrite a newer same-account settlement", async () => {
    const deps = createDeps();
    deps.loadWallet.mockResolvedValueOnce({
      ok: true,
      wallet: wallet({ battleEnergy: 10, totalXp: 10, promotionalCoins: 10 }),
    });
    await deps.session.load(userA);
    const stale = deferred<{ ok: true; wallet: EngagementRewardWallet }>();
    deps.loadWallet.mockReturnValueOnce(stale.promise);
    const pending = deps.session.load(userA);
    deps.loadWallet.mockResolvedValueOnce({
      ok: true,
      wallet: wallet({ battleEnergy: 20, totalXp: 20, promotionalCoins: 20, totalGiftSpendable: 50024 }),
    });
    await deps.session.load(userA);
    expect(deps.session.getSnapshot().wallet).toMatchObject({
      battleEnergy: 20,
      totalXp: 20,
      promotionalCoins: 20,
    });
    stale.resolve({
      ok: true,
      wallet: wallet({ battleEnergy: 10, totalXp: 10, promotionalCoins: 10 }),
    });
    await pending;
    expect(deps.session.getSnapshot().wallet).toMatchObject({
      battleEnergy: 20,
      totalXp: 20,
      promotionalCoins: 20,
    });
  });
});
