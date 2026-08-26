import { beforeEach, describe, expect, it, vi } from "vitest";

const getMock = vi.fn();
const setMock = vi.fn();
const delMock = vi.fn();
const trySetNxMock = vi.fn();
const publishMock = vi.fn();

vi.mock("../../infra/valkey.js", () => ({
  requireValkey: () => ({ get: getMock, set: setMock, del: delMock }),
  valkeyTrySetNx: (...args: unknown[]) => trySetNxMock(...args),
  valkeyDel: (...args: unknown[]) => delMock(...args),
  valkeyPub: () => ({ publish: publishMock }),
}));

vi.mock("../../infra/env.js", () => ({
  env: () => ({ valkeyUrl: "redis://127.0.0.1:6379" }),
}));

vi.mock("../../infra/postgres.js", () => ({
  getPool: () => ({ query: vi.fn(async () => ({ rows: [] })) }),
}));

import { applyBattleSpectatorTap } from "./runtime.js";

const roomId = "11111111-1111-4111-8111-111111111111";
const viewerId = "22222222-2222-4222-8222-222222222222";
const hostId = roomId;

const activeBattle = {
  roomId,
  type: "1x1" as const,
  status: "ACTIVE" as const,
  seats: { host: hostId, opponent: "33333333-3333-4333-8333-333333333333", player3: null, player4: null },
  teamAScore: 0,
  teamBScore: 0,
  startedAt: new Date().toISOString(),
  endsAt: new Date(Date.now() + 300_000).toISOString(),
  remainingMs: 300_000,
};

describe("PAGE-018 battle spectator tap", () => {
  beforeEach(() => {
    getMock.mockReset();
    setMock.mockReset();
    delMock.mockReset();
    trySetNxMock.mockReset();
    publishMock.mockReset();
    getMock.mockResolvedValue(JSON.stringify(activeBattle));
    trySetNxMock.mockResolvedValue(true);
    setMock.mockResolvedValue("OK");
    publishMock.mockResolvedValue(1);
  });

  it("awards +5 once per viewer per battle", async () => {
    const first = await applyBattleSpectatorTap(roomId, viewerId, "host");
    expect(first.ok).toBe(true);
    if (first.ok) expect(first.points).toBe(5);

    trySetNxMock.mockResolvedValue(false);
    const second = await applyBattleSpectatorTap(roomId, viewerId, "host");
    expect(second).toEqual({ ok: false, reason: "already_awarded" });
  });

  it("rejects seated battle participants", async () => {
    const result = await applyBattleSpectatorTap(roomId, hostId, "host");
    expect(result).toEqual({ ok: false, reason: "participant" });
  });
});
