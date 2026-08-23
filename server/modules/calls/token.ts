import { AppError } from "../../middleware/errors.js";
import { getPool } from "../../infra/postgres.js";
import { isLiveNeonSchema } from "../../infra/liveSchema.js";
import { createLivekitToken, isLivekitConfigured } from "../../infra/livekit.js";
import { isCallRoomName } from "./signaling.js";

type CallAuthRow = {
  id: string;
  caller_id: string;
  callee_id: string;
  room_name: string;
  status: string;
};

export async function issueCallToken(
  userId: string,
  callId: string,
): Promise<{ callId: string; roomName: string; token: string; url: string }> {
  if (await isLiveNeonSchema()) {
    throw new AppError("unavailable", "CALLS_LIVE_SCHEMA_UNAVAILABLE", 503);
  }
  const { rows } = await getPool().query<CallAuthRow>(
    `SELECT id, caller_id, callee_id, room_name, status FROM calls WHERE id = $1`,
    [callId],
  );
  const call = rows[0];
  if (!call) {
    throw new AppError("not_found", "Call not found", 404);
  }
  if (call.caller_id !== userId && call.callee_id !== userId) {
    throw new AppError("forbidden", "Not a call participant", 403);
  }
  if (call.status !== "ringing" && call.status !== "active") {
    throw new AppError("forbidden", "Call is not joinable", 403);
  }
  if (!isCallRoomName(call.room_name)) {
    throw new AppError("forbidden", "Invalid call room", 403);
  }
  if (!isLivekitConfigured()) {
    throw new AppError("unavailable", "Call media is not configured", 503);
  }
  const minted = await createLivekitToken({
    identity: userId,
    room: call.room_name,
    canPublish: true,
    ttl: "1h",
  });
  return {
    callId: call.id,
    roomName: call.room_name,
    token: minted.token,
    url: minted.url,
  };
}
