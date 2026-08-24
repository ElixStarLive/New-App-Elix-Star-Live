import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();
const viewerCountMock = vi.fn(async (_roomId: string) => 4);
const expireMock = vi.fn(async () => 0);
const getHostPresenceMock = vi.fn(async (_roomId: string): Promise<"starting" | "connected" | "grace" | null> => "connected");
const envMock = vi.fn((): { valkeyUrl: string | null } => ({ valkeyUrl: null }));

vi.mock("../../infra/postgres.js", () => ({
  getPool: () => ({ query: queryMock }),
}));
vi.mock("../../websocket/presence.js", () => ({
  viewerCount: (roomId: string) => viewerCountMock(roomId),
}));
vi.mock("./start.js", () => ({
  expireAbandonedLives: () => expireMock(),
}));
vi.mock("./hostGrace.js", () => ({
  getHostPresence: (roomId: string) => getHostPresenceMock(roomId),
}));
vi.mock("../../infra/env.js", () => ({
  env: () => envMock(),
}));

import { queryLiveStreams } from "./query.js";

const row = {
  id: "44444444-4444-4444-8444-444444444444",
  room_id: "33333333-3333-4333-8333-333333333333",
  host_id: "33333333-3333-4333-8333-333333333333",
  display_name: "Host",
  username: "host",
  avatar_url: null,
  title: "LIVE",
  started_at: new Date("2026-08-21T00:00:00.000Z"),
};

describe("PAGE-017 live list eligibility", () => {
  beforeEach(() => {
    queryMock.mockReset();
    viewerCountMock.mockClear();
    expireMock.mockClear();
    getHostPresenceMock.mockReset();
    getHostPresenceMock.mockResolvedValue("connected");
    envMock.mockReturnValue({ valkeyUrl: null });
    queryMock.mockResolvedValue({ rows: [row] });
  });

  it("lists Neon live rows and does not use LiveKit emptiness as authority", async () => {
    const streams = await queryLiveStreams(null);
    expect(expireMock).toHaveBeenCalled();
    expect(streams).toHaveLength(1);
    expect(streams[0]?.roomId).toBe(row.room_id);
    expect(streams[0]?.viewerCount).toBe(4);
    expect(getHostPresenceMock).not.toHaveBeenCalled();
  });

  it("keeps a host listed during Valkey grace even with no LiveKit publishers", async () => {
    envMock.mockReturnValue({ valkeyUrl: "redis://127.0.0.1:6379" });
    getHostPresenceMock.mockResolvedValue("grace");
    const streams = await queryLiveStreams(null);
    expect(streams).toHaveLength(1);
    expect(getHostPresenceMock).toHaveBeenCalledWith(row.room_id);
  });

  it("hides a Neon live row after Valkey host presence is gone", async () => {
    envMock.mockReturnValue({ valkeyUrl: "redis://127.0.0.1:6379" });
    getHostPresenceMock.mockResolvedValue(null);
    const streams = await queryLiveStreams(null);
    expect(streams).toEqual([]);
  });
});
