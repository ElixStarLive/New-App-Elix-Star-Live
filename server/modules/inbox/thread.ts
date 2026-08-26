import { getPool } from "../../infra/postgres.js";
import { AppError } from "../../middleware/errors.js";
import { isBlockedEitherWay } from "../blocks/service.js";

export { isBlockedEitherWay };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const THREAD_MESSAGE_MAX = 2000;
const HISTORY_LIMIT = 200;

export type ChatMessageRow = {
  id: string;
  threadId: string;
  senderId: string;
  body: string;
  createdAt: string;
};

export type ChatThreadDetail = {
  id: string;
  otherUserId: string | null;
  otherUsername: string;
  otherDisplayName: string;
  otherAvatarUrl: string | null;
  otherLevel: number;
  blocked: boolean;
  otherUnavailable: boolean;
  canSend: boolean;
};

type OtherMemberRow = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  deleted_at: Date | null;
  banned_until: Date | null;
  level: number | null;
};

function assertThreadId(threadId: string): void {
  if (!UUID_RE.test(threadId)) {
    throw new AppError("not_found", "Thread not found", 404);
  }
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code: string }).code === "23505");
}

function mapMessage(row: {
  id: string;
  thread_id: string;
  sender_id: string;
  body: string;
  created_at: Date;
}): ChatMessageRow {
  return {
    id: row.id,
    threadId: row.thread_id,
    senderId: row.sender_id,
    body: row.body,
    createdAt: row.created_at.toISOString(),
  };
}

export function previewThreadMessage(body: string): string {
  return body.length > 120 ? `${body.slice(0, 117)}...` : body;
}

export function dmRealtimePayloads(threadId: string, message: ChatMessageRow, senderId: string) {
  return {
    message: { threadId, message },
    threadUpdated: {
      threadId,
      lastMessage: previewThreadMessage(message.body),
      updatedAt: message.createdAt,
      senderId,
    },
  };
}

async function requireMembership(threadId: string, viewerId: string): Promise<void> {
  assertThreadId(threadId);
  
  const { rows } = await getPool().query(
        `SELECT 1 FROM chat_thread_members WHERE thread_id = $1 AND user_id = $2`,
        [threadId, viewerId],
      );
  if (!rows[0]) throw new AppError("forbidden", "Not in this thread", 403);
}

async function otherMember(threadId: string, viewerId: string): Promise<OtherMemberRow | null> {
  
  
  const { rows } = await getPool().query<OtherMemberRow>(
    `SELECT u.id, u.username, u.display_name, u.avatar_url, u.deleted_at, u.banned_until,
            COALESCE(NULLIF(ue.fan_level, 0), 1)::int AS level
     FROM chat_thread_members m
     JOIN users u ON u.id = m.user_id
     LEFT JOIN user_engagement ue ON ue.user_id = u.id
     WHERE m.thread_id = $1 AND m.user_id <> $2
     LIMIT 1`,
    [threadId, viewerId],
  );
  return rows[0] ?? null;
}

function otherUnavailable(row: OtherMemberRow): boolean {
  return Boolean(row.deleted_at) || Boolean(row.banned_until && row.banned_until > new Date());
}

export async function getThreadDetail(viewerId: string, threadId: string): Promise<ChatThreadDetail> {
  await requireMembership(threadId, viewerId);
  const other = await otherMember(threadId, viewerId);
  if (!other) {
    return {
      id: threadId,
      otherUserId: null,
      otherUsername: "",
      otherDisplayName: "",
      otherAvatarUrl: null,
      otherLevel: 1,
      blocked: false,
      otherUnavailable: true,
      canSend: false,
    };
  }
  const unavailable = otherUnavailable(other);
  const blocked = unavailable ? false : await isBlockedEitherWay(viewerId, other.id);
  return {
    id: threadId,
    otherUserId: unavailable ? null : other.id,
    otherUsername: unavailable ? "" : other.username,
    otherDisplayName: unavailable ? "" : other.display_name,
    otherAvatarUrl: unavailable ? null : other.avatar_url,
    otherLevel: other.level && other.level > 0 ? other.level : 1,
    blocked,
    otherUnavailable: unavailable,
    canSend: !unavailable && !blocked,
  };
}

export async function listThreadMessages(viewerId: string, threadId: string): Promise<ChatMessageRow[]> {
  await requireMembership(threadId, viewerId);
  
  const { rows } = await getPool().query<{
        id: string;
        thread_id: string;
        sender_id: string;
        body: string;
        created_at: Date;
      }>(
        `SELECT id, thread_id, sender_id, body, created_at
     FROM (
       SELECT id, thread_id, sender_id, body, created_at
       FROM chat_messages
       WHERE thread_id = $1
       ORDER BY created_at DESC, id DESC
       LIMIT $2
     ) recent
     ORDER BY created_at ASC, id ASC`,
        [threadId, HISTORY_LIMIT],
      );
  return rows.map(mapMessage);
}

export async function markThreadRead(viewerId: string, threadId: string): Promise<void> {
  await requireMembership(threadId, viewerId);
  
  await getPool().query(
    `UPDATE chat_thread_members SET last_read_at = NOW() WHERE thread_id = $1 AND user_id = $2`,
    [threadId, viewerId],
  );
}

export async function sendThreadMessage(
  viewerId: string,
  threadId: string,
  rawBody: string,
  clientRequestId?: string,
): Promise<{ message: ChatMessageRow; created: boolean; otherUserId: string }> {
  const body = rawBody.trim();
  if (!body) throw new AppError("validation_error", "Message required", 400);
  if (body.length > THREAD_MESSAGE_MAX) {
    throw new AppError("validation_error", "Message is too long (max 2000 characters).", 400);
  }
  await requireMembership(threadId, viewerId);
  const other = await otherMember(threadId, viewerId);
  if (!other || otherUnavailable(other)) {
    throw new AppError("forbidden", "You cannot message this user.", 403);
  }
  if (await isBlockedEitherWay(viewerId, other.id)) {
    throw new AppError("forbidden", "You cannot message this user.", 403);
  }
  const requestId = clientRequestId?.trim() || null;
  if (requestId && requestId.length > 80) {
    throw new AppError("validation_error", "Invalid request", 400);
  }

  

  if (requestId) {
    const existing = await getPool().query<{
      id: string;
      thread_id: string;
      sender_id: string;
      body: string;
      created_at: Date;
    }>(
      `SELECT id, thread_id, sender_id, body, created_at
       FROM chat_messages
       WHERE thread_id = $1 AND sender_id = $2 AND client_request_id = $3
       LIMIT 1`,
      [threadId, viewerId, requestId],
    );
    if (existing.rows[0]) {
      return { message: mapMessage(existing.rows[0]), created: false, otherUserId: other.id };
    }
  }

  try {
    const inserted = await getPool().query<{
      id: string;
      thread_id: string;
      sender_id: string;
      body: string;
      created_at: Date;
    }>(
      `INSERT INTO chat_messages (thread_id, sender_id, body, client_request_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id, thread_id, sender_id, body, created_at`,
      [threadId, viewerId, body, requestId],
    );
    return { message: mapMessage(inserted.rows[0]), created: true, otherUserId: other.id };
  } catch (error) {
    if (isUniqueViolation(error) && requestId) {
      const existing = await getPool().query<{
        id: string;
        thread_id: string;
        sender_id: string;
        body: string;
        created_at: Date;
      }>(
        `SELECT id, thread_id, sender_id, body, created_at
         FROM chat_messages
         WHERE thread_id = $1 AND sender_id = $2 AND client_request_id = $3
         LIMIT 1`,
        [threadId, viewerId, requestId],
      );
      if (existing.rows[0]) {
        return { message: mapMessage(existing.rows[0]), created: false, otherUserId: other.id };
      }
    }
    throw error;
  }
}
