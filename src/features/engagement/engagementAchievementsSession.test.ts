import { describe, expect, it, vi } from "vitest";
import type { EngagementAchievement } from "@shared/contracts";
import {
  ENGAGEMENT_ACHIEVEMENTS_LOAD_ERROR,
  createEngagementAchievementsSession,
} from "./engagementAchievementsSession";

const userA = "11111111-1111-4111-8111-111111111111";
const userB = "22222222-2222-4222-8222-222222222222";

const row = (patch: Partial<EngagementAchievement> = {}): EngagementAchievement => ({
  id: "first_gift",
  name: "First Gift",
  description: "Send your first gift",
  icon: "🎁",
  goal_count: 1,
  reward_xp: 50,
  reward_promo_coins: 100,
  rarity: "common",
  progress: 0,
  unlocked: false,
  unlocked_at: null,
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
  const loadAchievements = vi.fn();
  const toast = vi.fn();
  const onSessionExpired = vi.fn();
  const onDisabled = vi.fn();
  const session = createEngagementAchievementsSession({
    getAccountId: () => current,
    loadAchievements,
    toast,
    onSessionExpired,
    onDisabled,
  });
  session.bindAccount(accountId);
  return {
    session,
    loadAchievements,
    toast,
    onSessionExpired,
    onDisabled,
    setAccount: (id: string | null) => {
      current = id;
    },
  };
}

describe("PAGE-051 achievements session", () => {
  it("starts loading and does not treat a failed load as an empty catalog", async () => {
    const deps = createDeps();
    expect(deps.session.getSnapshot()).toMatchObject({ kind: "loading", achievements: null });
    deps.loadAchievements.mockResolvedValueOnce({
      ok: false,
      error: ENGAGEMENT_ACHIEVEMENTS_LOAD_ERROR,
      sessionExpired: false,
      disabled: false,
    });
    await deps.session.load(userA);
    expect(deps.session.getSnapshot()).toMatchObject({
      kind: "error",
      achievements: null,
      error: ENGAGEMENT_ACHIEVEMENTS_LOAD_ERROR,
    });
    expect(deps.toast).toHaveBeenCalledWith(ENGAGEMENT_ACHIEVEMENTS_LOAD_ERROR);
  });

  it("keeps a successful empty catalog distinct from error", async () => {
    const deps = createDeps();
    deps.loadAchievements.mockResolvedValueOnce({ ok: true, achievements: [] });
    await deps.session.load(userA);
    expect(deps.session.getSnapshot()).toMatchObject({
      kind: "ready",
      achievements: [],
      error: null,
    });
  });

  it("drops a late User A catalog after User B is active", async () => {
    const deps = createDeps(userA);
    const first = deferred<{ ok: true; achievements: EngagementAchievement[] }>();
    deps.loadAchievements.mockReturnValueOnce(first.promise);
    const loadA = deps.session.load(userA);
    deps.setAccount(userB);
    deps.session.bindAccount(userB);
    deps.loadAchievements.mockResolvedValueOnce({
      ok: true,
      achievements: [row({ id: "first_gift", progress: 0, unlocked: false })],
    });
    const loadB = deps.session.load(userB);
    first.resolve({
      ok: true,
      achievements: [row({ id: "first_gift", progress: 1, unlocked: true, claimed: true })],
    });
    await loadA;
    await loadB;
    expect(deps.session.getSnapshot().kind).toBe("ready");
    expect(deps.session.getSnapshot().achievements).toMatchObject([
      { id: "first_gift", progress: 0, unlocked: false },
    ]);
  });

  it("does not let a stale achievements GET overwrite a newer same-account unlock", async () => {
    const deps = createDeps();
    deps.loadAchievements.mockResolvedValueOnce({
      ok: true,
      achievements: [row({ progress: 0, unlocked: false })],
    });
    await deps.session.load(userA);
    const stale = deferred<{ ok: true; achievements: EngagementAchievement[] }>();
    deps.loadAchievements.mockReturnValueOnce(stale.promise);
    const pending = deps.session.load(userA);
    deps.loadAchievements.mockResolvedValueOnce({
      ok: true,
      achievements: [row({ progress: 1, unlocked: true, claimed: true })],
    });
    await deps.session.load(userA);
    expect(deps.session.getSnapshot().achievements).toMatchObject([
      { progress: 1, unlocked: true, claimed: true },
    ]);
    stale.resolve({
      ok: true,
      achievements: [row({ progress: 0, unlocked: false })],
    });
    await pending;
    expect(deps.session.getSnapshot().achievements).toMatchObject([
      { progress: 1, unlocked: true, claimed: true },
    ]);
  });
});
