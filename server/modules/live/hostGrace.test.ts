import { beforeEach, describe, expect, it, vi } from "vitest";

const valkeySetMock = vi.fn(async (_key: string, _value: string, _ttlMs: number) => undefined);
const valkeyGetMock = vi.fn(async (_key: string): Promise<string | null> => null);
const valkeyDelMock = vi.fn(async (_key: string) => undefined);
const valkeySaddMock = vi.fn(async (_key: string, _member: string, _ttlMs: number) => undefined);
const valkeySremMock = vi.fn(async (_key: string, _member: string) => 1);
const valkeyScardMock = vi.fn(async (_key: string) => 0);
const envMock = vi.fn((): { valkeyUrl: string | null } => ({ valkeyUrl: "redis://127.0.0.1:6379" }));

vi.mock("../../infra/env.js", () => ({
  env: () => envMock(),
}));
vi.mock("../../infra/valkey.js", () => ({
  valkeySet: (key: string, value: string, ttlMs: number) => valkeySetMock(key, value, ttlMs),
  valkeyGet: (key: string) => valkeyGetMock(key),
  valkeyDel: (key: string) => valkeyDelMock(key),
  valkeySadd: (key: string, member: string, ttlMs: number) => valkeySaddMock(key, member, ttlMs),
  valkeySrem: (key: string, member: string) => valkeySremMock(key, member),
  valkeyScard: (key: string) => valkeyScardMock(key),
}));

import {
  HOST_CONNECTED_MS,
  HOST_GRACE_MS,
  HOST_STARTING_MS,
  addHostConnection,
  clearHostPresence,
  getHostPresence,
  hostConnKey,
  hostPresenceKey,
  markHostConnected,
  markHostGrace,
  markHostStarting,
  removeHostConnection,
} from "./hostGrace.js";

const roomId = "11111111-1111-4111-8111-111111111111";

describe("FLOW-027 host grace", () => {
  beforeEach(() => {
    valkeySetMock.mockClear();
    valkeyGetMock.mockReset();
    valkeyDelMock.mockClear();
    valkeySaddMock.mockClear();
    valkeySremMock.mockClear();
    valkeyScardMock.mockReset();
    valkeyScardMock.mockResolvedValue(0);
    envMock.mockReturnValue({ valkeyUrl: "redis://127.0.0.1:6379" });
  });

  it("stores starting, connected, and 20s grace on the Valkey host key", async () => {
    await markHostStarting(roomId);
    await markHostConnected(roomId);
    valkeyGetMock.mockResolvedValue("connected");
    await markHostGrace(roomId);
    expect(valkeySetMock).toHaveBeenCalledWith(hostPresenceKey(roomId), "starting", HOST_STARTING_MS);
    expect(valkeySetMock).toHaveBeenCalledWith(hostPresenceKey(roomId), "connected", HOST_CONNECTED_MS);
    expect(valkeySetMock).toHaveBeenCalledWith(hostPresenceKey(roomId), "grace", HOST_GRACE_MS);
    expect(HOST_GRACE_MS).toBe(20_000);
  });

  it("does not start grace when the host key is already gone", async () => {
    valkeyGetMock.mockResolvedValue(null);
    await markHostGrace(roomId);
    expect(valkeySetMock).not.toHaveBeenCalled();
  });

  it("treats a missing key as expired so another instance can end the live", async () => {
    valkeyGetMock.mockResolvedValue(null);
    await expect(getHostPresence(roomId)).resolves.toBeNull();
    await clearHostPresence(roomId);
    expect(valkeyDelMock).toHaveBeenCalledWith(hostPresenceKey(roomId));
  });

  it("does not invent process-local grace when Valkey is absent", async () => {
    envMock.mockReturnValue({ valkeyUrl: null });
    await markHostGrace(roomId);
    await expect(getHostPresence(roomId)).resolves.toBeNull();
    expect(valkeySetMock).not.toHaveBeenCalled();
  });

  it("starts grace only after the last Valkey-tracked host connection leaves", async () => {
    valkeyGetMock.mockResolvedValue("connected");
    valkeyScardMock.mockResolvedValueOnce(1);
    await removeHostConnection(roomId, "conn-a");
    expect(valkeySetMock).not.toHaveBeenCalled();
    valkeyScardMock.mockResolvedValueOnce(0);
    await removeHostConnection(roomId, "conn-b");
    expect(valkeySetMock).toHaveBeenCalledWith(hostPresenceKey(roomId), "grace", HOST_GRACE_MS);
  });

  it("tracks host sockets in Valkey instead of process memory", async () => {
    await addHostConnection(roomId, "conn-a");
    expect(valkeySaddMock).toHaveBeenCalledWith(hostConnKey(roomId), "conn-a", HOST_CONNECTED_MS);
    expect(valkeySetMock).toHaveBeenCalledWith(hostPresenceKey(roomId), "connected", HOST_CONNECTED_MS);
  });
});
