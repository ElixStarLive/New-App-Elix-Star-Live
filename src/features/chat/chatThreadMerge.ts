import type { ChatMessage } from "./chatApi";
import { isRecord } from "@/lib/isRecord";

export function sortThreadMessages(messages: ChatMessage[]): ChatMessage[] {
  return [...messages].sort((a, b) => {
    const time = a.createdAt.localeCompare(b.createdAt);
    if (time !== 0) return time;
    return a.id.localeCompare(b.id);
  });
}

export function mergeThreadMessages(
  existing: ChatMessage[],
  incoming: ChatMessage[],
  threadId: string,
): ChatMessage[] {
  const byId = new Map(
    existing.filter((row) => row.threadId === threadId).map((row) => [row.id, row]),
  );
  for (const row of incoming) {
    if (!row.id || row.threadId !== threadId) continue;
    byId.set(row.id, row);
  }
  return sortThreadMessages([...byId.values()]);
}

export function parseIncomingDm(data: unknown, threadId: string): ChatMessage | null {
  if (!isRecord(data)) return null;
  const eventThread = typeof data.threadId === "string" ? data.threadId : "";
  if (!eventThread || eventThread !== threadId) return null;
  if (!isRecord(data.message)) return null;
  const message = data.message;
  if (typeof message.id !== "string" || typeof message.threadId !== "string") return null;
  if (typeof message.senderId !== "string" || typeof message.body !== "string") return null;
  if (message.threadId !== threadId) return null;
  return {
    id: message.id,
    threadId: message.threadId,
    senderId: message.senderId,
    body: message.body,
    createdAt: typeof message.createdAt === "string" ? message.createdAt : "",
  };
}
