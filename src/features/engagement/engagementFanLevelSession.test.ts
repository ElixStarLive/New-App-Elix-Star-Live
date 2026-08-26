import { describe, expect, it, vi } from "vitest";
import type { EngagementFanLevel } from "@shared/contracts";
import {
  ENGAGEMENT_FAN_LEVEL_LOAD_ERROR,
  createEngagementFanLevelSession,
} from "./engagementFanLevelSession";

const userA = "11111111-1111-4111-8111-111111111111";
const userB = "22222222-2222-4222-8222-222222222222";

const fan = (patch: Partial<EngagementFanLevel> = {}): EngagementFanLevel => ({
  level: 0,
  tier: "Bronze Fan",
  total_xp: 0,
  title: "Bronze Fan",
  badge_code: null,
  next_level_total_xp: 207,
  xp_to_next_level: 207,
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
  const loadFanLevel = vi.fn();
  const toast = vi.fn();
  const onSessionExpired = vi.fn();
  const onDisabled = vi.fn();
  const session = createEngagementFanLevelSession({
    getAccountId: () => current,
    loadFanLevel,
    toast,
    onSessionExpired,
    onDisabled,
  });
  session.bindAccount(accountId);
  return {
    session,
    loadFanLevel,
    toast,
    onSessionExpired,
    onDisabled,
    setAccount: (id: string | null) => {
      current = id;
    },
  };
}

describe("PAGE-049 fan level session", () => {
  it("starts loading and does not treat a failed load as level 0", async () => {
    const deps = createDeps();
    expect(deps.session.getSnapshot()).toMatchObject({ kind: "loading", fanLevel: null });
    deps.loadFanLevel.mockResolvedValueOnce({
      ok: false,
      error: ENGAGEMENT_FAN_LEVEL_LOAD_ERROR,
      sessionExpired: false,
      disabled: false,
    });
    await deps.session.load(userA);
    expect(deps.session.getSnapshot()).toMatchObject({
      kind: "error",
      fanLevel: null,
      error: ENGAGEMENT_FAN_LEVEL_LOAD_ERROR,
    });
    expect(deps.toast).toHaveBeenCalledWith(ENGAGEMENT_FAN_LEVEL_LOAD_ERROR);
  });

  it("keeps a successful zero progression distinct from error", async () => {
    const deps = createDeps();
    deps.loadFanLevel.mockResolvedValueOnce({ ok: true, fanLevel: fan() });
    await deps.session.load(userA);
    expect(deps.session.getSnapshot()).toMatchObject({
      kind: "ready",
      fanLevel: { level: 0, total_xp: 0, tier: "Bronze Fan" },
      error: null,
    });
  });

  it("drops a late User A progression after User B is active", async () => {
    const deps = createDeps(userA);
    const first = deferred<{ ok: true; fanLevel: EngagementFanLevel }>();
    deps.loadFanLevel.mockReturnValueOnce(first.promise);
    const loadA = deps.session.load(userA);
    deps.setAccount(userB);
    deps.session.bindAccount(userB);
    deps.loadFanLevel.mockResolvedValueOnce({
      ok: true,
      fanLevel: fan({ level: 2, total_xp: 5, tier: "Bronze Fan" }),
    });
    const loadB = deps.session.load(userB);
    first.resolve({
      ok: true,
      fanLevel: fan({ level: 40, total_xp: 77, tier: "Elite Fan" }),
    });
    await loadA;
    await loadB;
    expect(deps.session.getSnapshot().kind).toBe("ready");
    expect(deps.session.getSnapshot().fanLevel).toMatchObject({
      level: 2,
      total_xp: 5,
      tier: "Bronze Fan",
    });
  });

  it("does not let a stale fan-level GET overwrite a newer same-account load", async () => {
    const deps = createDeps();
    deps.loadFanLevel.mockResolvedValueOnce({ ok: true, fanLevel: fan({ total_xp: 900, level: 1 }) });
    await deps.session.load(userA);
    const stale = deferred<{ ok: true; fanLevel: EngagementFanLevel }>();
    deps.loadFanLevel.mockReturnValueOnce(stale.promise);
    const pending = deps.session.load(userA);
    deps.loadFanLevel.mockResolvedValueOnce({
      ok: true,
      fanLevel: fan({ total_xp: 1100, level: 2, tier: "Bronze Fan" }),
    });
    await deps.session.load(userA);
    expect(deps.session.getSnapshot().fanLevel).toMatchObject({ total_xp: 1100, level: 2 });
    stale.resolve({ ok: true, fanLevel: fan({ total_xp: 900, level: 1 }) });
    await pending;
    expect(deps.session.getSnapshot().fanLevel).toMatchObject({ total_xp: 1100, level: 2 });
  });
});
