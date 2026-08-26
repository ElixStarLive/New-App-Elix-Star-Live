// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./api", () => ({
  getWsUrl: () => "wss://ws.example.com",
}));

import { wsClient } from "./wsClient";

type Handler = ((event: unknown) => void) | null;

class FakeSocket {
  static instances: FakeSocket[] = [];
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readyState = FakeSocket.CONNECTING;
  sent: string[] = [];
  onopen: Handler = null;
  onmessage: Handler = null;
  onerror: Handler = null;
  onclose: Handler = null;

  constructor(readonly url: string) {
    FakeSocket.instances.push(this);
  }

  send(payload: string): void {
    this.sent.push(payload);
  }

  close(): void {
    this.readyState = FakeSocket.CLOSED;
  }

  open(): void {
    this.readyState = FakeSocket.OPEN;
    this.onopen?.({});
  }

  receive(payload: unknown): void {
    this.onmessage?.({ data: typeof payload === "string" ? payload : JSON.stringify(payload) });
  }

  fail(): void {
    this.onerror?.({});
  }

  closeWith(code: number): void {
    this.readyState = FakeSocket.CLOSED;
    this.onclose?.({ code });
  }
}

function latest(): FakeSocket {
  const socket = FakeSocket.instances.at(-1);
  if (!socket) throw new Error("no socket was opened");
  return socket;
}

function sentEvents(socket: FakeSocket): string[] {
  return socket.sent.map((raw) => (JSON.parse(raw) as { event: string }).event);
}

describe("wsClient", () => {
  beforeEach(() => {
    vi.stubGlobal("WebSocket", FakeSocket);
    FakeSocket.instances = [];
    vi.useFakeTimers();
  });

  afterEach(() => {
    wsClient.disconnect();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("builds the room url with encoded room, token and audience", () => {
    wsClient.connect("room 1", "tok/en", { audienceCreatorId: "creator 7" });
    expect(latest().url).toBe(
      "wss://ws.example.com/live/room%201?token=tok%2Fen&audienceCreatorId=creator%207",
    );
    expect(wsClient.getCurrentRoomId()).toBe("room 1");
    expect(wsClient.isConnected()).toBe(false);
    latest().open();
    expect(wsClient.isConnected()).toBe(true);
  });

  it("reuses the live transport for the same room", () => {
    wsClient.connect("room-1", "tok");
    latest().open();
    wsClient.connect("room-1", "tok");
    expect(FakeSocket.instances).toHaveLength(1);
  });

  it("replaces the transport when switching rooms", () => {
    wsClient.connect("room-1", "tok", { audienceCreatorId: "c1" });
    latest().open();
    const first = latest();
    wsClient.connect("room-2", "tok");
    expect(FakeSocket.instances).toHaveLength(2);
    expect(first.readyState).toBe(FakeSocket.CLOSED);
    expect(latest().url).not.toContain("audienceCreatorId");
  });

  it("queues sends until the socket opens, then flushes them in order", () => {
    wsClient.connect("room-1", "tok");
    wsClient.send("join", { roomId: "room-1" });
    wsClient.send("chat", { text: "hi" });
    expect(latest().sent).toHaveLength(0);
    latest().open();
    expect(sentEvents(latest())).toEqual(["join", "chat"]);
    wsClient.send("chat", { text: "again" });
    expect(sentEvents(latest())).toEqual(["join", "chat", "chat"]);
  });

  it("emits connected on open and delivers events to listeners only while subscribed", () => {
    const connected = vi.fn();
    const chat = vi.fn();
    wsClient.on("connected", connected);
    wsClient.on("chat_message", chat);
    wsClient.connect("room-1", "tok");
    latest().open();
    expect(connected).toHaveBeenCalledTimes(1);

    latest().receive({ event: "chat_message", data: { text: "hi" }, timestamp: "2026-01-01T00:00:00.000Z" });
    expect(chat).toHaveBeenCalledWith({ text: "hi" });

    wsClient.off("chat_message", chat);
    latest().receive({ event: "chat_message", data: { text: "ignored" } });
    expect(chat).toHaveBeenCalledTimes(1);
    wsClient.off("connected", connected);
  });

  it("ignores malformed frames", () => {
    const chat = vi.fn();
    wsClient.on("chat_message", chat);
    wsClient.connect("room-1", "tok");
    latest().open();
    latest().receive("{not json");
    latest().receive({ data: { text: "no event name" } });
    latest().receive({ event: 42 });
    latest().receive("null");
    expect(chat).not.toHaveBeenCalled();
    wsClient.off("chat_message", chat);
  });

  it("emits ws_error with the current room on transport errors", () => {
    const onError = vi.fn();
    wsClient.on("ws_error", onError);
    wsClient.connect("room-1", "tok");
    latest().fail();
    expect(onError).toHaveBeenCalledWith({ roomId: "room-1" });
    wsClient.off("ws_error", onError);
  });

  it("sends a keepalive ping while the socket stays open", () => {
    wsClient.connect("room-1", "tok");
    latest().open();
    vi.advanceTimersByTime(25_000);
    expect(sentEvents(latest())).toEqual(["ping"]);
    vi.advanceTimersByTime(25_000);
    expect(sentEvents(latest())).toEqual(["ping", "ping"]);
  });

  it("does not reconnect after a clean close of a non-persistent room", () => {
    wsClient.connect("room-1", "tok");
    latest().open();
    latest().closeWith(1000);
    vi.advanceTimersByTime(60_000);
    expect(FakeSocket.instances).toHaveLength(1);
  });

  it("reconnects with exponential backoff after an unclean close", () => {
    wsClient.connect("room-1", "tok");
    latest().open();
    latest().closeWith(1006);
    vi.advanceTimersByTime(999);
    expect(FakeSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(FakeSocket.instances).toHaveLength(2);

    latest().closeWith(1006);
    vi.advanceTimersByTime(1_999);
    expect(FakeSocket.instances).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(FakeSocket.instances).toHaveLength(3);
  });

  it("reconnects a persistent room even after a clean close", () => {
    wsClient.connect("room-1", "tok", { persistent: true });
    latest().open();
    latest().closeWith(1000);
    vi.advanceTimersByTime(1_000);
    expect(FakeSocket.instances).toHaveLength(2);
  });

  it("gives up after 15 attempts and emits ws_reconnect_exhausted", () => {
    const exhausted = vi.fn();
    wsClient.on("ws_reconnect_exhausted", exhausted);
    wsClient.connect("room-1", "tok");
    latest().open();
    for (let attempt = 0; attempt < 16; attempt += 1) {
      latest().closeWith(1006);
      vi.advanceTimersByTime(15_000);
    }
    expect(FakeSocket.instances).toHaveLength(16);
    expect(exhausted).toHaveBeenCalledWith({ roomId: "room-1" });
    latest().closeWith(1006);
    vi.advanceTimersByTime(60_000);
    expect(FakeSocket.instances).toHaveLength(16);
    wsClient.off("ws_reconnect_exhausted", exhausted);
  });

  it("keeps the connection while another owner still claims the room", () => {
    wsClient.connect("room-1", "tok", { ownerId: "player" });
    wsClient.connect("room-1", "tok", { ownerId: "chat" });
    latest().open();
    wsClient.disconnect("player");
    expect(wsClient.getCurrentRoomId()).toBe("room-1");
    wsClient.disconnect("chat");
    expect(wsClient.getCurrentRoomId()).toBeNull();
    expect(wsClient.isConnected()).toBe(false);
  });

  it("drops owners of a previous room when the room changes", () => {
    wsClient.connect("room-1", "tok", { ownerId: "player" });
    latest().open();
    wsClient.connect("room-2", "tok", { ownerId: "player2" });
    wsClient.disconnect("player2");
    expect(wsClient.getCurrentRoomId()).toBeNull();
  });

  it("reopens on foreground only when the socket is not open", () => {
    wsClient.reconnectOnForeground();
    expect(FakeSocket.instances).toHaveLength(0);

    wsClient.connect("room-1", "tok");
    latest().open();
    wsClient.reconnectOnForeground();
    expect(FakeSocket.instances).toHaveLength(1);

    latest().readyState = FakeSocket.CLOSED;
    wsClient.reconnectOnForeground();
    expect(FakeSocket.instances).toHaveLength(2);
  });
});
