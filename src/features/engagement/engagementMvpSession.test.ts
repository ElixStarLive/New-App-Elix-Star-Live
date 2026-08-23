import { describe, expect, it, vi } from "vitest";
import type { EngagementMvpResponse } from "@shared/contracts";
import { ENGAGEMENT_MVP_LOAD_ERROR, createEngagementMvpSession } from "./engagementMvpSession";

const userA = "11111111-1111-4111-8111-111111111111";
const userB = "22222222-2222-4222-8222-222222222222";

const board = (patch: Partial<EngagementMvpResponse> = {}): EngagementMvpResponse => ({
  period: "today",
  viewer_id: userA,
  leaderboard: [],
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
  const loadMvp = vi.fn();
  const toast = vi.fn();
  const onSessionExpired = vi.fn();
  const onDisabled = vi.fn();
  const session = createEngagementMvpSession({
    getAccountId: () => current,
    loadMvp,
    toast,
    onSessionExpired,
    onDisabled,
  });
  session.bindAccount(accountId);
  return {
    session,
    loadMvp,
    toast,
    onSessionExpired,
    onDisabled,
    setAccount: (id: string | null) => {
      current = id;
    },
  };
}

describe("PAGE-050 MVP session", () => {
  it("starts loading and does not treat a failed load as zero scores", async () => {
    const deps = createDeps();
    expect(deps.session.getSnapshot()).toMatchObject({ kind: "loading", board: null });
    deps.loadMvp.mockResolvedValueOnce({
      ok: false,
      error: ENGAGEMENT_MVP_LOAD_ERROR,
      sessionExpired: false,
      disabled: false,
    });
    await deps.session.load(userA, "today");
    expect(deps.session.getSnapshot()).toMatchObject({
      kind: "error",
      board: null,
      error: ENGAGEMENT_MVP_LOAD_ERROR,
    });
  });

  it("keeps a successful empty board distinct from error", async () => {
    const deps = createDeps();
    deps.loadMvp.mockResolvedValueOnce({ ok: true, board: board() });
    await deps.session.load(userA, "today");
    expect(deps.session.getSnapshot()).toMatchObject({
      kind: "ready",
      board: { period: "today", leaderboard: [] },
      error: null,
    });
  });

  it("drops a late User A board after User B is active", async () => {
    const deps = createDeps(userA);
    const first = deferred<{ ok: true; board: EngagementMvpResponse }>();
    deps.loadMvp.mockReturnValueOnce(first.promise);
    const loadA = deps.session.load(userA, "today");
    deps.setAccount(userB);
    deps.session.bindAccount(userB);
    deps.loadMvp.mockResolvedValueOnce({
      ok: true,
      board: board({
        viewer_id: userB,
        leaderboard: [{ rank: 1, user_id: userB, points: 4 }],
      }),
    });
    const loadB = deps.session.load(userB, "today");
    first.resolve({
      ok: true,
      board: board({
        viewer_id: userA,
        leaderboard: [{ rank: 1, user_id: userA, points: 99 }],
      }),
    });
    await loadA;
    await loadB;
    expect(deps.session.getSnapshot().kind).toBe("ready");
    expect(deps.session.getSnapshot().board).toMatchObject({
      viewer_id: userB,
      leaderboard: [{ points: 4 }],
    });
  });
});
