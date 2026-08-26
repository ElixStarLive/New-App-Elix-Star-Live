import { apiRequest } from "@/lib/apiClient";
import { apiMutate, parseListFrom, type MutationResult } from "@/lib/apiResult";
import { asString, asStringOrNull, isRecord } from "@/lib/isRecord";

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
    otherUserId: asString(raw.otherUserId),
    otherUsername: asString(raw.otherUsername, "user"),
    otherDisplayName: asString(raw.otherDisplayName, "User"),
    otherAvatarUrl: asStringOrNull(raw.otherAvatarUrl),
    lastMessage: asString(raw.lastMessage),
    unread: raw.unread === true,
    updatedAt: asString(raw.updatedAt),
  };
}

function parseMessage(raw: unknown): ChatMessage | null {
  if (!isRecord(raw) || typeof raw.id !== "string") return null;
  return {
    id: raw.id,
    threadId: asString(raw.threadId),
    senderId: asString(raw.senderId),
    body: asString(raw.body),
    createdAt: asString(raw.createdAt),
  };
}

export async function apiListChatThreads(): Promise<{
  threads: ChatThread[];
  error: string | null;
}> {
  const { data, error } = await apiRequest<unknown>("/api/inbox/threads");
  if (error) return { threads: [], error: error.message };
  const threads = parseListFrom(data, "threads", parseThread);
  if (!threads) return { threads: [], error: "Invalid inbox response" };
  return { threads, error: null };
}

export async function apiDeleteChatThread(threadId: string): Promise<MutationResult> {
  return apiMutate(`/api/inbox/threads/${encodeURIComponent(threadId)}`, "DELETE");
}

export async function apiFetchThreadMessages(threadId: string): Promise<{
  messages: ChatMessage[];
  error: string | null;
}> {
  const { data, error } = await apiRequest<unknown>(
    `/api/inbox/threads/${encodeURIComponent(threadId)}/messages`,
  );
  if (error) return { messages: [], error: error.message };
  const messages = parseListFrom(data, "messages", parseMessage);
  if (!messages) return { messages: [], error: "Invalid messages response" };
  return { messages, error: null };
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

export type ActivityItem = { id: string; title: string; body: string; createdAt: string };

function parseActivityItem(raw: unknown): ActivityItem | null {
  if (!isRecord(raw) || typeof raw.id !== "string") return null;
  return {
    id: raw.id,
    title: asString(raw.title),
    body: asString(raw.body),
    createdAt: asString(raw.createdAt),
  };
}

export async function apiListActivity(): Promise<{
  items: ActivityItem[];
  error: string | null;
}> {
  const { data, error } = await apiRequest<unknown>("/api/activity");
  if (error) return { items: [], error: error.message };
  const items = parseListFrom(data, "items", parseActivityItem);
  if (!items) return { items: [], error: "Invalid activity response" };
  return { items, error: null };
}
