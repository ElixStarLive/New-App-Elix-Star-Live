import { isRecord } from "@/lib/isRecord";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CALL_ROOM_RE = /^call_[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CallRejectReason = "blocked" | "declined" | "busy" | "forbidden";

export type CallInviteSignal = {
  callId: string;
  callerId: string;
  calleeId: string;
  callerUsername: string;
  callerAvatar: string;
  threadId: string;
  roomName: string;
};

export type CallAcceptedSignal = {
  callId: string;
  callerId: string;
  calleeId: string;
  threadId: string;
  roomName: string;
};

export type CallRejectedSignal = {
  reason: CallRejectReason;
  callId: string | null;
  callerId: string | null;
  calleeId: string | null;
  threadId: string | null;
};

export type CallEndedSignal = {
  callId: string;
  userId: string;
  remoteId: string;
  threadId: string;
};

function asUuid(value: unknown): string | null {
  return typeof value === "string" && UUID_RE.test(value) ? value : null;
}

function asRoom(value: unknown): string | null {
  return typeof value === "string" && CALL_ROOM_RE.test(value) ? value : null;
}

export function parseCallInvite(data: unknown): CallInviteSignal | null {
  if (!isRecord(data)) return null;
  const callId = asUuid(data.callId);
  const callerId = asUuid(data.callerId);
  const calleeId = asUuid(data.calleeId);
  const threadId = asUuid(data.threadId);
  const roomName = asRoom(data.roomName);
  if (!callId || !callerId || !calleeId || !threadId || !roomName) return null;
  return {
    callId,
    callerId,
    calleeId,
    threadId,
    roomName,
    callerUsername: typeof data.callerUsername === "string" ? data.callerUsername : "",
    callerAvatar: typeof data.callerAvatar === "string" ? data.callerAvatar : "",
  };
}

export function parseCallAccepted(data: unknown): CallAcceptedSignal | null {
  if (!isRecord(data)) return null;
  const callId = asUuid(data.callId);
  const callerId = asUuid(data.callerId);
  const calleeId = asUuid(data.calleeId);
  const threadId = asUuid(data.threadId);
  const roomName = asRoom(data.roomName);
  if (!callId || !callerId || !calleeId || !threadId || !roomName) return null;
  return { callId, callerId, calleeId, threadId, roomName };
}

export function parseCallRejected(data: unknown): CallRejectedSignal | null {
  if (!isRecord(data)) return null;
  const reason = data.reason;
  if (reason !== "blocked" && reason !== "declined" && reason !== "busy" && reason !== "forbidden") return null;
  return {
    reason,
    callId: asUuid(data.callId),
    callerId: asUuid(data.callerId),
    calleeId: asUuid(data.calleeId),
    threadId: asUuid(data.threadId),
  };
}

export function parseCallEnded(data: unknown): CallEndedSignal | null {
  if (!isRecord(data)) return null;
  const callId = asUuid(data.callId);
  const userId = asUuid(data.userId);
  const remoteId = asUuid(data.remoteId);
  const threadId = asUuid(data.threadId);
  if (!callId || !userId || !remoteId || !threadId) return null;
  return { callId, userId, remoteId, threadId };
}

export function matchesCurrentCall(
  current: { callId: string | null; threadId: string | null; calleeId: string | null },
  incoming: { callId: string | null; threadId: string | null; calleeId?: string | null },
): boolean {
  if (current.callId && incoming.callId) return current.callId === incoming.callId;
  if (!current.callId && current.threadId && incoming.threadId) {
    return current.threadId === incoming.threadId && (!incoming.calleeId || incoming.calleeId === current.calleeId);
  }
  return false;
}
