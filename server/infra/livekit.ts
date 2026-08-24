import { AccessToken, RoomServiceClient } from "livekit-server-sdk";
import { env } from "./env.js";
import { AppError } from "../middleware/errors.js";

function requireLivekit() {
  const cfg = env();
  if (!cfg.LIVEKIT_URL || !cfg.LIVEKIT_API_KEY || !cfg.LIVEKIT_API_SECRET) {
    throw new AppError("unavailable", "LiveKit is not configured", 503);
  }
  return {
    url: cfg.LIVEKIT_URL,
    key: cfg.LIVEKIT_API_KEY,
    secret: cfg.LIVEKIT_API_SECRET,
  };
}

export async function createLivekitToken(params: {
  identity: string;
  room: string;
  canPublish: boolean;
  name?: string;
  ttl?: string;
}): Promise<{ token: string; url: string }> {
  const cfg = requireLivekit();
  const at = new AccessToken(cfg.key, cfg.secret, {
    identity: params.identity,
    name: params.name,
    ttl: params.ttl ?? "6h",
  });
  at.addGrant({
    roomJoin: true,
    room: params.room,
    canPublish: params.canPublish,
    canSubscribe: true,
    canPublishData: true,
  });
  return { token: await at.toJwt(), url: cfg.url };
}

export function isLivekitConfigured(): boolean {
  const cfg = env();
  return Boolean(cfg.LIVEKIT_URL?.trim() && cfg.LIVEKIT_API_KEY?.trim() && cfg.LIVEKIT_API_SECRET?.trim());
}

export function livekitRooms(): RoomServiceClient {
  const cfg = requireLivekit();
  return new RoomServiceClient(cfg.url.replace(/^ws/, "http"), cfg.key, cfg.secret);
}
