import { randomUUID } from "node:crypto";
import { getPool } from "../../infra/postgres.js";
import { isBlockedEitherWay } from "../inbox/thread.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CallRejectReason = "blocked" | "declined" | "busy" | "forbidden";

export type CallFanoutItem = {
  userId: string;
  event: "call_invite" | "call_accepted" | "call_rejected" | "call_ended";
  data: Record<string, unknown>;
};

export type CallFanout = { items: CallFanoutItem[] };

type CallRow = {
  id: string;
  caller_id: string;
  callee_id: string;
  room_name: string;
  thread_id: string | null;
  status: string;
};

function uuid(value: unknown): string {
  return typeof value === "string" && UUID_RE.test(value) ? value : "";
}

function empty(): CallFanout {
  return { items: [] };
}

function roomNameFor(callId: string): string {
  return `call_${callId}`;
}

function rejectPayload(input: {
  reason: CallRejectReason;
  callId?: string;
  callerId?: string;
  calleeId?: string;
  threadId?: string;
}): Record<string, unknown> {
  return {
    reason: input.reason,
    ...(input.callId ? { callId: input.callId } : {}),
    ...(input.callerId ? { callerId: input.callerId } : {}),
    ...(input.calleeId ? { calleeId: input.calleeId } : {}),
    ...(input.threadId ? { threadId: input.threadId } : {}),
  };
}

async function callerProfile(userId: string): Promise<{ username: string; avatar: string }> {
  const { rows } = await getPool().query<{ username: string; display_name: string; avatar_url: string | null }>(
    `SELECT username, display_name, avatar_url FROM users WHERE id = $1`,
    [userId],
  );
  const row = rows[0];
  return {
    username: (row?.display_name || row?.username || "User").trim() || "User",
    avatar: row?.avatar_url ?? "",
  };
}

async function invitePayload(row: CallRow): Promise<Record<string, unknown>> {
  const profile = await callerProfile(row.caller_id);
  return {
    callId: row.id,
    callerId: row.caller_id,
    calleeId: row.callee_id,
    callerUsername: profile.username,
    callerAvatar: profile.avatar,
    threadId: row.thread_id,
    roomName: row.room_name,
  };
}

async function loadCall(callId: string): Promise<CallRow | null> {
  if (!callId) return null;
  const { rows } = await getPool().query<CallRow>(
    `SELECT id, caller_id, callee_id, room_name, thread_id, status FROM calls WHERE id = $1`,
    [callId],
  );
  return rows[0] ?? null;
}

async function assertThreadPair(threadId: string, callerId: string, calleeId: string): Promise<boolean> {
  const { rows } = await getPool().query<{ user_id: string }>(
    `SELECT user_id FROM chat_thread_members WHERE thread_id = $1 AND user_id IN ($2, $3)`,
    [threadId, callerId, calleeId],
  );
  const ids = new Set(rows.map((row) => row.user_id));
  return ids.has(callerId) && ids.has(calleeId) && callerId !== calleeId;
}

export async function handleCallSignal(
  userId: string,
  event: "call_invite" | "call_accepted" | "call_rejected" | "call_ended",
  data: unknown,
): Promise<CallFanout> {
  const body = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  if (event === "call_invite") return inviteCall(userId, body);
  if (event === "call_accepted") return acceptCall(userId, body);
  if (event === "call_rejected") return rejectCall(userId, body);
  return endCall(userId, body);
}

async function inviteCall(callerId: string, body: Record<string, unknown>): Promise<CallFanout> {
  const calleeId = uuid(body.calleeId);
  const threadId = uuid(body.threadId);
  if (!calleeId || !threadId || calleeId === callerId) {
    return {
      items: [
        {
          userId: callerId,
          event: "call_rejected",
          data: rejectPayload({ reason: "forbidden", calleeId: calleeId || undefined, threadId: threadId || undefined }),
        },
      ],
    };
  }
  if (!(await assertThreadPair(threadId, callerId, calleeId))) {
    return {
      items: [
        {
          userId: callerId,
          event: "call_rejected",
          data: rejectPayload({ reason: "forbidden", calleeId, threadId, callerId }),
        },
      ],
    };
  }
  if (await isBlockedEitherWay(callerId, calleeId)) {
    return {
      items: [
        {
          userId: callerId,
          event: "call_rejected",
          data: rejectPayload({ reason: "blocked", calleeId, threadId, callerId }),
        },
      ],
    };
  }

  const existing = await getPool().query<CallRow>(
    `SELECT id, caller_id, callee_id, room_name, thread_id, status
     FROM calls
     WHERE caller_id = $1 AND callee_id = $2 AND thread_id = $3 AND status = 'ringing'
     ORDER BY created_at DESC
     LIMIT 1`,
    [callerId, calleeId, threadId],
  );
  if (existing.rows[0]) {
    const payload = await invitePayload(existing.rows[0]);
    return {
      items: [
        { userId: callerId, event: "call_invite", data: payload },
        { userId: calleeId, event: "call_invite", data: payload },
      ],
    };
  }

  const busy = await getPool().query<{ id: string }>(
    `SELECT id FROM calls
     WHERE status IN ('ringing', 'active')
       AND (caller_id IN ($1, $2) OR callee_id IN ($1, $2))
     LIMIT 1`,
    [callerId, calleeId],
  );
  if (busy.rows[0]) {
    return {
      items: [
        {
          userId: callerId,
          event: "call_rejected",
          data: rejectPayload({ reason: "busy", calleeId, threadId, callerId }),
        },
      ],
    };
  }

  const callId = randomUUID();
  const roomName = roomNameFor(callId);
  const inserted = await getPool().query<CallRow>(
    `INSERT INTO calls (id, caller_id, callee_id, room_name, status, thread_id)
     VALUES ($1, $2, $3, $4, 'ringing', $5)
     RETURNING id, caller_id, callee_id, room_name, thread_id, status`,
    [callId, callerId, calleeId, roomName, threadId],
  );
  const row = inserted.rows[0];
  if (!row) return empty();
  const payload = await invitePayload(row);
  return {
    items: [
      { userId: callerId, event: "call_invite", data: payload },
      { userId: calleeId, event: "call_invite", data: payload },
    ],
  };
}

async function acceptCall(userId: string, body: Record<string, unknown>): Promise<CallFanout> {
  const callId = uuid(body.callId);
  const call = await loadCall(callId);
  if (!call || !call.thread_id) return empty();
  if (call.callee_id !== userId) return empty();
  if (call.status === "ended" || call.status === "rejected") return empty();
  if (call.status === "ringing") {
    const updated = await getPool().query(
      `UPDATE calls SET status = 'active' WHERE id = $1 AND status = 'ringing'`,
      [call.id],
    );
    if (!updated.rowCount) return empty();
  } else if (call.status !== "active") {
    return empty();
  }
  return {
    items: [
      {
        userId: call.caller_id,
        event: "call_accepted",
        data: {
          callId: call.id,
          callerId: call.caller_id,
          calleeId: call.callee_id,
          threadId: call.thread_id,
          roomName: call.room_name,
        },
      },
      {
        userId: call.callee_id,
        event: "call_accepted",
        data: {
          callId: call.id,
          callerId: call.caller_id,
          calleeId: call.callee_id,
          threadId: call.thread_id,
          roomName: call.room_name,
        },
      },
    ],
  };
}

async function rejectCall(userId: string, body: Record<string, unknown>): Promise<CallFanout> {
  const callId = uuid(body.callId);
  const call = await loadCall(callId);
  if (!call || !call.thread_id) return empty();
  if (call.callee_id !== userId) return empty();
  if (call.status !== "ringing") return empty();
  await getPool().query(`UPDATE calls SET status = 'rejected', ended_at = NOW() WHERE id = $1 AND status = 'ringing'`, [
    call.id,
  ]);
  return {
    items: [
      {
        userId: call.caller_id,
        event: "call_rejected",
        data: rejectPayload({
          reason: "declined",
          callId: call.id,
          callerId: call.caller_id,
          calleeId: call.callee_id,
          threadId: call.thread_id,
        }),
      },
    ],
  };
}

async function endCall(userId: string, body: Record<string, unknown>): Promise<CallFanout> {
  const callId = uuid(body.callId);
  const call = await loadCall(callId);
  if (!call || !call.thread_id) return empty();
  if (call.caller_id !== userId && call.callee_id !== userId) return empty();
  if (call.status !== "ringing" && call.status !== "active") return empty();
  await getPool().query(
    `UPDATE calls SET status = 'ended', ended_at = NOW() WHERE id = $1 AND status IN ('ringing', 'active')`,
    [call.id],
  );
  const remoteId = call.caller_id === userId ? call.callee_id : call.caller_id;
  return {
    items: [
      {
        userId: remoteId,
        event: "call_ended",
        data: {
          callId: call.id,
          userId,
          remoteId,
          threadId: call.thread_id,
        },
      },
    ],
  };
}

export function isCallRoomName(roomName: string): boolean {
  return /^call_[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(roomName);
}
