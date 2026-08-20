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
  if (!isRecord(raw) || typeof raw.id !== "string") return null;
  return {
    id: raw.id,
    otherUserId: typeof raw.otherUserId === "string" ? raw.otherUserId : "",
    otherUsername: typeof raw.otherUsername === "string" ? raw.otherUsername : "user",
    otherDisplayName: typeof raw.otherDisplayName === "string" ? raw.otherDisplayName : "User",
    otherAvatarUrl: typeof raw.otherAvatarUrl === "string" ? raw.otherAvatarUrl : null,
    lastMessage: typeof raw.lastMessage === "string" ? raw.lastMessage : "",
    unread: raw.unread === true,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : "",
  };
}

function parseMessage(raw: unknown): ChatMessage | null {
  if (!isRecord(raw) || typeof raw.id !== "string") return null;
  return {
    id: raw.id,
    threadId: typeof raw.threadId === "string" ? raw.threadId : "",
    senderId: typeof raw.senderId === "string" ? raw.senderId : "",
    body: typeof raw.body === "string" ? raw.body : "",
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : "",
  };
}

export async function apiListChatThreads(): Promise<{
  threads: ChatThread[];
  error: string | null;
}> {
  const { data, error } = await apiRequest<unknown>("/api/inbox/threads");
  if (error) return { threads: [], error: error.message };
  const list = Array.isArray(data) ? data : isRecord(data) && Array.isArray(data.threads) ? data.threads : null;
  if (!list) return { threads: [], error: "Invalid inbox response" };
  return { threads: list.map(parseThread).filter((t): t is ChatThread => t !== null), error: null };
}

export async function apiDeleteChatThread(threadId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await apiRequest<unknown>(`/api/inbox/threads/${encodeURIComponent(threadId)}`, {
    method: "DELETE",
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function apiFetchThreadMessages(threadId: string): Promise<{
  messages: ChatMessage[];
  error: string | null;
}> {
  const { data, error } = await apiRequest<unknown>(
    `/api/inbox/threads/${encodeURIComponent(threadId)}/messages`,
  );
  if (error) return { messages: [], error: error.message };
  const list = Array.isArray(data) ? data : isRecord(data) && Array.isArray(data.messages) ? data.messages : null;
  if (!list) return { messages: [], error: "Invalid messages response" };
  return { messages: list.map(parseMessage).filter((m): m is ChatMessage => m !== null), error: null };
}

export async function apiSendThreadMessage(
  threadId: string,
  body: string,
): Promise<{ message: ChatMessage | null; error: string | null }> {
  const { data, error } = await apiRequest<unknown>(
    `/api/inbox/threads/${encodeURIComponent(threadId)}/messages`,
    { method: "POST", body: JSON.stringify({ body }) },
  );
  if (error) return { message: null, error: error.message };
  const parsed = parseMessage(isRecord(data) ? data.message ?? data : data);
  if (!parsed) return { message: null, error: "Message was not confirmed" };
  return { message: parsed, error: null };
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

export async function apiListActivity(): Promise<{
  items: Array<{ id: string; title: string; body: string; createdAt: string }>;
  error: string | null;
}> {
  const { data, error } = await apiRequest<unknown>("/api/activity");
  if (error) return { items: [], error: error.message };
  const list = Array.isArray(data) ? data : isRecord(data) && Array.isArray(data.items) ? data.items : null;
  if (!list) return { items: [], error: "Invalid activity response" };
  const items: Array<{ id: string; title: string; body: string; createdAt: string }> = [];
  for (const raw of list) {
    if (!isRecord(raw) || typeof raw.id !== "string") continue;
    items.push({
      id: raw.id,
      title: typeof raw.title === "string" ? raw.title : "",
      body: typeof raw.body === "string" ? raw.body : "",
      createdAt: typeof raw.createdAt === "string" ? raw.createdAt : "",
    });
  }
  return { items, error: null };
}
