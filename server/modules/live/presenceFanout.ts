import { randomUUID } from "node:crypto";
import type { WebSocket } from "ws";
import { env } from "../../infra/env.js";
import { valkeyPub, valkeySub } from "../../infra/valkey.js";
import { logger } from "../../infra/logger.js";

const INSTANCE_ID = randomUUID();
const CHANNEL = "feed:presence";
const sockets = new Set<WebSocket>();
let subscribed = false;

export function addPresenceSocket(ws: WebSocket): void {
  sockets.add(ws);
}

export function removePresenceSocket(ws: WebSocket): void {
  sockets.delete(ws);
}

function sendLocal(message: string): void {
  for (const ws of sockets) {
    if (ws.readyState === ws.OPEN) {
      try {
        ws.send(message);
      } catch (error) {
        logger.warn({ err: error }, "live presence send failed");
      }
    }
  }
}

export function initLivePresenceFanout(): void {
  if (subscribed || !env().valkeyUrl) return;
  subscribed = true;
  const sub = valkeySub();
  void sub.subscribe(CHANNEL);
  sub.on("message", (channel, message) => {
    if (channel !== CHANNEL) return;
    try {
      const payload = JSON.parse(message) as { sourceInstance?: string; envelope?: string };
      if (payload.sourceInstance === INSTANCE_ID || typeof payload.envelope !== "string") return;
      sendLocal(payload.envelope);
    } catch (error) {
      logger.warn({ err: error }, "live presence fanout parse failed");
    }
  });
}

export async function broadcastLivePresence(event: string, data: unknown): Promise<void> {
  const envelope = JSON.stringify({
    event,
    data,
    timestamp: new Date().toISOString(),
  });
  sendLocal(envelope);
  if (!env().valkeyUrl) return;
  await valkeyPub().publish(
    CHANNEL,
    JSON.stringify({ sourceInstance: INSTANCE_ID, envelope }),
  );
}
