import { describe, expect, it, vi } from "vitest";
import type { EngagementHub } from "@shared/contracts";
import { ENGAGEMENT_HUB_LOAD_ERROR, createEngagementHubSession } from "./engagementHubSession";

const userA = "11111111-1111-4111-8111-111111111111";
const userB = "22222222-2222-4222-8222-222222222222";

const hub = (patch: Partial<EngagementHub> = {}): EngagementHub => ({
  promotional_balance: 0,
  battle_energy: 0,
  total_xp: 0,
  fan_level: 0,
  fan_tier: "Bronze Fan",
  missions_open: 0,
  daily_login: { can_claim: false, streak_day: 1, claimed_today: false },
  starter_coin_balance: 0,
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
  const loadHub = vi.fn();
  const toast = vi.fn();
  const onSessionExpired = vi.fn();
  const onDisabled = vi.fn();
  const session = createEngagementHubSession({
    getAccountId: () => current,
    loadHub,
    toast,
    onSessionExpired,
    onDisabled,
  });
  session.bindAccount(accountId);
  return {
    session,
    loadHub,
    toast,
    onSessionExpired,
    onDisabled,
    setAccount: (id: string | null) => {
      current = id;
    },
  };
}

describe("PAGE-047 engagement hub session", () => {
  it("starts loading and does not treat a failed load as zeros", async () => {
    const deps = createDeps();
    expect(deps.session.getSnapshot()).toMatchObject({ kind: "loading", hub: null });
    deps.loadHub.mockResolvedValueOnce({
      ok: false,
      error: ENGAGEMENT_HUB_LOAD_ERROR,
      sessionExpired: false,
      disabled: false,
    });
    await deps.session.load(userA);
    expect(deps.session.getSnapshot()).toMatchObject({
      kind: "error",
      hub: null,
      error: ENGAGEMENT_HUB_LOAD_ERROR,
    });
    expect(deps.toast).toHaveBeenCalledWith(ENGAGEMENT_HUB_LOAD_ERROR);
  });

  it("keeps a successful zero hub distinct from error", async () => {
    const deps = createDeps();
    deps.loadHub.mockResolvedValueOnce({ ok: true, hub: hub() });
    await deps.session.load(userA);
    expect(deps.session.getSnapshot()).toMatchObject({
      kind: "ready",
      hub: {
        promotional_balance: 0,
        battle_energy: 0,
        total_xp: 0,
        fan_level: 0,
      },
      error: null,
    });
  });

  it("drops a late User A hub after User B is active", async () => {
    const deps = createDeps(userA);
    const first = deferred<{ ok: true; hub: EngagementHub }>();
    deps.loadHub.mockReturnValueOnce(first.promise);
    const loadA = deps.session.load(userA);
    deps.setAccount(userB);
    deps.session.bindAccount(userB);
    deps.loadHub.mockResolvedValueOnce({
      ok: true,
      hub: hub({ promotional_balance: 3, battle_energy: 4, total_xp: 5, fan_level: 2, fan_tier: "Bronze Fan" }),
    });
    const loadB = deps.session.load(userB);
    first.resolve({
      ok: true,
      hub: hub({ promotional_balance: 99, battle_energy: 88, total_xp: 77, fan_level: 40, fan_tier: "Elite Fan" }),
    });
    await loadA;
    await loadB;
    expect(deps.session.getSnapshot().kind).toBe("ready");
    expect(deps.session.getSnapshot().hub).toMatchObject({
      promotional_balance: 3,
      battle_energy: 4,
      total_xp: 5,
      fan_level: 2,
    });
  });

  it("does not let a stale Hub GET overwrite a newer same-account summary", async () => {
    const deps = createDeps(userA);
    const stale = deferred<{ ok: true; hub: EngagementHub }>();
    deps.loadHub.mockReturnValueOnce(stale.promise);
    const first = deps.session.load(userA);
    deps.loadHub.mockResolvedValueOnce({
      ok: true,
      hub: hub({ promotional_balance: 200, battle_energy: 5, total_xp: 10, fan_level: 1 }),
    });
    await deps.session.load(userA);
    expect(deps.session.getSnapshot().hub?.promotional_balance).toBe(200);
    stale.resolve({
      ok: true,
      hub: hub({ promotional_balance: 100, battle_energy: 1, total_xp: 1, fan_level: 1 }),
    });
    await first;
    expect(deps.session.getSnapshot().hub?.promotional_balance).toBe(200);
  });

  it("expires only an unauthenticated load and redirects a disabled hub", async () => {
    const expired = createDeps();
    expired.loadHub.mockResolvedValueOnce({
      ok: false,
      error: "Please sign in",
      sessionExpired: true,
      disabled: false,
    });
    await expired.session.load(userA);
    expect(expired.onSessionExpired).toHaveBeenCalledTimes(1);
    expect(expired.onDisabled).not.toHaveBeenCalled();

    const disabled = createDeps();
    disabled.loadHub.mockResolvedValueOnce({
      ok: false,
      error: "ENGAGEMENT_HUB_DISABLED",
      sessionExpired: false,
      disabled: true,
    });
    await disabled.session.load(userA);
    expect(disabled.onDisabled).toHaveBeenCalledTimes(1);
    expect(disabled.session.getSnapshot().kind).toBe("error");
  });
});
