import { getPool } from "../../infra/postgres.js";
import { AppError } from "../../middleware/errors.js";
import { logger } from "../../infra/logger.js";
import { env } from "../../infra/env.js";
import { requireValkey } from "../../infra/valkey.js";

export type LiveShareSendInput = {
  sharerId: string;
  sharerName: string;
  sharerAvatar: string;
  targetUserId: string;
  streamKey: string;
  hostUserId: string;
  hostName: string;
  hostAvatar: string;
};

export type LiveSharePayload = {
  sharerUserId: string;
  sharerName: string;
  sharerAvatar: string;
  streamKey: string;
  hostUserId: string;
  hostName: string;
  hostAvatar: string;
  createdAt: string;
};

function normalizeStreamKey(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 128);
}

async function lookupLiveHostUserId(streamKey: string): Promise<string | null> {
  const { rows } = await getPool().query<{ host_id: string }>(
    `SELECT host_id FROM live_streams
     WHERE room_id = $1 AND status = 'live'
     LIMIT 1`,
    [streamKey],
  );
  return rows[0]?.host_id ?? null;
}

export async function upsertLiveShareInbox(row: {
  recipientId: string;
  sharerId: string;
  streamKey: string;
  hostUserId: string;
  hostName: string;
  hostAvatar: string;
  sharerName: string;
  sharerAvatar: string;
}): Promise<boolean> {
  try {
    await getPool().query(
      `INSERT INTO live_share_inbox (
         recipient_id, sharer_id, stream_key, host_user_id,
         host_name, host_avatar, sharer_name, sharer_avatar
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (recipient_id, sharer_id, stream_key) DO UPDATE SET
         host_user_id = EXCLUDED.host_user_id,
         host_name = EXCLUDED.host_name,
         host_avatar = EXCLUDED.host_avatar,
         sharer_name = EXCLUDED.sharer_name,
         sharer_avatar = EXCLUDED.sharer_avatar,
         created_at = NOW()`,
      [
        row.recipientId,
        row.sharerId,
        row.streamKey,
        row.hostUserId,
        row.hostName,
        row.hostAvatar,
        row.sharerName,
        row.sharerAvatar,
      ],
    );
    return true;
  } catch (err) {
    logger.error({ err }, "upsertLiveShareInbox failed");
    return false;
  }
}

export async function executeLiveShareSend(
  input: LiveShareSendInput,
): Promise<{ ok: true; persisted: boolean; payload: LiveSharePayload } | { ok: false }> {
  const streamKey = normalizeStreamKey(input.streamKey);
  const targetUserId = input.targetUserId.trim();
  if (!streamKey || !targetUserId || targetUserId === input.sharerId) {
    return { ok: false };
  }

  let hostUserId = input.hostUserId.trim();
  try {
    const owner = await lookupLiveHostUserId(streamKey);
    if (owner) hostUserId = owner;
  } catch (err) {
    logger.warn({ err, streamKey }, "executeLiveShareSend: stream owner lookup failed");
    if (!hostUserId) hostUserId = streamKey;
  }
  if (!hostUserId) return { ok: false };

  const hostVerified = !input.hostUserId.trim() || input.hostUserId.trim() === hostUserId;
  const createdAt = new Date().toISOString();
  const payload: LiveSharePayload = {
    sharerUserId: input.sharerId,
    sharerName: input.sharerName.trim() || "Someone",
    sharerAvatar: input.sharerAvatar || "",
    streamKey,
    hostUserId,
    hostName: hostVerified ? input.hostName || "" : "",
    hostAvatar: hostVerified ? input.hostAvatar || "" : "",
    createdAt,
  };

  const persisted = await upsertLiveShareInbox({
    recipientId: targetUserId,
    sharerId: input.sharerId,
    streamKey,
    hostUserId: payload.hostUserId,
    hostName: payload.hostName,
    hostAvatar: payload.hostAvatar,
    sharerName: payload.sharerName,
    sharerAvatar: payload.sharerAvatar,
  });

  try {
    const { sendToUserGlobal } = await import("../../websocket/index.js");
    await sendToUserGlobal(targetUserId, "live_share", payload);
  } catch (err) {
    logger.warn({ err, targetUserId }, "executeLiveShareSend: WS notify failed");
  }

  return { ok: true, persisted, payload };
}

/** Per-user share ceiling (40 / 60s). Production requires Valkey. */
export async function allowLiveSharePost(userId: string): Promise<boolean> {
  const max = 40;
  const windowSec = 60;
  if (!env().valkeyUrl) {
    if (env().isProduction) return false;
    return true;
  }
  try {
    const key = `rl:live-share:${userId}`;
    const count = await requireValkey().incr(key);
    if (count === 1) await requireValkey().expire(key, windowSec);
    return count <= max;
  } catch (err) {
    logger.error({ err, userId }, "live-share rate limit Valkey failure");
    if (env().isProduction) return false;
    return true;
  }
}

export async function handlePostLiveShare(
  sharerId: string,
  body: Record<string, unknown>,
): Promise<{ ok: true; persisted: boolean } | never> {
  if (!(await allowLiveSharePost(sharerId))) {
    throw new AppError("rate_limited", "Too many shares", 429);
  }
  const targetUserId = typeof body.targetUserId === "string" ? body.targetUserId.trim() : "";
  const streamKey = typeof body.streamKey === "string" ? body.streamKey.trim() : "";
  const hostUserId = typeof body.hostUserId === "string" ? body.hostUserId.trim() : "";
  const hostName = typeof body.hostName === "string" ? body.hostName : "";
  const hostAvatar = typeof body.hostAvatar === "string" ? body.hostAvatar : "";
  const sharerName = typeof body.sharerName === "string" ? body.sharerName : "";
  const sharerAvatar = typeof body.sharerAvatar === "string" ? body.sharerAvatar : "";

  const result = await executeLiveShareSend({
    sharerId,
    sharerName: sharerName || "Someone",
    sharerAvatar,
    targetUserId,
    streamKey,
    hostUserId,
    hostName,
    hostAvatar,
  });
  if (!result.ok) {
    throw new AppError("validation_error", "Invalid share", 400);
  }
  return { ok: true, persisted: result.persisted };
}
