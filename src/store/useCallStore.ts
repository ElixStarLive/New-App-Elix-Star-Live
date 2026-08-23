import { create } from "zustand";

export type CallStatus =
  | "idle"
  | "outgoing"
  | "incoming"
  | "connecting"
  | "connected"
  | "rejected"
  | "ended"
  | "failed";

export type CallRemoteUser = {
  id: string;
  username: string;
  avatar: string | null;
};

export type CallState = {
  viewerId: string | null;
  callId: string | null;
  status: CallStatus;
  remoteUser: CallRemoteUser | null;
  callerId: string | null;
  calleeId: string | null;
  threadId: string | null;
  roomName: string | null;
  livekitUrl: string | null;
  livekitToken: string | null;
  isAudioMuted: boolean;
  isVideoOff: boolean;
  callStartTime: number | null;
  endReason: string | null;
  acceptLock: boolean;
  endLock: boolean;
  inviteLock: boolean;
  setIncoming: (payload: {
    callId: string;
    remoteUser: CallRemoteUser;
    livekitUrl?: string;
    livekitToken?: string;
    roomName?: string;
    threadId?: string;
  }) => void;
  setOutgoing: (payload: {
    callId: string;
    remoteUser: CallRemoteUser;
    livekitUrl?: string;
    livekitToken?: string;
    roomName?: string;
    threadId?: string;
  }) => void;
  setConnecting: () => void;
  setActive: () => void;
  toggleAudio: () => void;
  toggleVideo: () => void;
  reset: () => void;
};

const idle: Omit<
  CallState,
  | "setIncoming"
  | "setOutgoing"
  | "setConnecting"
  | "setActive"
  | "toggleAudio"
  | "toggleVideo"
  | "reset"
> = {
  viewerId: null,
  callId: null,
  status: "idle",
  remoteUser: null,
  callerId: null,
  calleeId: null,
  threadId: null,
  roomName: null,
  livekitUrl: null,
  livekitToken: null,
  isAudioMuted: false,
  isVideoOff: false,
  callStartTime: null,
  endReason: null,
  acceptLock: false,
  endLock: false,
  inviteLock: false,
};

export const useCallStore = create<CallState>((set) => ({
  ...idle,
  setIncoming: (payload) =>
    set({
      callId: payload.callId,
      remoteUser: payload.remoteUser,
      callerId: payload.remoteUser.id,
      threadId: payload.threadId ?? null,
      roomName: payload.roomName ?? null,
      livekitUrl: payload.livekitUrl ?? null,
      livekitToken: payload.livekitToken ?? null,
      status: "incoming",
      endReason: null,
      callStartTime: null,
      isAudioMuted: false,
      isVideoOff: false,
      acceptLock: false,
      endLock: false,
    }),
  setOutgoing: (payload) =>
    set({
      callId: payload.callId,
      remoteUser: payload.remoteUser,
      calleeId: payload.remoteUser.id,
      threadId: payload.threadId ?? null,
      roomName: payload.roomName ?? null,
      livekitUrl: payload.livekitUrl ?? null,
      livekitToken: payload.livekitToken ?? null,
      status: "outgoing",
      endReason: null,
      callStartTime: null,
      isAudioMuted: false,
      isVideoOff: false,
    }),
  setConnecting: () => set({ status: "connecting" }),
  setActive: () => set({ status: "connected", callStartTime: Date.now() }),
  toggleAudio: () => set((s) => ({ isAudioMuted: !s.isAudioMuted })),
  toggleVideo: () => set((s) => ({ isVideoOff: !s.isVideoOff })),
  reset: () => set((s) => ({ ...idle, viewerId: s.viewerId, threadId: s.threadId })),
}));
