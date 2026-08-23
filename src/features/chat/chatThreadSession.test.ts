import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatMessage, ChatThreadDetail } from "./chatApi";
import { createChatThreadSession } from "./chatThreadSession";

const api = vi.hoisted(() => ({
  apiGetChatThread: vi.fn(),
  apiFetchThreadMessages: vi.fn(),
  apiMarkThreadRead: vi.fn(),
  apiSendThreadMessage: vi.fn(),
}));

vi.mock("./chatApi", () => ({
  apiGetChatThread: (...args: unknown[]) => api.apiGetChatThread(...args),
  apiFetchThreadMessages: (...args: unknown[]) => api.apiFetchThreadMessages(...args),
  apiMarkThreadRead: (...args: unknown[]) => api.apiMarkThreadRead(...args),
  apiSendThreadMessage: (...args: unknown[]) => api.apiSendThreadMessage(...args),
}));

const threadA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const threadB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const viewerA = "11111111-1111-4111-8111-111111111111";
const viewerB = "22222222-2222-4222-8222-222222222222";

const detail = (id: string, otherUserId: string): ChatThreadDetail => ({
  id,
  otherUserId,
  otherUsername: "peer",
  otherDisplayName: "Peer",
  otherAvatarUrl: null,
  otherLevel: 1,
  blocked: false,
  otherUnavailable: false,
  canSend: true,
});

const message = (id: string, threadId: string, body: string): ChatMessage => ({
  id,
  threadId,
  senderId: viewerB,
  body,
  createdAt: "2026-08-21T00:00:00.000Z",
});

describe("PAGE-033 chat thread session", () => {
  beforeEach(() => {
    for (const fn of Object.values(api)) fn.mockReset();
    api.apiGetChatThread.mockResolvedValue({ thread: detail(threadA, viewerB), error: null });
    api.apiFetchThreadMessages.mockResolvedValue({ messages: [], error: null });
    api.apiMarkThreadRead.mockResolvedValue({ ok: true });
    api.apiSendThreadMessage.mockResolvedValue({
      message: message("m-sent", threadA, "hi"),
      error: null,
    });
  });

  it("does not let a late thread A history appear in thread B", async () => {
    let resolveA: (value: { messages: ChatMessage[]; error: null }) => void = () => undefined;
    api.apiGetChatThread.mockImplementation(async (id: string) => ({
      thread: detail(id, viewerB),
      error: null,
    }));
    api.apiFetchThreadMessages.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveA = resolve as (value: { messages: ChatMessage[]; error: null }) => void;
        }),
    );
    api.apiFetchThreadMessages.mockResolvedValueOnce({
      messages: [message("b1", threadB, "from-b")],
      error: null,
    });
    const session = createChatThreadSession();
    const first = session.open(viewerA, threadA);
    await session.open(viewerA, threadB);
    resolveA({ messages: [message("a1", threadA, "from-a")], error: null });
    await first;
    expect(session.getSnapshot().threadId).toBe(threadB);
    expect(session.getSnapshot().messages.map((row) => row.id)).toEqual(["b1"]);
  });

  it("clears viewer A drafts and messages when viewer B opens", async () => {
    api.apiFetchThreadMessages.mockResolvedValueOnce({
      messages: [message("a1", threadA, "secret")],
      error: null,
    });
    const session = createChatThreadSession();
    await session.open(viewerA, threadA);
    session.setDraft("viewer-a-draft");
    api.apiGetChatThread.mockResolvedValue({ thread: detail(threadB, viewerA), error: null });
    api.apiFetchThreadMessages.mockResolvedValue({ messages: [], error: null });
    await session.open(viewerB, threadB);
    expect(session.getSnapshot().viewerId).toBe(viewerB);
    expect(session.getSnapshot().draft).toBe("");
    expect(session.getSnapshot().messages).toEqual([]);
  });

  it("restores the draft when send fails and does not keep a local sent bubble", async () => {
    const session = createChatThreadSession();
    await session.open(viewerA, threadA);
    session.setDraft("hello");
    api.apiSendThreadMessage.mockResolvedValue({ message: null, error: "offline" });
    await session.send();
    expect(session.getSnapshot().draft).toBe("hello");
    expect(session.getSnapshot().messages).toEqual([]);
    expect(session.getSnapshot().sendError).toBe("offline");
  });

  it("ignores a second send while one submission is in flight", async () => {
    let finishSend: (value: { message: ChatMessage; error: null }) => void = () => undefined;
    api.apiSendThreadMessage.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishSend = resolve as (value: { message: ChatMessage; error: null }) => void;
        }),
    );
    const session = createChatThreadSession();
    await session.open(viewerA, threadA);
    session.setDraft("one");
    const first = session.send();
    session.setDraft("two");
    await session.send();
    expect(api.apiSendThreadMessage).toHaveBeenCalledTimes(1);
    finishSend({ message: message("m1", threadA, "one"), error: null });
    await first;
    expect(session.getSnapshot().messages).toHaveLength(1);
  });

  it("reconciles a WS duplicate of the REST message to one row", async () => {
    const session = createChatThreadSession();
    await session.open(viewerA, threadA);
    const row = message("same", threadA, "hello");
    api.apiSendThreadMessage.mockResolvedValue({ message: row, error: null });
    session.setDraft("hello");
    await session.send();
    session.applyDmMessage({ threadId: threadA, message: row });
    expect(session.getSnapshot().messages).toHaveLength(1);
  });

  it("keeps listed messages if mark-read fails", async () => {
    api.apiFetchThreadMessages.mockResolvedValue({
      messages: [message("m1", threadA, "hello")],
      error: null,
    });
    api.apiMarkThreadRead.mockResolvedValue({ ok: false, error: "offline" });
    const session = createChatThreadSession();
    await session.open(viewerA, threadA);
    expect(session.getSnapshot().messages).toHaveLength(1);
    expect(session.getSnapshot().markError).toBe("offline");
  });
});
