import { INBOX_HOME } from "@/lib/settingsNav";
import { wsClient } from "@/lib/wsClient";
import { useCallStore, type CallRemoteUser, type CallStatus } from "@/store/useCallStore";
import {
  matchesCurrentCall,
  parseCallAccepted,
  parseCallEnded,
  parseCallInvite,
  parseCallRejected,
  type CallRejectReason,
} from "./callSignals";

const ACTIVE: CallStatus[] = ["outgoing", "incoming", "connecting", "connected"];

function rejectCopy(reason: CallRejectReason): string {
  if (reason === "blocked") return "Call blocked";
  if (reason === "busy") return "User is busy";
  if (reason === "forbidden") return "Call not allowed";
  return "Call declined";
}

export function callReturnPath(): string {
  const threadId = useCallStore.getState().threadId;
  if (!threadId) return INBOX_HOME;
  return `/inbox/${encodeURIComponent(threadId)}`;
}

export function resetVideoCall(): void {
  useCallStore.getState().reset();
}

export function startOutgoingCall(input: {
  threadId: string;
  calleeId: string;
  remoteUser: CallRemoteUser;
}): { ok: true } | { ok: false; error: string } {
  const store = useCallStore.getState();
  if (!input.threadId || !input.calleeId || input.threadId === input.calleeId) {
    return { ok: false, error: "Cannot start call" };
  }
  if (store.inviteLock) return { ok: false, error: "Call already starting" };
  if (ACTIVE.includes(store.status)) return { ok: false, error: "Already in a call" };
  useCallStore.setState({
    inviteLock: true,
    callId: null,
    status: "outgoing",
    remoteUser: input.remoteUser,
    callerId: store.viewerId,
    calleeId: input.calleeId,
    threadId: input.threadId,
    roomName: null,
    livekitUrl: null,
    livekitToken: null,
    isAudioMuted: false,
    isVideoOff: false,
    callStartTime: null,
    endReason: null,
    acceptLock: false,
    endLock: false,
  });
  wsClient.send("call_invite", {
    threadId: input.threadId,
    calleeId: input.calleeId,
  });
  useCallStore.setState({ inviteLock: false });
  return { ok: true };
}

export function acceptIncomingCall(callId: string): { ok: true } | { ok: false; error: string } {
  const store = useCallStore.getState();
  if (store.acceptLock || store.endLock) return { ok: false, error: "Already responding" };
  if (store.status !== "incoming" || !store.callId || store.callId !== callId) {
    return { ok: false, error: "No incoming call" };
  }
  useCallStore.setState({ acceptLock: true, endLock: true, status: "connecting" });
  wsClient.send("call_accepted", { callId });
  return { ok: true };
}

export function rejectIncomingCall(callId: string): { ok: true } | { ok: false; error: string } {
  const store = useCallStore.getState();
  if (store.acceptLock) return { ok: false, error: "Already accepting" };
  if (store.endLock) return { ok: true };
  if (store.status !== "incoming" || !store.callId || store.callId !== callId) {
    return { ok: false, error: "No incoming call" };
  }
  useCallStore.setState({ endLock: true, acceptLock: true });
  wsClient.send("call_rejected", { callId });
  store.reset();
  return { ok: true };
}

export function endActiveCall(): { returnPath: string } {
  const store = useCallStore.getState();
  const returnPath = callReturnPath();
  if (store.endLock) return { returnPath };
  if (!ACTIVE.includes(store.status) && store.status !== "failed") {
    store.reset();
    return { returnPath };
  }
  useCallStore.setState({ endLock: true });
  if (store.callId) {
    wsClient.send("call_ended", { callId: store.callId });
  }
  store.reset();
  return { returnPath };
}

export function markCallConnected(): void {
  const store = useCallStore.getState();
  if (store.status !== "connecting" && store.status !== "connected") return;
  useCallStore.setState({
    status: "connected",
    callStartTime: store.callStartTime ?? Date.now(),
  });
}

export function markCallFailed(reason: string): void {
  const store = useCallStore.getState();
  if (!ACTIVE.includes(store.status) && store.status !== "connecting") return;
  if (store.callId && store.status !== "ended") {
    wsClient.send("call_ended", { callId: store.callId });
  }
  useCallStore.setState({
    status: "failed",
    endReason: reason,
    acceptLock: false,
    endLock: false,
  });
}

function applyInvite(data: unknown): void {
  const invite = parseCallInvite(data);
  if (!invite) return;
  const store = useCallStore.getState();
  const viewerId = store.viewerId;
  if (!viewerId) return;

  if (invite.callerId === viewerId) {
    if (store.status !== "outgoing") return;
    if (!matchesCurrentCall(store, { callId: store.callId, threadId: invite.threadId, calleeId: invite.calleeId })) {
      return;
    }
    useCallStore.setState({
      callId: invite.callId,
      roomName: invite.roomName,
      callerId: invite.callerId,
      calleeId: invite.calleeId,
      threadId: invite.threadId,
      status: "outgoing",
    });
    return;
  }

  if (invite.calleeId !== viewerId) return;
  if (ACTIVE.includes(store.status)) return;
  useCallStore.setState({
    callId: invite.callId,
    status: "incoming",
    remoteUser: {
      id: invite.callerId,
      username: invite.callerUsername,
      avatar: invite.callerAvatar || null,
    },
    callerId: invite.callerId,
    calleeId: invite.calleeId,
    threadId: invite.threadId,
    roomName: invite.roomName,
    livekitUrl: null,
    livekitToken: null,
    isAudioMuted: false,
    isVideoOff: false,
    callStartTime: null,
    endReason: null,
    acceptLock: false,
    endLock: false,
  });
}

function applyAccepted(data: unknown): void {
  const accepted = parseCallAccepted(data);
  if (!accepted) return;
  const store = useCallStore.getState();
  if (!matchesCurrentCall(store, accepted)) return;
  if (store.status !== "outgoing" && store.status !== "connecting") return;
  useCallStore.setState({
    callId: accepted.callId,
    roomName: accepted.roomName,
    threadId: accepted.threadId,
    status: "connecting",
  });
}

function applyRejected(data: unknown): void {
  const rejected = parseCallRejected(data);
  if (!rejected) return;
  const store = useCallStore.getState();
  if (!matchesCurrentCall(store, rejected)) return;
  if (store.status === "incoming") {
    store.reset();
    return;
  }
  if (store.status !== "outgoing" && store.status !== "connecting") return;
  useCallStore.setState({
    status: "rejected",
    endReason: rejectCopy(rejected.reason),
    acceptLock: false,
    endLock: false,
  });
}

function applyEnded(data: unknown): void {
  const ended = parseCallEnded(data);
  if (!ended) return;
  const store = useCallStore.getState();
  if (!matchesCurrentCall(store, ended)) return;
  if (store.status === "incoming") {
    store.reset();
    return;
  }
  if (!ACTIVE.includes(store.status) && store.status !== "failed") return;
  useCallStore.setState({
    status: "ended",
    endReason: "Call ended",
    acceptLock: false,
    endLock: false,
  });
}

export function applyCallEvent(event: string, data: unknown): void {
  if (event === "call_invite") applyInvite(data);
  else if (event === "call_accepted") applyAccepted(data);
  else if (event === "call_rejected") applyRejected(data);
  else if (event === "call_ended") applyEnded(data);
}

export function bindVideoCallSignals(viewerId: string): () => void {
  useCallStore.setState({ viewerId });
  const onInvite = (data: unknown) => applyCallEvent("call_invite", data);
  const onAccepted = (data: unknown) => applyCallEvent("call_accepted", data);
  const onRejected = (data: unknown) => applyCallEvent("call_rejected", data);
  const onEnded = (data: unknown) => applyCallEvent("call_ended", data);
  wsClient.on("call_invite", onInvite);
  wsClient.on("call_accepted", onAccepted);
  wsClient.on("call_rejected", onRejected);
  wsClient.on("call_ended", onEnded);
  return () => {
    wsClient.off("call_invite", onInvite);
    wsClient.off("call_accepted", onAccepted);
    wsClient.off("call_rejected", onRejected);
    wsClient.off("call_ended", onEnded);
  };
}

export function isolateVideoCallAccount(): void {
  resetVideoCall();
  useCallStore.setState({ viewerId: null, threadId: null });
}
