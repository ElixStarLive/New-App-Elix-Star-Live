import type { WsEventName } from "@shared/contracts";
import { getWsUrl } from "./api";
import { getSessionToken } from "./sessionToken";

export type WsListener = (data: unknown) => void;

type ConnectOptions = {
  persistent?: boolean;
  audienceCreatorId?: string;
  ownerId?: string;
};

type WsEnvelope = {
  event: string;
  data: unknown;
  timestamp: string;
};

const MAX_RECONNECT_ATTEMPTS = 15;
const BASE_RECONNECT_MS = 1000;
const KEEPALIVE_MS = 25_000;
const MAX_PENDING = 50;

class WsClient {
  private socket: WebSocket | null = null;
  private roomId: string | null = null;
  private token: string | null = null;
  private persistent = false;
  private audienceCreatorId: string | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private keepAliveTimer: ReturnType<typeof setInterval> | null = null;
  private pending: string[] = [];
  private listeners = new Map<string, Set<WsListener>>();
  private owners = new Map<string, string>();

  getCurrentRoomId(): string | null {
    return this.roomId;
  }

  isConnected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  on(event: WsEventName | string, listener: WsListener): void {
    const set = this.listeners.get(event) ?? new Set<WsListener>();
    set.add(listener);
    this.listeners.set(event, set);
  }

  off(event: WsEventName | string, listener: WsListener): void {
    this.listeners.get(event)?.delete(listener);
  }

  send(event: WsEventName | string, data: unknown = {}): void {
    const payload = JSON.stringify({
      event,
      data,
      timestamp: new Date().toISOString(),
    });
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(payload);
      return;
    }
    if (this.pending.length >= MAX_PENDING) return;
    this.pending.push(payload);
  }

  connect(roomId: string, token: string, options?: ConnectOptions): void {
    const nextOwner = options?.ownerId?.trim() ?? "";
    if (nextOwner) this.owners.set(nextOwner, roomId);

    const providedAudience =
      options?.audienceCreatorId !== undefined
        ? options.audienceCreatorId.trim() || null
        : undefined;

    if (providedAudience !== undefined) this.audienceCreatorId = providedAudience;

    const transportLive =
      this.socket?.readyState === WebSocket.OPEN ||
      this.socket?.readyState === WebSocket.CONNECTING;

    if (this.roomId === roomId && transportLive) {
      this.persistent = options?.persistent ?? this.persistent;
      return;
    }

    if (this.roomId !== null && this.roomId !== roomId) {
      this.teardownTransport();
      this.releaseOwnersOtherThan(roomId);
      this.audienceCreatorId = providedAudience ?? null;
      this.persistent = false;
      // Queued frames belong to the room we left — never flush into the next room.
      this.pending = [];
    }

    this.roomId = roomId;
    this.token = token;
    this.persistent = options?.persistent ?? this.persistent;
    this.openSocket();
  }

  disconnect(ownerId?: string): void {
    if (ownerId) {
      this.owners.delete(ownerId);
      if (this.owners.size > 0) return;
    } else {
      this.owners.clear();
    }
    this.teardownTransport();
    this.roomId = null;
    this.token = null;
    this.persistent = false;
    this.audienceCreatorId = null;
    this.pending = [];
  }

  reconnectOnForeground(): void {
    if (!this.roomId) return;
    if (
      this.socket?.readyState === WebSocket.OPEN ||
      this.socket?.readyState === WebSocket.CONNECTING
    ) {
      return;
    }
    const token = getSessionToken() || this.token;
    if (!token) return;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempts = 0;
    this.token = token;
    this.openSocket();
  }

  private openSocket(): void {
    if (!this.roomId || !this.token) return;
    this.teardownTransport();
    const audienceQs = this.audienceCreatorId
      ? `&audienceCreatorId=${encodeURIComponent(this.audienceCreatorId)}`
      : "";
    const url = `${getWsUrl()}/live/${encodeURIComponent(this.roomId)}?token=${encodeURIComponent(this.token)}${audienceQs}`;
    const socket = new WebSocket(url);
    this.socket = socket;

    socket.onopen = () => {
      this.reconnectAttempts = 0;
      while (this.pending.length > 0) {
        const msg = this.pending.shift();
        if (msg) socket.send(msg);
      }
      this.startKeepAlive();
      this.dispatch({ event: "connected", data: {}, timestamp: new Date().toISOString() });
    };

    socket.onmessage = (event) => {
      let message: WsEnvelope;
      try {
        const parsed: unknown = JSON.parse(String(event.data));
        if (!parsed || typeof parsed !== "object" || !("event" in parsed)) return;
        const rec = parsed as { event: unknown; data?: unknown; timestamp?: unknown };
        if (typeof rec.event !== "string") return;
        message = {
          event: rec.event,
          data: rec.data,
          timestamp: typeof rec.timestamp === "string" ? rec.timestamp : new Date().toISOString(),
        };
      } catch {
        return;
      }
      this.dispatch(message);
    };

    socket.onerror = () => {
      this.dispatch({
        event: "ws_error",
        data: { roomId: this.roomId },
        timestamp: new Date().toISOString(),
      });
    };

    socket.onclose = (event) => {
      this.attemptReconnect(event.code);
    };
  }

  private startKeepAlive(): void {
    if (this.keepAliveTimer) clearInterval(this.keepAliveTimer);
    this.keepAliveTimer = setInterval(() => {
      if (this.socket?.readyState === WebSocket.OPEN) this.send("ping", {});
    }, KEEPALIVE_MS);
  }

  private teardownTransport(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
    if (this.socket) {
      this.socket.onopen = null;
      this.socket.onmessage = null;
      this.socket.onerror = null;
      this.socket.onclose = null;
      try {
        this.socket.close();
      } catch {
        /* already closed */
      }
      this.socket = null;
    }
  }

  private releaseOwnersOtherThan(roomId: string): void {
    for (const [owner, claimedRoom] of [...this.owners.entries()]) {
      if (claimedRoom !== roomId) this.owners.delete(owner);
    }
  }

  private attemptReconnect(code: number): void {
    if (code === 1000 && !this.persistent) return;
    if (!this.roomId) return;
    const token = getSessionToken() || this.token;
    if (!token) return;
    this.token = token;
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      this.dispatch({
        event: "ws_reconnect_exhausted",
        data: { roomId: this.roomId },
        timestamp: new Date().toISOString(),
      });
      return;
    }
    const delay = Math.min(BASE_RECONNECT_MS * 2 ** this.reconnectAttempts, 15_000);
    this.reconnectAttempts += 1;
    this.reconnectTimer = setTimeout(() => this.openSocket(), delay);
  }

  private dispatch(message: WsEnvelope): void {
    const set = this.listeners.get(message.event);
    if (!set) return;
    for (const listener of set) listener(message.data);
  }
}

export const wsClient = new WsClient();
