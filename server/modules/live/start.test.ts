import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../../middleware/errors.js";

const queryMock = vi.fn();
const connectMock = vi.fn();
const mintMock = vi.fn(async (_opts: unknown) => ({ token: "host-jwt", url: "wss://livekit.example" }));
const isLivekitConfiguredMock = vi.fn(() => true);
const broadcastMock = vi.fn(async (_event: string, _data: unknown) => undefined);
const valkeySetMock = vi.fn(async (_key: string, _value: string, _ttlMs: number) => undefined);
const valkeyDelMock = vi.fn(async (_key: string) => undefined);
const valkeyGetMock = vi.fn(async (_key: string): Promise<string | null> => null);
const envMock = vi.fn((): { valkeyUrl: string | null; isProduction: boolean } => ({
  valkeyUrl: null,
  isProduction: false,
}));

vi.mock("../../infra/postgres.js", () => ({
  getPool: () => ({ query: queryMock, connect: connectMock }),
}));
vi.mock("../../infra/livekit.js", () => ({
  isLivekitConfigured: () => isLivekitConfiguredMock(),
  createLivekitToken: (opts: unknown) => mintMock(opts),
}));
vi.mock("../../infra/env.js", () => ({
  env: () => envMock(),
}));
vi.mock("../../infra/valkey.js", () => ({
  valkeySet: (key: string, value: string, ttlMs: number) => valkeySetMock(key, value, ttlMs),
  valkeyDel: (key: string) => valkeyDelMock(key),
  valkeyGet: (key: string) => valkeyGetMock(key),
}));
vi.mock("./presenceFanout.js", () => ({
  broadcastLivePresence: (event: string, data: unknown) => broadcastMock(event, data),
}));
vi.mock("../../infra/logger.js", () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}));
const notifyLiveMock = vi.fn(async (..._args: unknown[]) => 0);
const deleteLiveMock = vi.fn(async (..._args: unknown[]) => undefined);
vi.mock("../notifications/liveStarted.js", () => ({
  notifyFollowersLiveStarted: (input: unknown) => notifyLiveMock(input),
  deleteLiveStartedNotificationsForRoom: (roomId: string, hostId: string) =>
    deleteLiveMock(roomId, hostId),
}));

import { endLive, expireAbandonedLives, startLive } from "./start.js";

const hostId = "11111111-1111-4111-8111-111111111111";
const streamId = "22222222-2222-4222-8222-222222222222";
const host = {
  display_name: "Maya",
  username: "maya",
  avatar_url: null,
  banned_until: null,
  deleted_at: null,
};

function txClient(existing: unknown[] = [], inserted?: unknown) {
  const clientQuery = vi.fn(async (sql: string) => {
    if (sql.includes("BEGIN") || sql.includes("COMMIT") || sql.includes("ROLLBACK")) return { rows: [] };
    if (sql.includes("FOR UPDATE")) return { rows: existing };
    if (sql.includes("INSERT INTO live_streams")) return { rows: [inserted] };
    return { rows: [] };
  });
  connectMock.mockResolvedValue({
    query: clientQuery,
    release: vi.fn(),
  });
  return clientQuery;
}

describe("PAGE-018 live start/end", () => {
  beforeEach(() => {
    queryMock.mockReset();
    connectMock.mockReset();
    mintMock.mockReset();
    broadcastMock.mockClear();
    notifyLiveMock.mockClear();
    deleteLiveMock.mockClear();
    valkeySetMock.mockClear();
    valkeyDelMock.mockClear();
    valkeyGetMock.mockReset();
    valkeyGetMock.mockResolvedValue(null);
    isLivekitConfiguredMock.mockReturnValue(true);
    envMock.mockReturnValue({ valkeyUrl: "redis://127.0.0.1:6379", isProduction: false });
    mintMock.mockResolvedValue({ token: "host-jwt", url: "wss://livekit.example" });
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM users")) return { rows: [host] };
      return { rows: [] };
    });
  });

  it("refuses a client-supplied room that is not the host id", async () => {
    await expect(startLive(hostId, { room: "someone-else" })).rejects.toMatchObject({
      code: "forbidden",
      status: 403,
    } satisfies Partial<AppError>);
    expect(mintMock).not.toHaveBeenCalled();
  });

  it("fails closed when Valkey is not configured", async () => {
    envMock.mockReturnValue({ valkeyUrl: null, isProduction: false });
    const startedAt = new Date("2026-08-21T12:00:00.000Z");
    txClient([], { id: streamId, room_id: hostId, title: "LIVE", started_at: startedAt });
    await expect(startLive(hostId, { title: "LIVE" })).rejects.toMatchObject({
      code: "unavailable",
      status: 503,
    });
    expect(broadcastMock).not.toHaveBeenCalled();
  });

  it("owns roomId as the host user id and announces stream_started once", async () => {
    const startedAt = new Date("2026-08-21T12:00:00.000Z");
    txClient([], { id: streamId, room_id: hostId, title: "LIVE", started_at: startedAt });
    const result = await startLive(hostId, { title: "LIVE" });
    expect(result.roomId).toBe(hostId);
    expect(result.streamId).toBe(streamId);
    expect(result.reconnect).toBe(false);
    expect(mintMock).toHaveBeenCalledWith({
      identity: hostId,
      room: hostId,
      canPublish: true,
      name: "Maya",
    });
    expect(broadcastMock).toHaveBeenCalledWith(
      "stream_started",
      expect.objectContaining({
        streamId,
        roomId: hostId,
        hostId,
        title: "LIVE",
        viewerCount: 0,
      }),
    );
    expect(notifyLiveMock).toHaveBeenCalledWith(
      expect.objectContaining({
        hostId,
        roomId: hostId,
        hostLabel: "Maya",
      }),
    );
  });

  it("treats a second start as reconnect without a second stream_started", async () => {
    const startedAt = new Date("2026-08-21T12:00:00.000Z");
    txClient([{ id: streamId, room_id: hostId, title: "LIVE", started_at: startedAt }]);
    const result = await startLive(hostId, { title: "LIVE" });
    expect(result.reconnect).toBe(true);
    expect(result.streamId).toBe(streamId);
    expect(broadcastMock).not.toHaveBeenCalled();
    expect(notifyLiveMock).not.toHaveBeenCalled();
  });

  it("refuses a banned host", async () => {
    queryMock.mockResolvedValue({
      rows: [{ ...host, banned_until: new Date("9999-01-01T00:00:00.000Z") }],
    });
    await expect(startLive(hostId, { title: "LIVE" })).rejects.toMatchObject({
      code: "banned",
      status: 403,
    });
    expect(mintMock).not.toHaveBeenCalled();
  });

  it("fails closed when LiveKit is not configured", async () => {
    isLivekitConfiguredMock.mockReturnValue(false);
    await expect(startLive(hostId, { title: "LIVE" })).rejects.toMatchObject({
      code: "unavailable",
      status: 503,
    });
  });

  it("ends a live row, clears realtime, and emits stream_ended", async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("UPDATE live_streams")) return { rows: [{ room_id: hostId }] };
      return { rows: [] };
    });
    const result = await endLive(hostId, streamId);
    expect(result).toEqual({ ok: true, alreadyEnded: false, roomId: hostId });
    expect(broadcastMock).toHaveBeenCalledWith("stream_ended", { streamId, roomId: hostId });
    expect(deleteLiveMock).toHaveBeenCalledWith(hostId, hostId);
  });

  it("expires a live after host presence is gone and fans out stream_ended", async () => {
    envMock.mockReturnValue({ valkeyUrl: "redis://127.0.0.1:6379", isProduction: true });
    valkeyGetMock.mockResolvedValue(null);
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("SELECT id, host_id, room_id")) {
        return { rows: [{ id: streamId, host_id: hostId, room_id: hostId }] };
      }
      if (sql.includes("UPDATE live_streams")) return { rows: [{ room_id: hostId }] };
      return { rows: [] };
    });
    await expect(expireAbandonedLives()).resolves.toBe(1);
    expect(broadcastMock).toHaveBeenCalledWith("stream_ended", { streamId, roomId: hostId });
  });

  it("does not end a live while host grace is still present", async () => {
    envMock.mockReturnValue({ valkeyUrl: "redis://127.0.0.1:6379", isProduction: true });
    valkeyGetMock.mockResolvedValue("grace");
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("SELECT id, host_id, room_id")) {
        return { rows: [{ id: streamId, host_id: hostId, room_id: hostId }] };
      }
      return { rows: [] };
    });
    await expect(expireAbandonedLives()).resolves.toBe(0);
    expect(broadcastMock).not.toHaveBeenCalled();
  });

  it("is idempotent when the stream is already ended", async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("UPDATE live_streams")) return { rows: [] };
      if (sql.includes("SELECT status")) return { rows: [{ status: "ended", room_id: hostId }] };
      return { rows: [] };
    });
    const result = await endLive(hostId, streamId);
    expect(result.alreadyEnded).toBe(true);
    expect(broadcastMock).not.toHaveBeenCalled();
  });
});
