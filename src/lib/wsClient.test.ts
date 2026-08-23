/** @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { setSessionToken } from "./sessionToken";
import { wsClient } from "./wsClient";

vi.mock("./api", () => ({
  getWsUrl: () => "wss://test.elix.local",
}));

const constructedUrls: string[] = [];
const instances: MockWebSocket[] = [];

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  onopen: ((ev?: unknown) => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onerror: ((ev?: unknown) => void) | null = null;
  onclose: ((ev?: { code?: number }) => void) | null = null;
  sent: string[] = [];

  constructor(url: string) {
    constructedUrls.push(url);
    instances.push(this);
    queueMicrotask(() => {
      this.readyState = MockWebSocket.OPEN;
      this.onopen?.({});
    });
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code: 1000 });
  }

  drop() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code: 1006 });
  }

  emit(event: string, data: unknown) {
    this.onmessage?.({
      data: JSON.stringify({ event, data, timestamp: new Date().toISOString() }),
    });
  }
}

const lastSocket = () => instances[instances.length - 1];

(globalThis as unknown as { WebSocket: typeof MockWebSocket }).WebSocket = MockWebSocket;

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe("PAGE-006 wsClient singleton owner handoff", () => {
  beforeEach(() => {
    constructedUrls.length = 0;
    instances.length = 0;
    setSessionToken("fresh-jwt");
    wsClient.disconnect();
  });

  it("old owner cannot disconnect newer same-room owner", async () => {
    wsClient.connect("123", "t1", { ownerId: "inline-A" });
    await flush();
    wsClient.connect("123", "t2", { ownerId: "watch-A" });
    await flush();

    wsClient.disconnect("inline-A");
    expect(wsClient.isConnected()).toBe(true);

    wsClient.disconnect("watch-A");
    expect(wsClient.isConnected()).toBe(false);
  });

  it("A cleanup cannot disconnect room owned by B", async () => {
    wsClient.connect("A-room", "tA", { ownerId: "inline-A" });
    await flush();
    wsClient.connect("B-room", "tB", { ownerId: "inline-B" });
    await flush();
    expect(wsClient.getCurrentRoomId()).toBe("B-room");

    wsClient.disconnect("inline-A");
    expect(wsClient.getCurrentRoomId()).toBe("B-room");
    expect(wsClient.isConnected()).toBe(true);
  });

  it("room switch transfers ownership without wiping the new room owner", async () => {
    wsClient.connect("room-a", "tA", { ownerId: "owner-a" });
    await flush();
    wsClient.connect("room-b", "tB", { ownerId: "owner-b" });
    await flush();
    expect(wsClient.getCurrentRoomId()).toBe("room-b");
    wsClient.disconnect("owner-a");
    expect(wsClient.isConnected()).toBe(true);
    expect(wsClient.getCurrentRoomId()).toBe("room-b");
  });

  it("the new room owner can still release the socket after a room switch", async () => {
    wsClient.connect("room-a", "tA", { ownerId: "owner-a" });
    await flush();
    wsClient.connect("room-b", "tB", { ownerId: "owner-b" });
    await flush();

    wsClient.disconnect("owner-b");
    expect(wsClient.isConnected()).toBe(false);
    expect(wsClient.getCurrentRoomId()).toBe(null);
  });

  it("releases a stale claim from the room it left instead of keeping it forever", async () => {
    wsClient.connect("room-a", "tA", { ownerId: "owner-a" });
    await flush();
    wsClient.connect("room-b", "tB", { ownerId: "owner-b" });
    await flush();
    wsClient.connect("room-a", "tA2", { ownerId: "owner-c" });
    await flush();

    wsClient.disconnect("owner-c");
    expect(wsClient.isConnected()).toBe(false);
  });

  it("foreground reconnect uses the current session token, not the connect-time token", async () => {
    vi.useFakeTimers();
    try {
      wsClient.connect("room-x", "stale-jwt", { ownerId: "owner-x" });
      await flush();
      expect(constructedUrls[0]).toContain("stale-jwt");

      setSessionToken("rotated-jwt");
      lastSocket().drop();

      wsClient.reconnectOnForeground();
      await flush();

      expect(constructedUrls[constructedUrls.length - 1]).toContain("rotated-jwt");
      expect(constructedUrls[constructedUrls.length - 1]).not.toContain("stale-jwt");
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });
});

describe("PAGE-006 wsClient lifecycle", () => {
  beforeEach(() => {
    constructedUrls.length = 0;
    instances.length = 0;
    setSessionToken("fresh-jwt");
    wsClient.disconnect();
  });

  it("a role change on the same room does not replace the socket", async () => {
    wsClient.connect("stream-9", "t", { ownerId: "spectator-1" });
    await flush();
    wsClient.connect("stream-9", "t", { ownerId: "cohost-1", persistent: true });
    await flush();

    expect(instances).toHaveLength(1);
    expect(wsClient.isConnected()).toBe(true);

    wsClient.disconnect("spectator-1");
    expect(wsClient.isConnected()).toBe(true);
    expect(wsClient.getCurrentRoomId()).toBe("stream-9");
  });

  it("never reconnects after an intentional disconnect", async () => {
    vi.useFakeTimers();
    try {
      wsClient.connect("room-1", "t", { ownerId: "o1" });
      await flush();
      wsClient.disconnect();

      await vi.advanceTimersByTimeAsync(120_000);
      await flush();

      expect(instances).toHaveLength(1);
      expect(wsClient.getCurrentRoomId()).toBe(null);
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it("cannot be revived by a backoff timer armed before the user left", async () => {
    vi.useFakeTimers();
    try {
      wsClient.connect("room-1", "t", { ownerId: "o1" });
      await flush();
      lastSocket().drop();
      wsClient.disconnect("o1");

      await vi.advanceTimersByTimeAsync(120_000);
      await flush();

      expect(instances).toHaveLength(1);
      expect(wsClient.getCurrentRoomId()).toBe(null);
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it("does not replay a queued message into a different room", async () => {
    vi.useFakeTimers();
    try {
      wsClient.connect("room-a", "t", { ownerId: "o-a" });
      await flush();
      lastSocket().drop();

      wsClient.send("chat_message", { text: "belongs-to-room-a" });

      wsClient.connect("room-b", "t", { ownerId: "o-b" });
      await flush();

      expect(lastSocket().sent.join("|")).not.toContain("belongs-to-room-a");
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it("still flushes a queued message after reconnecting to the same room", async () => {
    vi.useFakeTimers();
    try {
      wsClient.connect("room-a", "t", { ownerId: "o-a" });
      await flush();
      lastSocket().drop();

      wsClient.send("chat_message", { text: "same-room-retry" });
      await vi.advanceTimersByTimeAsync(2000);
      await flush();

      expect(lastSocket().sent.join("|")).toContain("same-room-retry");
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it("bounds the pending queue", async () => {
    wsClient.connect("room-a", "t", { ownerId: "o-a" });
    for (let i = 0; i < 80; i++) wsClient.send("chat_message", { i });
    await flush();
    expect(lastSocket().sent.length).toBe(50);
  });

  it("ignores a malformed frame without killing the socket", async () => {
    wsClient.connect("room-1", "t", { ownerId: "o1" });
    await flush();

    const seen: string[] = [];
    const handler = () => seen.push("hit");
    wsClient.on("chat_message", handler);

    lastSocket().onmessage?.({ data: "{not json" });
    expect(seen).toHaveLength(0);
    expect(wsClient.isConnected()).toBe(true);

    lastSocket().emit("chat_message", {});
    expect(seen).toHaveLength(1);
    wsClient.off("chat_message", handler);
  });
});
