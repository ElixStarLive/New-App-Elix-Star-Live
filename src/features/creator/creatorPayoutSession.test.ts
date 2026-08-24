import { describe, expect, it, vi } from "vitest";
import type { CreatorBalance, CreatorPayoutAccount } from "@shared/contracts";
import { CREATOR_PAYOUT_LOAD_ERROR, createCreatorPayoutSession } from "./creatorPayoutSession";

const userA = "11111111-1111-4111-8111-111111111111";
const userB = "22222222-2222-4222-8222-222222222222";

const balance = (available = 5000): CreatorBalance => ({
  pending_coins: 0,
  available_coins: 0,
  locked_coins: 0,
  total_earned: 0,
  total_withdrawn: 0,
  gbp: {
    pending_pence: 100,
    available_pence: available,
    withdrawn_pence: 0,
    reversed_pence: 0,
    held_pence: 200,
  },
  rewards: {
    qualified_views_30d: 0,
    current_reward_pence: 0,
    next_milestone_views: null,
    next_milestone_reward_pence: null,
  },
  earnings_by_source: {
    gifts_pence: 0,
    subscriptions_pence: 0,
    rewards_pence: 0,
    reversals_pence: 0,
  },
  active_subscribers: 0,
});

const account = (ready = false): CreatorPayoutAccount => ({
  ok: true,
  accountId: ready ? "acct_ready" : null,
  payouts_enabled: ready,
  charges_enabled: ready,
  verificationStatus: ready ? "verified" : "none",
  status: ready ? "ready" : "absent",
});

function snapshot(available = 5000, ready = false) {
  return {
    ok: true as const,
    balance: balance(available),
    methods: [{ id: "m1", type: "bank", is_default: true }],
    withdrawals: [] as [],
    ledger: [] as [],
    account: account(ready),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function createDeps(accountId: string | null = userA) {
  let current = accountId;
  const loadSnapshot = vi.fn();
  const saveMethod = vi.fn();
  const withdraw = vi.fn();
  const onboard = vi.fn();
  const openOnboardingUrl = vi.fn(async () => undefined);
  const toast = vi.fn();
  const onSessionExpired = vi.fn();
  const session = createCreatorPayoutSession({
    getAccountId: () => current,
    loadSnapshot,
    saveMethod,
    withdraw,
    onboard,
    openOnboardingUrl,
    toast,
    onSessionExpired,
  });
  return {
    session,
    loadSnapshot,
    withdraw,
    onboard,
    openOnboardingUrl,
    toast,
    onSessionExpired,
    setAccount: (id: string | null) => {
      current = id;
    },
  };
}

describe("PAGE-045 creator payout session", () => {
  it("starts loading and does not treat a failed load as £0", async () => {
    const deps = createDeps();
    expect(deps.session.getSnapshot().kind).toBe("loading");
    expect(deps.session.getSnapshot().balance).toBeNull();
    deps.loadSnapshot.mockResolvedValueOnce({ ok: false, error: "offline", sessionExpired: false });
    await deps.session.load(userA);
    expect(deps.session.getSnapshot()).toMatchObject({
      kind: "error",
      balance: null,
      error: "offline",
    });
  });

  it("keeps a successful zero history distinct from error", async () => {
    const deps = createDeps();
    deps.loadSnapshot.mockResolvedValueOnce(snapshot(0));
    await deps.session.load(userA);
    expect(deps.session.getSnapshot().kind).toBe("ready");
    expect(deps.session.getSnapshot().balance?.gbp.available_pence).toBe(0);
    expect(deps.session.getSnapshot().ledger).toEqual([]);
    expect(deps.session.getSnapshot().error).toBeNull();
  });

  it("drops a late User A snapshot after User B is active", async () => {
    const deps = createDeps(userA);
    const first = deferred<ReturnType<typeof snapshot>>();
    deps.loadSnapshot.mockReturnValueOnce(first.promise);
    const loadA = deps.session.load(userA);
    deps.setAccount(userB);
    deps.loadSnapshot.mockResolvedValueOnce(snapshot(0));
    const loadB = deps.session.load(userB);
    first.resolve(snapshot(9900));
    await loadA;
    await loadB;
    expect(deps.session.getSnapshot().kind).toBe("ready");
    expect(deps.session.getSnapshot().balance?.gbp.available_pence).toBe(0);
  });

  it("expires only an unauthenticated load failure", async () => {
    const deps = createDeps();
    deps.loadSnapshot.mockResolvedValueOnce({
      ok: false,
      error: "Session expired",
      sessionExpired: true,
    });
    await deps.session.load(userA);
    expect(deps.onSessionExpired).toHaveBeenCalledTimes(1);
    expect(deps.session.getSnapshot().kind).toBe("error");
    expect(deps.session.getSnapshot().error).toBe("Session expired");
  });

  it("locks duplicate withdraw taps and reuses the same idempotency key", async () => {
    const deps = createDeps();
    deps.loadSnapshot.mockResolvedValue(snapshot());
    await deps.session.load(userA);
    const hold = deferred<{ ok: true; status: string; already_exists: boolean }>();
    deps.withdraw.mockReturnValueOnce(hold.promise);
    const first = deps.session.withdraw(5000);
    const second = deps.session.withdraw(5000);
    expect(deps.session.getSnapshot().withdrawing).toBe(true);
    await second;
    hold.resolve({ ok: true, status: "pending", already_exists: false });
    await first;
    expect(deps.withdraw).toHaveBeenCalledTimes(1);
    expect(deps.withdraw.mock.calls[0]?.[0]).toMatchObject({ amount_pence: 5000 });
    expect(String(deps.withdraw.mock.calls[0]?.[0].idempotency_key).length).toBeGreaterThan(8);
    expect(deps.toast).toHaveBeenCalledWith("GBP withdrawal requested");
  });

  it("does not mark Connect ready from a return refresh", async () => {
    const deps = createDeps();
    deps.loadSnapshot.mockResolvedValueOnce(snapshot(0, false));
    await deps.session.load(userA);
    expect(deps.session.getSnapshot().connectStatus).toBe("absent");
    deps.onboard.mockResolvedValueOnce({ ok: true, onboardingUrl: "https://connect.stripe.com/setup/s/test" });
    deps.loadSnapshot.mockResolvedValueOnce(snapshot(0, false));
    await deps.session.startOnboard();
    expect(deps.openOnboardingUrl).toHaveBeenCalledWith("https://connect.stripe.com/setup/s/test");
    deps.session.finishConnectReturn();
    await Promise.resolve();
    expect(deps.session.getSnapshot().connectStatus).toBe("absent");
    expect(deps.session.getSnapshot().account?.payouts_enabled).toBe(false);
  });

  it("does not load money without an account id", async () => {
    const deps = createDeps(null);
    await deps.session.load(null);
    expect(deps.loadSnapshot).not.toHaveBeenCalled();
    expect(deps.session.getSnapshot()).toMatchObject({
      kind: "error",
      balance: null,
      error: CREATOR_PAYOUT_LOAD_ERROR,
    });
  });
});
