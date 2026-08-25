import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage, Server } from "node:http";
import { randomUUID } from "node:crypto";
import { verifyAccessToken } from "../infra/tokens.js";
import { getPool } from "../infra/postgres.js";
import { logger } from "../infra/logger.js";
import { env } from "../infra/env.js";
import { valkeyPub, valkeySub } from "../infra/valkey.js";
import { wsEnvelopeSchema, chatMessageDataSchema, heartSentDataSchema } from "../../shared/contracts/realtime.js";
import { assignSeat, releaseSeat, requireCohostTarget, setBigScreen, markSeatLive } from "../modules/cohost/state.js";
import { loadCohost, saveCohost, withCohostLock } from "../modules/cohost/runtime.js";
import { canStart, emptyBattle, startBattle } from "../modules/battle/state.js";
import { loadBattle, persistEndedBattle, publishRoom, saveBattle, tickAndStoreBattle } from "../modules/battle/runtime.js";
import { addViewer, removeViewer, viewerCount } from "./presence.js";
import { addPresenceSocket, initLivePresenceFanout, removePresenceSocket } from "../modules/live/presenceFanout.js";
import { addHostConnection, markHostConnected, removeHostConnection } from "../modules/live/hostGrace.js";
import type { BattleSeat } from "../../shared/contracts/realtime.js";
import { clearGiftGoal, getGiftGoal, setGiftGoal } from "../modules/gifts/goal.js";
import { handleCallSignal } from "../modules/calls/signaling.js";
import { recordCreatorWatchProgress, spawnTreasureChest } from "../modules/engagement/collections.js";

type SocketClient = {
  ws: WebSocket;
  userId: string;
  roomId: string;
  connectionId: string;
  connectedAtMs: number;
  hostId: string | null;
};

const localSockets = new Map<WebSocket, SocketClient>();
const LIVE_WATCH_MINUTES_PER_REWARD = 1;
const INSTANCE_ID = randomUUID();
const USER_EVENT_CHANNEL = "user:events";

function send(ws: WebSocket, event: string, data: unknown): void {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ event, data, timestamp: new Date().toISOString() }));
}

function userEnvelope(event: string, data: unknown): string {
  return JSON.stringify({ event, data, timestamp: new Date().toISOString() });
}

export function sendToUserLocal(userId: string, event: string, data: unknown): number {
  const payload = userEnvelope(event, data);
  let delivered = 0;
  for (const client of localSockets.values()) {
    if (client.userId !== userId || client.ws.readyState !== WebSocket.OPEN) continue;
    client.ws.send(payload);
    delivered += 1;
  }
  return delivered;
}

export async function sendToUserGlobal(userId: string, event: string, data: unknown): Promise<void> {
  sendToUserLocal(userId, event, data);
  if (!env().valkeyUrl) return;
  await valkeyPub().publish(
    USER_EVENT_CHANNEL,
    JSON.stringify({ sourceInstance: INSTANCE_ID, userId, event, data }),
  );
}

export function disconnectUserSessions(userId: string, reason = "Password changed"): number {
  let closed = 0;
  for (const client of [...localSockets.values()]) {
    if (client.userId !== userId) continue;
    send(client.ws, "force_disconnect", { reason });
    client.ws.close(4001, reason);
    closed += 1;
  }
  return closed;
}

async function fanout(roomId: string, event: string, data: unknown): Promise<void> {
  if (roomId === "__feed__") return;
  try {
    await publishRoom(roomId, event, data);
  } catch (error) {
    logger.warn({ err: error, roomId, event }, "room fanout failed");
  }
}

async function emitViewerCount(roomId: string): Promise<void> {
  const count = await viewerCount(roomId);
  await fanout(roomId, "viewer_count", { streamId: roomId, count });
}

function parseRoomId(req: IncomingMessage): string {
  const url = new URL(req.url ?? "", "http://localhost");
  const fromQuery = url.searchParams.get("room") ?? "";
  const parts = url.pathname.split("/").filter(Boolean);
  const fromPath = parts[0] === "live" && parts[1] ? decodeURIComponent(parts[1]) : "";
  return fromPath || fromQuery;
}

async function liveHostId(roomId: string): Promise<string | null> {
  const stream = await getPool().query<{ host_id: string }>(
    `SELECT host_id FROM live_streams WHERE (room_id = $1 OR id::text = $1) AND status = 'live' LIMIT 1`,
    [roomId],
  );
  return stream.rows[0]?.host_id ?? null;
}

export function attachWebSocket(server: Server): void {
  const wss = new WebSocketServer({ noServer: true });
  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "", "http://localhost");
    if (!url.pathname.startsWith("/live")) return;
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });
  if (env().valkeyUrl) {
    const sub = valkeySub();
    void sub.psubscribe("room:*");
    void sub.subscribe(USER_EVENT_CHANNEL);
    sub.on("pmessage", (_pattern, channel, message) => {
      const roomId = channel.slice("room:".length);
      for (const client of localSockets.values()) {
        if (client.roomId === roomId && client.ws.readyState === WebSocket.OPEN) {
          client.ws.send(message);
        }
      }
    });
    sub.on("message", (channel, message) => {
      if (channel !== USER_EVENT_CHANNEL) return;
      try {
        const parsed = JSON.parse(message) as {
          sourceInstance?: string;
          userId?: string;
          event?: string;
          data?: unknown;
        };
        if (parsed.sourceInstance === INSTANCE_ID) return;
        if (typeof parsed.userId !== "string" || typeof parsed.event !== "string") return;
        sendToUserLocal(parsed.userId, parsed.event, parsed.data);
      } catch (error) {
        logger.warn({ err: error }, "user event fanout parse failed");
      }
    });
  }

  wss.on("connection", (ws, req: IncomingMessage) => {
    void handleConnection(ws, req);
  });
  initLivePresenceFanout();
}

async function handleConnection(ws: WebSocket, req: IncomingMessage): Promise<void> {
  const url = new URL(req.url ?? "", "http://localhost");
  const token = url.searchParams.get("token") ?? "";
  const roomId = parseRoomId(req);
  const claims = await verifyAccessToken(token);
  if (!claims || !roomId) {
    ws.close(1008, "unauthorized");
    return;
  }
  
  const { rows } = await getPool().query<{ revoked_at: Date | null; banned_until: Date | null }>(
        `SELECT s.revoked_at, u.banned_until
         FROM auth_sessions s JOIN users u ON u.id = s.user_id
         WHERE s.id = $1 AND s.user_id = $2`,
        [claims.sessionId, claims.userId],
      );
  if (!rows[0] || rows[0].revoked_at || (rows[0].banned_until && rows[0].banned_until > new Date())) {
    ws.close(1008, "unauthorized");
    return;
  }
  const connectionId = `${claims.userId}:${randomUUID()}`;
  localSockets.set(ws, {
    ws,
    userId: claims.userId,
    roomId,
    connectionId,
    connectedAtMs: Date.now(),
    hostId: null,
  });
  addPresenceSocket(ws);
  const isFeed = roomId === "__feed__";
  if (!isFeed && !env().valkeyUrl) {
    send(ws, "error", { message: "realtime_unavailable" });
    ws.close(1013, "realtime_unavailable");
    localSockets.delete(ws);
    removePresenceSocket(ws);
    return;
  }
  const hostId = isFeed ? null : await liveHostId(roomId);
  const connected = localSockets.get(ws);
  if (connected) connected.hostId = hostId;
  const isHost = Boolean(hostId && hostId === claims.userId);
  const countsAsViewer = !isFeed && !isHost;
  if (isHost) {
    await addHostConnection(roomId, connectionId);
  }
  if (countsAsViewer) {
    await addViewer(roomId, connectionId);
  }
  send(ws, "connected", { roomId, userId: claims.userId });
  if (!isFeed) {
    const existingGoal = await getGiftGoal(roomId);
    if (existingGoal) send(ws, "gift_goal_sync", existingGoal);
    if (hostId) {
      const cohost = await loadCohost(roomId, hostId);
      send(ws, "cohost_layout_sync", {
        streamId: roomId,
        bigScreenUserId: cohost.bigScreenUserId,
        seats: cohost.seats,
      });
    }
    const battle = await loadBattle(roomId);
    if (battle) send(ws, "battle_state_sync", battle);
    await fanout(roomId, "user_joined", { userId: claims.userId });
    await emitViewerCount(roomId);
  }

  ws.on("message", (raw) => {
    void (async () => {
      try {
        const parsed = wsEnvelopeSchema.safeParse(JSON.parse(String(raw)));
        if (!parsed.success) {
          send(ws, "error", { message: "invalid_event" });
          return;
        }
        await handleEvent(claims.userId, roomId, parsed.data.event, parsed.data.data, ws);
      } catch (error) {
        logger.warn({ err: error }, "ws handler failed");
        send(ws, "error", { message: "handler_failed" });
      }
    })();
  });

  ws.on("close", () => {
    const closed = localSockets.get(ws);
    localSockets.delete(ws);
    removePresenceSocket(ws);
    if (isHost) {
      void removeHostConnection(roomId, connectionId);
    }
    if (countsAsViewer) {
      void removeViewer(roomId, connectionId).then(() => emitViewerCount(roomId)).catch((error) => {
        logger.warn({ err: error, roomId }, "viewer leave failed");
      });

      if (closed?.hostId && closed.hostId !== claims.userId) {
        const watchedMs = Math.max(0, Date.now() - closed.connectedAtMs);
        const watchedMinutes = Math.floor(watchedMs / 60_000);
        if (watchedMinutes >= LIVE_WATCH_MINUTES_PER_REWARD) {
          void recordCreatorWatchProgress(claims.userId, closed.hostId, watchedMinutes).catch((error) => {
            logger.warn({ err: error, roomId, userId: claims.userId }, "creator watch progress failed");
          });
          void spawnTreasureChest(claims.userId, "chest_common_watch", "live_watch").catch((error) => {
            logger.warn({ err: error, roomId, userId: claims.userId }, "live watch chest spawn failed");
          });
        }
      }
    }
    if (!isFeed) void fanout(roomId, "user_left", { userId: claims.userId });
  });
}

async function handleEvent(
  userId: string,
  roomId: string,
  event: string,
  data: unknown,
  ws: WebSocket,
): Promise<void> {
  if (event === "ping") {
    send(ws, "pong", {});
    if (roomId === userId) void markHostConnected(roomId);
    return;
  }
  if (event === "chat_message") {
    const { rows } = await getPool().query<{ display_name: string }>(`SELECT display_name FROM users WHERE id = $1`, [
      userId,
    ]);
    const payload = chatMessageDataSchema.parse({
      displayName: rows[0]?.display_name ?? "",
      ...(typeof data === "object" && data ? data : {}),
      streamId: roomId,
      userId,
    });
    await fanout(roomId, "chat_message", payload);
    return;
  }
  if (event === "heart_sent") {
    heartSentDataSchema.parse({ streamId: roomId, userId });
    await fanout(roomId, "heart_sent", { streamId: roomId, userId });
    return;
  }
  if (event === "gift_goal_set" || event === "gift_goal_clear") {
    await handleGiftGoal(userId, roomId, event, data);
    return;
  }
  if (event.startsWith("cohost_")) {
    await handleCohost(userId, roomId, event, data, ws);
    return;
  }
  if (event.startsWith("battle_")) {
    await handleBattle(userId, roomId, event, data);
    return;
  }
  if (event === "call_invite" || event === "call_accepted" || event === "call_rejected" || event === "call_ended") {
    const fanout = await handleCallSignal(userId, event, data);
    for (const item of fanout.items) {
      await sendToUserGlobal(item.userId, item.event, item.data);
    }
  }
}

async function handleGiftGoal(userId: string, roomId: string, event: string, data: unknown): Promise<void> {
  const hostId = await liveHostId(roomId);
  if (hostId !== userId) return;
  if (event === "gift_goal_clear") {
    await clearGiftGoal(roomId);
    await fanout(roomId, "gift_goal_sync", null);
    return;
  }
  const body = typeof data === "object" && data ? (data as Record<string, unknown>) : {};
  const giftId = typeof body.giftId === "string" ? body.giftId : "";
  const targetCount = Math.max(1, Math.min(20_000, Math.floor(Number(body.targetCount) || 1)));
  const gift = await getPool().query<{ name: string; animation_url: string | null }>(
    `SELECT name, animation_url FROM gifts WHERE id = $1 AND active = TRUE`,
    [giftId],
  );
  if (!gift.rows[0]) return;
  const goal = await setGiftGoal(roomId, {
    giftId,
    giftName: gift.rows[0].name,
    giftIcon: gift.rows[0].animation_url ?? "",
    targetCount,
    currentCount: 0,
  });
  await fanout(roomId, "gift_goal_sync", goal);
}

async function handleCohost(
  userId: string,
  roomId: string,
  event: string,
  data: unknown,
  ws: WebSocket,
): Promise<void> {
  const hostId = await liveHostId(roomId);
  if (!hostId) return;
  await withCohostLock(roomId, async () => {
    let state = await loadCohost(roomId, hostId);
    const body = typeof data === "object" && data ? (data as Record<string, unknown>) : {};
    const requestedTarget = typeof body.userId === "string" ? body.userId : "";
    if (event === "cohost_request_send" && userId !== hostId) {
      if (!state.requests.some((row) => row.userId === userId) && !state.seats.some((row) => row.userId === userId)) {
        const { rows } = await getPool().query<{ display_name: string }>(`SELECT display_name FROM users WHERE id = $1`, [
          userId,
        ]);
        state = { ...state, requests: [...state.requests, { userId, displayName: rows[0]?.display_name ?? "" }] };
        await fanout(roomId, "cohost_request", { userId, displayName: rows[0]?.display_name ?? "" });
      }
    }
    if (event === "cohost_invite_accept" && userId !== hostId) {
      try {
        state = markSeatLive(state, userId);
      } catch (error) {
        send(ws, "error", { message: error instanceof Error ? error.message : "cohost_failed" });
        return;
      }
    }
    if ((event === "cohost_request_accept" || event === "cohost_invite_send") && userId === hostId) {
      let targetId: string;
      try {
        targetId = requireCohostTarget(requestedTarget);
      } catch (error) {
        send(ws, "error", { message: error instanceof Error ? error.message : "cohost_target_required" });
        return;
      }
      const { rows } = await getPool().query<{ display_name: string; avatar_url: string | null }>(
        `SELECT display_name, avatar_url FROM users WHERE id = $1`,
        [targetId],
      );
      try {
        state = assignSeat(state, {
          userId: targetId,
          displayName: rows[0]?.display_name ?? "",
          avatarUrl: rows[0]?.avatar_url ?? null,
          status: event === "cohost_invite_send" ? "invited" : "live",
        });
      } catch (error) {
        send(ws, "error", { message: error instanceof Error ? error.message : "cohost_failed" });
        return;
      }
    }
    if ((event === "cohost_request_decline" || event === "cohost_invite_decline") && userId === hostId) {
      try {
        const targetId = requireCohostTarget(requestedTarget);
        state = { ...state, requests: state.requests.filter((row) => row.userId !== targetId) };
      } catch (error) {
        send(ws, "error", { message: error instanceof Error ? error.message : "cohost_target_required" });
        return;
      }
    }
    if (event === "cohost_seat_leave" || event === "cohost_seat_release" || event === "cohost_seats_clear") {
      if (event === "cohost_seats_clear" && userId === hostId) {
        state = { ...state, seats: [], requests: [], bigScreenUserId: null };
      } else {
        const leaving = event === "cohost_seat_leave" ? userId : requireCohostTarget(requestedTarget || userId);
        if (userId === hostId || leaving === userId) state = releaseSeat(state, leaving);
      }
    }
    if (event === "cohost_layout_sync" && userId === hostId) {
      try {
        state = setBigScreen(state, typeof body.bigScreenUserId === "string" ? body.bigScreenUserId : null);
      } catch {
        send(ws, "error", { message: "invalid_big_screen" });
        return;
      }
    }
    await saveCohost(state);
    await fanout(roomId, "cohost_layout_sync", {
      streamId: roomId,
      bigScreenUserId: state.bigScreenUserId,
      seats: state.seats,
    });
  });
}

async function handleBattle(userId: string, roomId: string, event: string, data: unknown): Promise<void> {
  const hostId = await liveHostId(roomId);
  if (!hostId) return;
  const body = typeof data === "object" && data ? (data as Record<string, unknown>) : {};
  const type = body.type === "2x2" ? "2x2" : "1x1";
  let state = await loadBattle(roomId);
  if (event === "battle_create" && userId === hostId) {
    if (state?.status === "WAITING" && canStart(state)) {
      state = startBattle(state);
    } else if (state?.status === "ACTIVE") {
      state = { ...state, status: "ENDED", remainingMs: 0 };
      await persistEndedBattle(state);
    } else {
      state = emptyBattle(roomId, type, hostId);
    }
  } else if (event === "battle_invite_accept" || event === "battle_join") {
    if (!state || state.status === "ENDED") state = emptyBattle(roomId, type, hostId);
    if (state.status === "WAITING") {
      const requested = (typeof body.seat === "string" ? body.seat : "") as BattleSeat | "";
      const open: BattleSeat[] =
        state.type === "2x2" ? ["opponent", "player3", "player4"] : ["opponent"];
      const seat =
        state.type === "2x2"
          ? open.includes(requested as BattleSeat)
            ? (requested as BattleSeat)
            : undefined
          : "opponent";
      if (seat && !state.seats[seat] && userId !== hostId) {
        state = { ...state, seats: { ...state.seats, [seat]: userId } };
      }
      if (canStart(state)) state = startBattle(state);
    }
  } else if (event === "battle_invite_decline" || event === "battle_end") {
    if (!state) return;
    if (event === "battle_end" && userId !== hostId) return;
    if (event === "battle_invite_decline") {
      const nextSeats = { ...state.seats };
      for (const key of ["opponent", "player3", "player4"] as const) {
        if (nextSeats[key] === userId) nextSeats[key] = null;
      }
      state = { ...state, seats: nextSeats };
    } else {
      state = { ...state, status: "ENDED", remainingMs: 0 };
      await persistEndedBattle(state);
    }
  } else if (event === "battle_get_state") {
    if (state) await fanout(roomId, "battle_state_sync", state);
    return;
  }
  if (!state) return;
  await saveBattle(state);
  const ticked = (await tickAndStoreBattle(roomId)) ?? state;
  if (state.status === "ACTIVE" && ticked.status === "ENDED") {
    await persistEndedBattle(ticked);
  }
  await fanout(roomId, "battle_state_sync", ticked);
}
