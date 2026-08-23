import { describe, expect, it, vi } from "vitest";
import type { EngagementDailyLoginState } from "@shared/contracts";
import {
  ENGAGEMENT_DAILY_LOGIN_LOAD_ERROR,
  createEngagementDailyLoginSession,
} from "./engagementDailyLoginSession";

const userA = "11111111-1111-4111-8111-111111111111";
const userB = "22222222-2222-4222-8222-222222222222";

const days = [
  { streak_day: 1, reward_xp: 100, reward_promo_coins: 0, reward_label: "100 XP" },
  { streak_day: 2, reward_xp: 200, reward_promo_coins: 0, reward_label: "200 XP" },
  { streak_day: 3, reward_xp: 0, reward_promo_coins: 0, reward_label: "Gift coupon" },
  { streak_day: 4, reward_xp: 0, reward_promo_coins: 500, reward_label: "500 Promotional Coins" },
  { streak_day: 5, reward_xp: 0, reward_promo_coins: 0, reward_label: "Temporary profile frame" },
  { streak_day: 6, reward_xp: 1000, reward_promo_coins: 0, reward_label: "1,000 XP" },
  { streak_day: 7, reward_xp: 500, reward_promo_coins: 1000, reward_label: "Mystery reward" },
];

const daily = (patch: Partial<EngagementDailyLoginState> = {}): EngagementDailyLoginState => ({
  can_claim: true,
  streak_day: 1,
  claimed_today: false,
  next_reward: days[0],
  days,
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
  const loadDaily = vi.fn();
  const claimDaily = vi.fn();
  const toast = vi.fn();
  const onSessionExpired = vi.fn();
  const onDisabled = vi.fn();
  const session = createEngagementDailyLoginSession({
    getAccountId: () => current,
    loadDaily,
    claimDaily,
    toast,
    onSessionExpired,
    onDisabled,
  });
  session.bindAccount(accountId);
  return {
    session,
    loadDaily,
    claimDaily,
    toast,
    onSessionExpired,
    onDisabled,
    setAccount: (id: string | null) => {
      current = id;
    },
  };
}

describe("PAGE-053 daily login session", () => {
  it("starts loading and does not treat a failed load as claimable", async () => {
    const deps = createDeps();
    expect(deps.session.getSnapshot()).toMatchObject({ kind: "loading", daily: null, claiming: false });
    deps.loadDaily.mockResolvedValueOnce({
      ok: false,
      error: ENGAGEMENT_DAILY_LOGIN_LOAD_ERROR,
      sessionExpired: false,
      disabled: false,
    });
    await deps.session.load(userA);
    expect(deps.session.getSnapshot()).toMatchObject({
      kind: "error",
      daily: null,
      error: ENGAGEMENT_DAILY_LOGIN_LOAD_ERROR,
      claiming: false,
    });
  });

  it("drops a late User A daily state after User B is active", async () => {
    const deps = createDeps(userA);
    const first = deferred<{ ok: true; daily: EngagementDailyLoginState }>();
    deps.loadDaily.mockReturnValueOnce(first.promise);
    const loadA = deps.session.load(userA);
    deps.setAccount(userB);
    deps.session.bindAccount(userB);
    deps.loadDaily.mockResolvedValueOnce({
      ok: true,
      daily: daily({ streak_day: 4, next_reward: days[3] }),
    });
    const loadB = deps.session.load(userB);
    first.resolve({ ok: true, daily: daily({ streak_day: 7, next_reward: days[6] }) });
    await loadA;
    await loadB;
    expect(deps.session.getSnapshot()).toMatchObject({
      kind: "ready",
      daily: { streak_day: 4, next_reward: days[3] },
    });
  });

  it("locks Claim during the active request and does not credit locally", async () => {
    const deps = createDeps();
    deps.loadDaily.mockResolvedValueOnce({ ok: true, daily: daily() });
    await deps.session.load(userA);
    deps.claimDaily.mockResolvedValueOnce({
      ok: true,
      daily: daily({ can_claim: false, claimed_today: true, next_reward: null }),
      reward: days[0],
    });
    deps.loadDaily.mockResolvedValueOnce({
      ok: true,
      daily: daily({ can_claim: false, claimed_today: true, next_reward: null }),
    });
    const first = deps.session.claim(userA);
    const second = deps.session.claim(userA);
    await first;
    await second;
    expect(deps.claimDaily).toHaveBeenCalledTimes(1);
    expect(deps.toast).toHaveBeenCalledWith("100 XP");
    expect(deps.session.getSnapshot()).toMatchObject({
      kind: "ready",
      claiming: false,
      daily: { can_claim: false, claimed_today: true },
    });
  });

  it("does not claim from client state when the server says it is not claimable", async () => {
    const deps = createDeps();
    deps.loadDaily.mockResolvedValueOnce({
      ok: true,
      daily: daily({ can_claim: false, claimed_today: true, next_reward: null }),
    });
    await deps.session.load(userA);
    await deps.session.claim(userA);
    expect(deps.claimDaily).not.toHaveBeenCalled();
  });

  it("keeps the previous ready state after a failed claim", async () => {
    const deps = createDeps();
    deps.loadDaily.mockResolvedValueOnce({ ok: true, daily: daily() });
    await deps.session.load(userA);
    deps.claimDaily.mockResolvedValueOnce({
      ok: false,
      error: "Claim failed",
      sessionExpired: false,
      disabled: false,
    });
    await deps.session.claim(userA);
    expect(deps.session.getSnapshot()).toMatchObject({
      kind: "ready",
      claiming: false,
      daily: { can_claim: true, claimed_today: false, streak_day: 1 },
    });
    expect(deps.toast).toHaveBeenCalledWith("Claim failed");
  });
});
