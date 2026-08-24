import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../../middleware/errors.js";

const queryMock = vi.fn();
const mintMock = vi.fn(async (_opts: unknown) => ({ token: "spec-jwt", url: "wss://livekit.example" }));
const isLivekitConfiguredMock = vi.fn(() => true);
const seatedMock = vi.fn(async () => false);

vi.mock("../../infra/postgres.js", () => ({
  getPool: () => ({ query: queryMock }),
}));
vi.mock("../../infra/livekit.js", () => ({
  isLivekitConfigured: () => isLivekitConfiguredMock(),
  createLivekitToken: (opts: unknown) => mintMock(opts),
}));
vi.mock("../cohost/runtime.js", () => ({
  isSeatedCohost: () => seatedMock(),
}));
vi.mock("./start.js", () => ({
  expireAbandonedLives: async () => 0,
}));

import { issueLiveToken, spectatorIdentity } from "./token.js";

const hostId = "11111111-1111-4111-8111-111111111111";
const viewerId = "22222222-2222-4222-8222-222222222222";
const streamId = "33333333-3333-4333-8333-333333333333";
const liveRow = {
  id: streamId,
  host_id: hostId,
  status: "live",
  room_id: hostId,
  display_name: "Maya",
  username: "maya",
  avatar_url: null,
  banned_until: null,
  deleted_at: null,
};

describe("PAGE-019 live spectator token", () => {
  beforeEach(() => {
    queryMock.mockReset();
    mintMock.mockClear();
    isLivekitConfiguredMock.mockReturnValue(true);
    seatedMock.mockResolvedValue(false);
  });

  it("looks up the canonical roomId only and never grants publish to a spectator", async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM live_streams")) return { rows: [liveRow] };
      if (sql.includes("FROM blocks")) return { rows: [{ n: 0 }] };
      return { rows: [] };
    });
    const first = await issueLiveToken(viewerId, hostId, "spectator");
    const second = await issueLiveToken(viewerId, hostId, "spectator");
    expect(first.canPublish).toBe(false);
    expect(second.canPublish).toBe(false);
    expect(first.roomId).toBe(hostId);
    expect(first.hostId).toBe(hostId);
    expect(first.streamId).toBe(streamId);
    expect(mintMock.mock.calls[0]?.[0]).toMatchObject({
      room: hostId,
      canPublish: false,
    });
    const identity = (mintMock.mock.calls[0]?.[0] as { identity: string }).identity;
    expect(identity.startsWith(`${viewerId}__v_`)).toBe(true);
    expect(identity).not.toBe(hostId);
    const identity2 = (mintMock.mock.calls[1]?.[0] as { identity: string }).identity;
    expect(identity2).not.toBe(identity);
    expect(queryMock.mock.calls[0]?.[1]).toEqual([hostId]);
  });

  it("refuses a stream UUID that is not the canonical roomId", async () => {
    queryMock.mockResolvedValue({ rows: [] });
    await expect(issueLiveToken(viewerId, streamId, "spectator")).rejects.toMatchObject({
      code: "not_found",
      status: 404,
    } satisfies Partial<AppError>);
    expect(mintMock).not.toHaveBeenCalled();
  });

  it("refuses a blocked viewer before minting media credentials", async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM live_streams")) return { rows: [liveRow] };
      if (sql.includes("FROM blocks")) return { rows: [{ n: 1 }] };
      return { rows: [] };
    });
    await expect(issueLiveToken(viewerId, hostId, "spectator")).rejects.toMatchObject({
      code: "forbidden",
      status: 403,
    });
    expect(mintMock).not.toHaveBeenCalled();
  });

  it("does not mint a spectator token when LiveKit is down", async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM live_streams")) return { rows: [liveRow] };
      if (sql.includes("FROM blocks")) return { rows: [{ n: 0 }] };
      return { rows: [] };
    });
    isLivekitConfiguredMock.mockReturnValue(false);
    await expect(issueLiveToken(viewerId, hostId, "spectator")).rejects.toMatchObject({
      code: "unavailable",
      status: 503,
    });
  });

  it("never lets a spectator mint host publish rights", async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM live_streams")) return { rows: [liveRow] };
      return { rows: [{ n: 0 }] };
    });
    await expect(issueLiveToken(viewerId, hostId, "host")).rejects.toMatchObject({
      code: "forbidden",
      status: 403,
    });
  });
});

describe("spectatorIdentity", () => {
  it("is unique per call and never equals the host user id", () => {
    const a = spectatorIdentity(viewerId);
    const b = spectatorIdentity(viewerId);
    expect(a).not.toBe(b);
    expect(a).toMatch(new RegExp(`^${viewerId}__v_[a-f0-9]{12}$`));
  });
});
