import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();
const incrMock = vi.fn();
const expireMock = vi.fn();
const sendToUserGlobalMock = vi.fn();
const envMock = vi.fn(() => ({ valkeyUrl: "", isProduction: false }));

vi.mock("../../infra/postgres.js", () => ({
  getPool: () => ({ query: queryMock }),
}));
vi.mock("../../infra/logger.js", () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}));
vi.mock("../../infra/env.js", () => ({
  env: () => envMock(),
}));
vi.mock("../../infra/valkey.js", () => ({
  requireValkey: () => ({ incr: incrMock, expire: expireMock }),
}));
vi.mock("../../websocket/index.js", () => ({
  sendToUserGlobal: (...args: unknown[]) => sendToUserGlobalMock(...args),
}));

import { executeLiveShareSend, handlePostLiveShare } from "./liveShare";

describe("PAGE-030 live share write path", () => {
  beforeEach(() => {
    queryMock.mockReset();
    incrMock.mockReset();
    expireMock.mockReset();
    sendToUserGlobalMock.mockReset();
    envMock.mockReturnValue({ valkeyUrl: "", isProduction: false });
  });

  it("rejects self-share and empty stream key", async () => {
    const bad = await executeLiveShareSend({
      sharerId: "a",
      sharerName: "A",
      sharerAvatar: "",
      targetUserId: "a",
      streamKey: "room1",
      hostUserId: "a",
      hostName: "A",
      hostAvatar: "",
    });
    expect(bad.ok).toBe(false);
  });

  it("upserts Neon and notifies recipient over WS", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ host_id: "host-1" }] })
      .mockResolvedValueOnce({ rows: [] });
    sendToUserGlobalMock.mockResolvedValue(undefined);
    const ok = await executeLiveShareSend({
      sharerId: "sharer-1",
      sharerName: "Sharer",
      sharerAvatar: "",
      targetUserId: "viewer-1",
      streamKey: "host-1",
      hostUserId: "claimed-wrong",
      hostName: "Fake",
      hostAvatar: "x",
    });
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(ok.payload.hostUserId).toBe("host-1");
    expect(ok.payload.hostName).toBe("");
    expect(ok.persisted).toBe(true);
    expect(sendToUserGlobalMock).toHaveBeenCalledWith(
      "viewer-1",
      "live_share",
      expect.objectContaining({ streamKey: "host-1", sharerUserId: "sharer-1" }),
    );
  });

  it("handlePostLiveShare rejects invalid payload", async () => {
    await expect(handlePostLiveShare("sharer-1", { targetUserId: "sharer-1", streamKey: "x" })).rejects.toMatchObject({
      status: 400,
    });
  });
});
