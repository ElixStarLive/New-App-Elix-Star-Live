import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();
const blockedMock = vi.fn();

vi.mock("../../infra/postgres.js", () => ({
  getPool: () => ({ query: queryMock }),
}));
vi.mock("../inbox/thread.js", () => ({
  isBlockedEitherWay: (...args: unknown[]) => blockedMock(...args),
}));

import { handleCallSignal, isCallRoomName } from "./signaling.js";

const callerId = "11111111-1111-4111-8111-111111111111";
const calleeId = "22222222-2222-4222-8222-222222222222";
const strangerId = "33333333-3333-4333-8333-333333333333";
const threadId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const callId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("PAGE-034 call signalling", () => {
  beforeEach(() => {
    queryMock.mockReset();
    blockedMock.mockReset();
    blockedMock.mockResolvedValue(false);
  });

  it("mints a call_* room and fans invite to both participants", async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM chat_thread_members")) {
        return { rows: [{ user_id: callerId }, { user_id: calleeId }] };
      }
      if (sql.includes("status = 'ringing'") && sql.includes("caller_id = $1 AND callee_id = $2")) {
        return { rows: [] };
      }
      if (sql.includes("status IN ('ringing', 'active')")) return { rows: [] };
      if (sql.includes("INSERT INTO calls")) {
        const values = queryMock.mock.calls.at(-1)?.[1] as string[];
        return {
          rows: [
            {
              id: values[0],
              caller_id: callerId,
              callee_id: calleeId,
              room_name: values[3],
              thread_id: threadId,
              status: "ringing",
            },
          ],
        };
      }
      if (sql.includes("FROM users")) return { rows: [{ username: "maya", display_name: "Maya", avatar_url: null }] };
      return { rows: [] };
    });
    const result = await handleCallSignal(callerId, "call_invite", { calleeId, threadId });
    expect(result.items).toHaveLength(2);
    expect(result.items[0]?.event).toBe("call_invite");
    expect(result.items[0]?.userId).toBe(callerId);
    expect(result.items[1]?.userId).toBe(calleeId);
    const roomName = String(result.items[0]?.data.roomName ?? "");
    expect(isCallRoomName(roomName)).toBe(true);
    expect(String(result.items[0]?.data.callerId)).toBe(callerId);
    expect(queryMock.mock.calls.some((row) => String(row[0]).includes("INSERT INTO live_streams"))).toBe(false);
  });

  it("rejects a blocked invite with reason blocked and does not mint media", async () => {
    blockedMock.mockResolvedValue(true);
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM chat_thread_members")) {
        return { rows: [{ user_id: callerId }, { user_id: calleeId }] };
      }
      return { rows: [] };
    });
    const result = await handleCallSignal(callerId, "call_invite", { calleeId, threadId });
    expect(result.items).toEqual([
      {
        userId: callerId,
        event: "call_rejected",
        data: { reason: "blocked", callerId, calleeId, threadId },
      },
    ]);
    expect(queryMock.mock.calls.some((row) => String(row[0]).includes("INSERT INTO calls"))).toBe(false);
  });

  it("only the callee can accept and only a participant can end", async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM calls WHERE id")) {
        return {
          rows: [
            {
              id: callId,
              caller_id: callerId,
              callee_id: calleeId,
              room_name: `call_${callId}`,
              thread_id: threadId,
              status: "ringing",
            },
          ],
        };
      }
      return { rows: [], rowCount: 1 };
    });
    const stolen = await handleCallSignal(strangerId, "call_accepted", { callId });
    expect(stolen.items).toEqual([]);
    const accepted = await handleCallSignal(calleeId, "call_accepted", { callId });
    expect(accepted.items[0]?.event).toBe("call_accepted");
    expect(accepted.items[0]?.userId).toBe(callerId);
    expect(accepted.items.some((row) => row.userId === calleeId && row.event === "call_accepted")).toBe(true);
    const ended = await handleCallSignal(callerId, "call_ended", { callId });
    expect(ended.items[0]?.event).toBe("call_ended");
    expect(ended.items[0]?.userId).toBe(calleeId);
    const strangerEnd = await handleCallSignal(strangerId, "call_ended", { callId });
    expect(strangerEnd.items).toEqual([]);
  });

  it("rejects accept when a block appears during ring", async () => {
    blockedMock.mockResolvedValue(true);
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM calls WHERE id")) {
        return {
          rows: [
            {
              id: callId,
              caller_id: callerId,
              callee_id: calleeId,
              room_name: `call_${callId}`,
              thread_id: threadId,
              status: "ringing",
            },
          ],
        };
      }
      return { rows: [], rowCount: 1 };
    });
    const result = await handleCallSignal(calleeId, "call_accepted", { callId });
    expect(result.items).toEqual([
      {
        userId: callerId,
        event: "call_rejected",
        data: { reason: "blocked", callId, callerId, calleeId, threadId },
      },
      {
        userId: calleeId,
        event: "call_rejected",
        data: { reason: "blocked", callId, callerId, calleeId, threadId },
      },
    ]);
    expect(queryMock.mock.calls.some((row) => String(row[0]).includes("status = 'active'"))).toBe(false);
    expect(queryMock.mock.calls.some((row) => String(row[0]).includes("status = 'rejected'"))).toBe(true);
  });

  it("ignores a client-supplied caller id and room name", async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM chat_thread_members")) {
        return { rows: [{ user_id: callerId }, { user_id: calleeId }] };
      }
      if (sql.includes("INSERT INTO calls")) {
        const values = queryMock.mock.calls.at(-1)?.[1] as string[];
        return {
          rows: [
            {
              id: values[0],
              caller_id: callerId,
              callee_id: calleeId,
              room_name: values[3],
              thread_id: threadId,
              status: "ringing",
            },
          ],
        };
      }
      if (sql.includes("FROM users")) return { rows: [{ username: "maya", display_name: "Maya", avatar_url: "" }] };
      return { rows: [] };
    });
    const result = await handleCallSignal(callerId, "call_invite", {
      calleeId,
      threadId,
      callerId: strangerId,
      callId: "not-a-server-id",
      roomName: "live_host_room",
    });
    expect(result.items[0]?.data.callerId).toBe(callerId);
    expect(String(result.items[0]?.data.roomName)).toMatch(/^call_/);
    expect(result.items[0]?.data.roomName).not.toBe("live_host_room");
  });
});
