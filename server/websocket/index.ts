import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage, Server } from "node:http";
import { randomUUID } from "node:crypto";
import { verifyAccessToken } from "../infra/tokens.js";
import { getPool } from "../infra/postgres.js";
import { logger } from "../infra/logger.js";
import { env } from "../infra/env.js";
import { valkeySub } from "../infra/valkey.js";
import { wsEnvelopeSchema, chatMessageDataSchema, heartSentDataSchema } from "../../shared/contracts/realtime.js";
import { assignSeat, releaseSeat, setBigScreen } from "../modules/cohost/state.js";
import { loadCohost, saveCohost } from "../modules/cohost/runtime.js";
import { canStart, emptyBattle, startBattle } from "../modules/battle/state.js";
import { loadBattle, onLocalRoom, persistEndedBattle, publishRoom, saveBattle, tickAndStoreBattle } from "../modules/battle/runtime.js";
import { addViewer, removeViewer, viewerCount } from "./presence.js";
import type { BattleSeat } from "../../shared/contracts/realtime.js";
import { clearGiftGoal, getGiftGoal, setGiftGoal } from "../modules/gifts/goal.js";

type SocketClient = {
  ws: WebSocket;
  userId: string;
  roomId: string;
  connectionId: string;
};

const localSockets = new Map<WebSocket, SocketClient>();

function send(ws: WebSocket, event: string, data: unknown): void {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ event, data, timestamp: new Date().toISOString() }));
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
  await publishRoom(roomId, event, data);
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
    sub.on("pmessage", (_pattern, channel, message) => {
      const roomId = channel.slice("room:".length);
      for (const client of localSockets.values()) {
        if (client.roomId === roomId && client.ws.readyState === WebSocket.OPEN) {
          client.ws.send(message);
        }
      }
    });
  } else {
    onLocalRoom((roomId, message) => {
      for (const client of localSockets.values()) {
        if (client.roomId === roomId && client.ws.readyState === WebSocket.OPEN) {
          client.ws.send(message);
        }
      }
    });
  }

  wss.on("connection", (ws, req: IncomingMessage) => {
    void handleConnection(ws, req);
  });
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
  const { rows } = await getPool().query<{
    revoked_at: Date | null;
    expires_at: Date;
    banned_until: Date | null;
    deleted_at: Date | null;
  }>(
    `SELECT s.revoked_at, s.expires_at, u.banned_until, u.deleted_at
     FROM auth_sessions s JOIN users u ON u.id = s.user_id
     WHERE s.id = $1 AND s.user_id = $2`,
    [claims.sessionId, claims.userId],
  );
  if (
    !rows[0] ||
    rows[0].revoked_at ||
    rows[0].expires_at < new Date() ||
    rows[0].deleted_at ||
    (rows[0].banned_until && rows[0].banned_until > new Date())
  ) {
    ws.close(1008, "unauthorized");
    return;
  }
  const connectionId = `${claims.userId}:${randomUUID()}`;
  localSockets.set(ws, { ws, userId: claims.userId, roomId, connectionId });
  await addViewer(roomId, connectionId);
  send(ws, "connected", { roomId, userId: claims.userId });
  const existingGoal = await getGiftGoal(roomId);
  if (existingGoal) send(ws, "gift_goal_sync", existingGoal);
  const hostId = await liveHostId(roomId);
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
    localSockets.delete(ws);
    void removeViewer(roomId, connectionId).then(() => emitViewerCount(roomId));
    void fanout(roomId, "user_left", { userId: claims.userId });
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
    await handleCohost(userId, roomId, event, data);
    return;
  }
  if (event.startsWith("battle_")) {
    await handleBattle(userId, roomId, event, data);
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

async function handleCohost(userId: string, roomId: string, event: string, data: unknown): Promise<void> {
  const hostId = await liveHostId(roomId);
  if (!hostId) return;
  let state = await loadCohost(roomId, hostId);
  const body = typeof data === "object" && data ? (data as Record<string, unknown>) : {};
  const requestedTarget = typeof body.userId === "string" ? body.userId : "";
  if (event === "cohost_request_send" || event === "cohost_invite_accept") {
    if (userId !== hostId && !state.requests.some((row) => row.userId === userId) && !state.seats.some((row) => row.userId === userId)) {
      const { rows } = await getPool().query<{ display_name: string }>(`SELECT display_name FROM users WHERE id = $1`, [
        userId,
      ]);
      state.requests.push({ userId, displayName: rows[0]?.display_name ?? "" });
      await fanout(roomId, "cohost_request", { userId, displayName: rows[0]?.display_name ?? "" });
    }
  }
  if ((event === "cohost_request_accept" || event === "cohost_invite_send") && userId === hostId) {
    const targetId = requestedTarget || state.requests[0]?.userId;
    if (targetId) {
      const { rows } = await getPool().query<{ display_name: string; avatar_url: string | null }>(
        `SELECT display_name, avatar_url FROM users WHERE id = $1`,
        [targetId],
      );
      try {
        state = assignSeat(state, {
          userId: targetId,
          displayName: rows[0]?.display_name ?? "",
          avatarUrl: rows[0]?.avatar_url ?? null,
          status: "live",
        });
      } catch {
        /* already seated or full */
      }
    }
  }
  if ((event === "cohost_request_decline" || event === "cohost_invite_decline") && userId === hostId) {
    const targetId = requestedTarget;
    state = { ...state, requests: state.requests.filter((row) => row.userId !== targetId) };
  }
  if (event === "cohost_seat_leave" || event === "cohost_seat_release" || event === "cohost_seats_clear") {
    if (event === "cohost_seats_clear" && userId === hostId) {
      state = { ...state, seats: [], requests: [], bigScreenUserId: null };
    } else {
      const leaving = event === "cohost_seat_leave" ? userId : requestedTarget || userId;
      if (userId === hostId || leaving === userId) state = releaseSeat(state, leaving);
    }
  }
  if (event === "cohost_layout_sync" && userId === hostId) {
    try {
      state = setBigScreen(state, typeof body.bigScreenUserId === "string" ? body.bigScreenUserId : null);
    } catch {
      /* ignore invalid big-screen target */
    }
  }
  await saveCohost(state);
  await fanout(roomId, "cohost_layout_sync", {
    streamId: roomId,
    bigScreenUserId: state.bigScreenUserId,
    seats: state.seats,
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
      if (type === "2x2") {
        const cohost = await loadCohost(roomId, hostId);
        const ids = cohost.seats.map((seat) => seat.userId);
        state = {
          ...state,
          seats: {
            host: hostId,
            opponent: ids[0] ?? null,
            player3: ids[1] ?? null,
            player4: ids[2] ?? null,
          },
        };
        if (canStart(state)) state = startBattle(state);
      }
    }
  } else if (event === "battle_invite_accept" || event === "battle_join") {
    if (!state || state.status === "ENDED") state = emptyBattle(roomId, type, hostId);
    if (state.status === "WAITING") {
      const requested = (typeof body.seat === "string" ? body.seat : "") as BattleSeat | "";
      const open: BattleSeat[] =
        state.type === "2x2" ? ["opponent", "player3", "player4"] : ["opponent"];
      const seat = (open.includes(requested as BattleSeat) ? requested : open.find((key) => !state?.seats[key])) as
        | BattleSeat
        | undefined;
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
