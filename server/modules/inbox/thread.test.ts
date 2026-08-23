import { describe, expect, it } from "vitest";
import { dmRealtimePayloads, previewThreadMessage, THREAD_MESSAGE_MAX } from "./thread.js";

describe("PAGE-033 thread contracts", () => {
  it("previews long last-message text without using the body as identity", () => {
    const body = "x".repeat(140);
    expect(previewThreadMessage(body)).toBe(`${"x".repeat(117)}...`);
    expect(previewThreadMessage("hello")).toBe("hello");
  });

  it("builds one dm_message and dm_thread_updated payload from the canonical row", () => {
    const message = {
      id: "11111111-1111-4111-8111-111111111111",
      threadId: "22222222-2222-4222-8222-222222222222",
      senderId: "33333333-3333-4333-8333-333333333333",
      body: "hello",
      createdAt: "2026-08-21T00:00:00.000Z",
    };
    const payloads = dmRealtimePayloads(message.threadId, message, message.senderId);
    expect(payloads.message).toEqual({ threadId: message.threadId, message });
    expect(payloads.threadUpdated).toEqual({
      threadId: message.threadId,
      lastMessage: "hello",
      updatedAt: message.createdAt,
      senderId: message.senderId,
    });
    expect(THREAD_MESSAGE_MAX).toBe(2000);
  });
});
