import { describe, expect, it } from "vitest";
import {
  matchesCurrentCall,
  parseCallAccepted,
  parseCallEnded,
  parseCallInvite,
  parseCallRejected,
} from "./callSignals";

const callId = "11111111-1111-4111-8111-111111111111";
const callerId = "22222222-2222-4222-8222-222222222222";
const calleeId = "33333333-3333-4333-8333-333333333333";
const threadId = "44444444-4444-4444-8444-444444444444";
const roomName = `call_${callId}`;

describe("PAGE-034 call signal parsers", () => {
  it("accepts a server invite and rejects fallback identities", () => {
    expect(
      parseCallInvite({
        callId,
        callerId,
        calleeId,
        threadId,
        roomName,
        callerUsername: "Maya",
        callerAvatar: "",
      }),
    ).toMatchObject({ callId, roomName, threadId });
    expect(
      parseCallInvite({
        callId,
        callerId,
        calleeId,
        threadId,
        roomName: threadId,
        callerUsername: "Maya",
      }),
    ).toBeNull();
    expect(parseCallInvite({ callId, callerId, calleeId, roomName })).toBeNull();
  });

  it("parses reject reasons including blocked without requiring a minted call id", () => {
    expect(parseCallRejected({ reason: "blocked", threadId, calleeId, callerId })).toEqual({
      reason: "blocked",
      callId: null,
      callerId,
      calleeId,
      threadId,
    });
    expect(parseCallRejected({ reason: "network" })).toBeNull();
  });

  it("reconciles pending outgoing calls by thread and accepted calls by call id", () => {
    expect(
      matchesCurrentCall(
        { callId: null, threadId, calleeId },
        { callId: null, threadId, calleeId },
      ),
    ).toBe(true);
    expect(
      matchesCurrentCall(
        { callId, threadId, calleeId },
        { callId, threadId, calleeId },
      ),
    ).toBe(true);
    expect(
      matchesCurrentCall(
        { callId, threadId, calleeId },
        { callId: "55555555-5555-4555-8555-555555555555", threadId, calleeId },
      ),
    ).toBe(false);
    expect(parseCallAccepted({ callId, callerId, calleeId, threadId, roomName })?.callId).toBe(callId);
    expect(parseCallEnded({ callId, userId: callerId, remoteId: calleeId, threadId })?.remoteId).toBe(calleeId);
  });
});
