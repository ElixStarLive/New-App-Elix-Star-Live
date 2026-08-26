import { describe, expect, it, vi } from "vitest";
import type { EngagementMission } from "@shared/contracts";
import {
  ENGAGEMENT_MISSIONS_LOAD_ERROR,
  createEngagementMissionsSession,
} from "./engagementMissionsSession";

const userA = "11111111-1111-4111-8111-111111111111";
const userB = "22222222-2222-4222-8222-222222222222";

const mission = (patch: Partial<EngagementMission> = {}): EngagementMission => ({
  id: "daily_like",
  scope: "daily",
  title: "Like 5 videos",
  description: "Like five videos today",
  goal_count: 5,
  reward_xp: 0,
  reward_promo_coins: 10,
  reward_energy: 0,
  metric_key: "like",
  period_key: "2026-08-21",
  progress: 5,
  completed: true,
  claimed: false,
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
  const loadMissions = vi.fn();
  const claimMission = vi.fn();
  const toast = vi.fn();
  const onSessionExpired = vi.fn();
  const onDisabled = vi.fn();
  const session = createEngagementMissionsSession({
    getAccountId: () => current,
    loadMissions,
    claimMission,
    toast,
    onSessionExpired,
    onDisabled,
  });
  session.bindAccount(accountId);
  return {
    session,
    loadMissions,
    claimMission,
    toast,
    onSessionExpired,
    onDisabled,
    setAccount: (id: string | null) => {
      current = id;
    },
  };
}

describe("PAGE-048 engagement missions session", () => {
  it("starts loading and does not treat a failed load as an empty catalog", async () => {
    const deps = createDeps();
    expect(deps.session.getSnapshot()).toMatchObject({ kind: "loading", missions: null });
    deps.loadMissions.mockResolvedValueOnce({
      ok: false,
      error: ENGAGEMENT_MISSIONS_LOAD_ERROR,
      sessionExpired: false,
      disabled: false,
    });
    await deps.session.load(userA);
    expect(deps.session.getSnapshot()).toMatchObject({
      kind: "error",
      missions: null,
      error: ENGAGEMENT_MISSIONS_LOAD_ERROR,
    });
  });

  it("keeps a successful empty catalog distinct from error", async () => {
    const deps = createDeps();
    deps.loadMissions.mockResolvedValueOnce({ ok: true, missions: [] });
    await deps.session.load(userA);
    expect(deps.session.getSnapshot()).toMatchObject({ kind: "ready", missions: [], error: null });
  });

  it("drops a late User A list after User B is active", async () => {
    const deps = createDeps(userA);
    const first = deferred<{ ok: true; missions: EngagementMission[] }>();
    deps.loadMissions.mockReturnValueOnce(first.promise);
    const loadA = deps.session.load(userA);
    deps.setAccount(userB);
    deps.session.bindAccount(userB);
    deps.loadMissions.mockResolvedValueOnce({
      ok: true,
      missions: [mission({ id: "daily_watch", title: "Watch 3 videos", progress: 1, completed: false })],
    });
    const loadB = deps.session.load(userB);
    first.resolve({ ok: true, missions: [mission({ title: "User A secret", progress: 5 })] });
    await loadA;
    await loadB;
    expect(deps.session.getSnapshot().kind).toBe("ready");
    expect(deps.session.getSnapshot().missions).toMatchObject([{ id: "daily_watch", title: "Watch 3 videos" }]);
  });

  it("claims once, then reloads server state instead of crediting locally", async () => {
    const deps = createDeps();
    deps.loadMissions.mockResolvedValueOnce({ ok: true, missions: [mission()] });
    await deps.session.load(userA);
    deps.claimMission.mockResolvedValueOnce({ ok: true });
    deps.loadMissions.mockResolvedValueOnce({
      ok: true,
      missions: [mission({ claimed: true, completed: true })],
    });
    const first = deps.session.claim("daily_like", userA);
    const second = deps.session.claim("daily_like", userA);
    await first;
    await second;
    expect(deps.claimMission).toHaveBeenCalledTimes(1);
    expect(deps.toast).toHaveBeenCalledWith("Reward claimed");
    expect(deps.session.getSnapshot()).toMatchObject({
      kind: "ready",
      claimingId: null,
      missions: [{ id: "daily_like", claimed: true }],
    });
  });

  it("does not let a stale list GET overwrite a newer same-account claim reload", async () => {
    const deps = createDeps();
    deps.loadMissions.mockResolvedValueOnce({ ok: true, missions: [mission()] });
    await deps.session.load(userA);
    const stale = deferred<{ ok: true; missions: EngagementMission[] }>();
    deps.loadMissions.mockReturnValueOnce(stale.promise);
    const pendingLoad = deps.session.load(userA);
    deps.loadMissions.mockResolvedValueOnce({
      ok: true,
      missions: [mission({ claimed: true, completed: true, progress: 5 })],
    });
    await deps.session.load(userA);
    expect(deps.session.getSnapshot().missions?.[0]?.claimed).toBe(true);
    stale.resolve({ ok: true, missions: [mission({ claimed: false, progress: 5 })] });
    await pendingLoad;
    expect(deps.session.getSnapshot().missions?.[0]?.claimed).toBe(true);
  });

  it("does not claim an incomplete mission from client state", async () => {
    const deps = createDeps();
    deps.loadMissions.mockResolvedValueOnce({
      ok: true,
      missions: [mission({ progress: 1, completed: false })],
    });
    await deps.session.load(userA);
    await deps.session.claim("daily_like", userA);
    expect(deps.claimMission).not.toHaveBeenCalled();
  });
});
