import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.fn();
const on = vi.fn();
const off = vi.fn();

vi.mock("@/lib/wsClient", () => ({
  wsClient: {
    send: (...args: unknown[]) => send(...args),
    on: (...args: unknown[]) => on(...args),
    off: (...args: unknown[]) => off(...args),
  },
}));

import { useCallStore } from "@/store/useCallStore";
import {
  acceptIncomingCall,
  applyCallEvent,
  bindVideoCallSignals,
  callReturnPath,
  endActiveCall,
  isolateVideoCallAccount,
  markCallConnected,
  rejectIncomingCall,
  resetVideoCall,
  startOutgoingCall,
} from "./videoCallSession";

const threadId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const callerId = "11111111-1111-4111-8111-111111111111";
const calleeId = "22222222-2222-4222-8222-222222222222";
const callId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const otherCallId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const roomName = `call_${callId}`;

function invitePayload(overrides: Record<string, unknown> = {}) {
  return {
    callId,
    callerId,
    calleeId,
    callerUsername: "Maya",
    callerAvatar: "",
    threadId,
    roomName,
    ...overrides,
  };
}

describe("PAGE-034 video call session", () => {
  beforeEach(() => {
    send.mockReset();
    on.mockReset();
    off.mockReset();
    isolateVideoCallAccount();
    useCallStore.setState({ viewerId: callerId });
  });

  afterEach(() => {
    isolateVideoCallAccount();
  });

  it("starts outgoing over WS only and keeps the originating thread", () => {
    const started = startOutgoingCall({
      threadId,
      calleeId,
      remoteUser: { id: calleeId, username: "Peer", avatar: null },
    });
    expect(started).toEqual({ ok: true });
    expect(send).toHaveBeenCalledWith("call_invite", { threadId, calleeId });
    expect(useCallStore.getState().status).toBe("outgoing");
    expect(useCallStore.getState().callId).toBeNull();
    expect(callReturnPath()).toBe(`/inbox/${threadId}`);
  });

  it("acks the server-minted call id without treating the caller as incoming", () => {
    startOutgoingCall({
      threadId,
      calleeId,
      remoteUser: { id: calleeId, username: "Peer", avatar: null },
    });
    applyCallEvent("call_invite", invitePayload());
    expect(useCallStore.getState().status).toBe("outgoing");
    expect(useCallStore.getState().callId).toBe(callId);
    expect(useCallStore.getState().roomName).toBe(roomName);
  });

  it("enters incoming for the callee and shows accept only through that state", () => {
    useCallStore.setState({ viewerId: calleeId });
    applyCallEvent("call_invite", invitePayload());
    expect(useCallStore.getState().status).toBe("incoming");
    expect(useCallStore.getState().remoteUser?.id).toBe(callerId);
    const once = acceptIncomingCall(callId);
    const twice = acceptIncomingCall(callId);
    expect(once).toEqual({ ok: true });
    expect(twice.ok).toBe(false);
    expect(send.mock.calls.filter((row) => row[0] === "call_accepted")).toHaveLength(1);
  });

  it("rejects blocked pending outgoing by thread and does not keep ringing", () => {
    startOutgoingCall({
      threadId,
      calleeId,
      remoteUser: { id: calleeId, username: "Peer", avatar: null },
    });
    applyCallEvent("call_rejected", { reason: "blocked", threadId, calleeId, callerId });
    expect(useCallStore.getState().status).toBe("rejected");
    expect(useCallStore.getState().endReason).toBe("Call blocked");
  });

  it("ends idempotently and ignores a stale previous call", () => {
    startOutgoingCall({
      threadId,
      calleeId,
      remoteUser: { id: calleeId, username: "Peer", avatar: null },
    });
    applyCallEvent("call_invite", invitePayload());
    const first = endActiveCall();
    const second = endActiveCall();
    expect(first.returnPath).toBe(`/inbox/${threadId}`);
    expect(second.returnPath).toBe(`/inbox/${threadId}`);
    expect(send.mock.calls.filter((row) => row[0] === "call_ended")).toHaveLength(1);
    startOutgoingCall({
      threadId,
      calleeId,
      remoteUser: { id: calleeId, username: "Peer", avatar: null },
    });
    applyCallEvent("call_invite", invitePayload({ callId: otherCallId, roomName: `call_${otherCallId}` }));
    applyCallEvent("call_ended", {
      callId,
      userId: calleeId,
      remoteId: callerId,
      threadId,
    });
    expect(useCallStore.getState().status).toBe("outgoing");
    expect(useCallStore.getState().callId).toBe(otherCallId);
  });

  it("binds one PAGE-006 listener set and isolates accounts", () => {
    const unbind = bindVideoCallSignals(callerId);
    expect(on).toHaveBeenCalledWith("call_invite", expect.any(Function));
    expect(on).toHaveBeenCalledWith("call_accepted", expect.any(Function));
    expect(on).toHaveBeenCalledWith("call_rejected", expect.any(Function));
    expect(on).toHaveBeenCalledWith("call_ended", expect.any(Function));
    startOutgoingCall({
      threadId,
      calleeId,
      remoteUser: { id: calleeId, username: "Peer", avatar: null },
    });
    unbind();
    isolateVideoCallAccount();
    expect(useCallStore.getState().status).toBe("idle");
    expect(useCallStore.getState().viewerId).toBeNull();
    expect(useCallStore.getState().threadId).toBeNull();
    expect(off).toHaveBeenCalledTimes(4);
    resetVideoCall();
  });

  it("uses connected (not active) once LiveKit marks the call connected", () => {
    useCallStore.setState({
      callId,
      status: "connecting",
      remoteUser: { id: calleeId, username: "Peer", avatar: null },
      callerId,
      calleeId,
      threadId,
      roomName: `call_${callId}`,
    });
    markCallConnected();
    expect(useCallStore.getState().status).toBe("connected");
    expect(String(useCallStore.getState().status)).not.toBe("active");
    useCallStore.getState().setActive();
    expect(useCallStore.getState().status).toBe("connected");
  });

  it("clears an incoming invite when the caller ends, without navigating state", () => {
    useCallStore.setState({ viewerId: calleeId });
    applyCallEvent("call_invite", invitePayload());
    expect(useCallStore.getState().status).toBe("incoming");
    applyCallEvent("call_ended", {
      callId,
      userId: callerId,
      remoteId: calleeId,
      threadId,
    });
    expect(useCallStore.getState().status).toBe("idle");
    expect(useCallStore.getState().callId).toBeNull();
    expect(useCallStore.getState().remoteUser).toBeNull();
    expect(acceptIncomingCall(callId).ok).toBe(false);
  });

  it("lets only the first Accept or Decline win", () => {
    useCallStore.setState({ viewerId: calleeId });
    applyCallEvent("call_invite", invitePayload());
    expect(acceptIncomingCall(callId).ok).toBe(true);
    expect(rejectIncomingCall(callId).ok).toBe(false);
    expect(send.mock.calls.filter((row) => row[0] === "call_rejected")).toHaveLength(0);

    isolateVideoCallAccount();
    useCallStore.setState({ viewerId: calleeId });
    applyCallEvent("call_invite", invitePayload());
    expect(rejectIncomingCall(callId).ok).toBe(true);
    expect(acceptIncomingCall(callId).ok).toBe(false);
    expect(send.mock.calls.filter((row) => row[0] === "call_accepted")).toHaveLength(1);
  });

  it("keeps the first incoming invite when a second caller arrives", () => {
    useCallStore.setState({ viewerId: calleeId });
    applyCallEvent("call_invite", invitePayload());
    applyCallEvent(
      "call_invite",
      invitePayload({
        callId: otherCallId,
        callerId: "55555555-5555-4555-8555-555555555555",
        roomName: `call_${otherCallId}`,
      }),
    );
    expect(useCallStore.getState().callId).toBe(callId);
    expect(useCallStore.getState().status).toBe("incoming");
  });
});
