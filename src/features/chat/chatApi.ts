import { apiRequest } from "@/lib/apiClient";
import { isRecord } from "@/lib/isRecord";

export type ChatThread = {
  id: string;
  otherUserId: string;
  otherUsername: string;
  otherDisplayName: string;
  otherAvatarUrl: string | null;
  lastMessage: string;
  unread: boolean;
  unreadCount: number;
  updatedAt: string;
};

export type ChatMessage = {
  id: string;
  threadId: string;
  senderId: string;
  body: string;
  createdAt: string;
};

function parseThread(raw: unknown): ChatThread | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.id !== "string" || typeof raw.otherUserId !== "string") return null;
  if (typeof raw.otherUsername !== "string" || typeof raw.otherDisplayName !== "string") return null;
  return {
    id: raw.id,
    otherUserId: raw.otherUserId,
    otherUsername: raw.otherUsername,
    otherDisplayName: raw.otherDisplayName,
    otherAvatarUrl: typeof raw.otherAvatarUrl === "string" ? raw.otherAvatarUrl : null,
    lastMessage: typeof raw.lastMessage === "string" ? raw.lastMessage : "",
    unread: raw.unread === true,
    unreadCount:
      typeof raw.unreadCount === "number" && Number.isFinite(raw.unreadCount)
        ? Math.max(0, Math.floor(raw.unreadCount))
        : raw.unread === true
          ? 1
          : 0,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : "",
  };
}

function parseMessage(raw: unknown): ChatMessage | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.id !== "string" || typeof raw.threadId !== "string") return null;
  if (typeof raw.senderId !== "string" || typeof raw.body !== "string") return null;
  return {
    id: raw.id,
    threadId: raw.threadId,
    senderId: raw.senderId,
    body: raw.body,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : "",
  };
}

export async function apiListChatThreads(): Promise<{
  threads: ChatThread[];
  error: string | null;
}> {
  const { data, error } = await apiRequest<unknown>("/api/inbox/threads");
  if (error) return { threads: [], error: error.message };
  if (!isRecord(data) || !Array.isArray(data.threads)) return { threads: [], error: "Invalid inbox response" };
  const parsed = data.threads.map(parseThread).filter((row): row is ChatThread => row !== null);
  if (data.threads.length > 0 && parsed.length === 0) return { threads: [], error: "Invalid inbox response" };
  const threads = parsed.filter((row) => {
    const name = (row.otherDisplayName || row.otherUsername).trim();
    if (!name) return false;
    // Drop fabricated stub identities (OLD Inbox anti-stub filter).
    if (name.toLowerCase() === "user") return false;
    if (row.otherUsername.trim().toLowerCase() === "user") return false;
    return true;
  });
  return { threads, error: null };
}

export async function apiDeleteChatThread(threadId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await apiRequest<unknown>(`/api/inbox/threads/${encodeURIComponent(threadId)}`, {
    method: "DELETE",
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

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

function parseThreadDetail(raw: unknown): ChatThreadDetail | null {
  if (!isRecord(raw) || typeof raw.id !== "string") return null;
  return {
    id: raw.id,
    otherUserId: typeof raw.otherUserId === "string" ? raw.otherUserId : null,
    otherUsername: typeof raw.otherUsername === "string" ? raw.otherUsername : "",
    otherDisplayName: typeof raw.otherDisplayName === "string" ? raw.otherDisplayName : "",
    otherAvatarUrl: typeof raw.otherAvatarUrl === "string" ? raw.otherAvatarUrl : null,
    otherLevel:
      typeof raw.otherLevel === "number" && Number.isFinite(raw.otherLevel) && raw.otherLevel > 0
        ? Math.floor(raw.otherLevel)
        : 1,
    blocked: raw.blocked === true,
    otherUnavailable: raw.otherUnavailable === true,
    canSend: raw.canSend === true,
  };
}

export async function apiGetChatThread(threadId: string): Promise<{
  thread: ChatThreadDetail | null;
  error: string | null;
}> {
  const { data, error } = await apiRequest<unknown>(`/api/inbox/threads/${encodeURIComponent(threadId)}`);
  if (error) return { thread: null, error: error.message };
  const parsed = parseThreadDetail(isRecord(data) ? data.thread : null);
  if (!parsed || parsed.id !== threadId) return { thread: null, error: "Thread was not found" };
  return { thread: parsed, error: null };
}

export async function apiFetchThreadMessages(threadId: string): Promise<{
  messages: ChatMessage[];
  error: string | null;
}> {
  const { data, error } = await apiRequest<unknown>(
    `/api/inbox/threads/${encodeURIComponent(threadId)}/messages`,
  );
  if (error) return { messages: [], error: error.message };
  if (!isRecord(data) || !Array.isArray(data.messages)) return { messages: [], error: "Invalid messages response" };
  const messages = data.messages
    .map(parseMessage)
    .filter((row): row is ChatMessage => row !== null && row.threadId === threadId);
  if (data.messages.length > 0 && messages.length === 0) return { messages: [], error: "Invalid messages response" };
  return { messages, error: null };
}

export async function apiSendThreadMessage(
  threadId: string,
  body: string,
  clientRequestId?: string,
): Promise<{ message: ChatMessage | null; error: string | null }> {
  const payload: { body: string; clientRequestId?: string } = { body };
  if (clientRequestId) payload.clientRequestId = clientRequestId;
  const { data, error } = await apiRequest<unknown>(
    `/api/inbox/threads/${encodeURIComponent(threadId)}/messages`,
    { method: "POST", body: JSON.stringify(payload) },
  );
  if (error) return { message: null, error: error.message };
  const parsed = parseMessage(isRecord(data) ? data.message : null);
  if (!parsed || parsed.threadId !== threadId) return { message: null, error: "Message was not confirmed" };
  return { message: parsed, error: null };
}

export async function apiMarkThreadRead(threadId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await apiRequest<unknown>(`/api/inbox/threads/${encodeURIComponent(threadId)}/read`, {
    method: "POST",
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function apiEnsureDmThread(userId: string): Promise<{
  threadId: string | null;
  error: string | null;
}> {
  const { data, error } = await apiRequest<unknown>("/api/inbox/threads", {
    method: "POST",
    body: JSON.stringify({ userId }),
  });
  if (error) return { threadId: null, error: error.message };
  if (!isRecord(data) || typeof data.id !== "string") {
    return { threadId: null, error: "Could not open chat" };
  }
  return { threadId: data.id, error: null };
}
