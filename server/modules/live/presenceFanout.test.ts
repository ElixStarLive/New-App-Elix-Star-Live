import { describe, expect, it, vi } from "vitest";

vi.mock("../../infra/env.js", () => ({
  env: () => ({ valkeyUrl: null, isProduction: false }),
}));
vi.mock("../../infra/valkey.js", () => ({
  valkeyPub: () => ({ publish: vi.fn() }),
  valkeySub: () => ({ subscribe: vi.fn(), on: vi.fn() }),
}));
vi.mock("../../infra/logger.js", () => ({
  logger: { warn: vi.fn(), error: vi.fn() },
}));

import { addPresenceSocket, broadcastLivePresence, removePresenceSocket } from "./presenceFanout.js";

describe("PAGE-018 live presence fanout", () => {
  it("delivers stream_started to every attached socket, not only one room", async () => {
    const sent: string[] = [];
    const ws = {
      readyState: 1,
      OPEN: 1,
      send(payload: string) {
        sent.push(payload);
      },
    };
    addPresenceSocket(ws as never);
    try {
      await broadcastLivePresence("stream_started", { roomId: "host-1", streamId: "stream-1" });
      expect(sent).toHaveLength(1);
      expect(JSON.parse(sent[0] ?? "{}")).toMatchObject({
        event: "stream_started",
        data: { roomId: "host-1", streamId: "stream-1" },
      });
    } finally {
      removePresenceSocket(ws as never);
    }
  });
});
