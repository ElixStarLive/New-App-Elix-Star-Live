import { create } from "zustand";

export type CallStatus = "idle" | "incoming" | "outgoing" | "connecting" | "active";

export type CallRemoteUser = {
  id: string;
  username: string;
  avatar: string | null;
};

type CallState = {
  callId: string | null;
  status: CallStatus;
  remoteUser: CallRemoteUser | null;
  livekitUrl: string | null;
  livekitToken: string | null;
  roomName: string | null;
  isAudioMuted: boolean;
  isVideoOff: boolean;
  callStartTime: number | null;
  setIncoming: (payload: {
    callId: string;
    remoteUser: CallRemoteUser;
    livekitUrl: string;
    livekitToken: string;
    roomName: string;
  }) => void;
  setOutgoing: (payload: {
    callId: string;
    remoteUser: CallRemoteUser;
    livekitUrl: string;
    livekitToken: string;
    roomName: string;
  }) => void;
  setConnecting: () => void;
  setActive: () => void;
  toggleAudio: () => void;
  toggleVideo: () => void;
  reset: () => void;
};

const idle: Omit<
  CallState,
  "setIncoming" | "setOutgoing" | "setConnecting" | "setActive" | "toggleAudio" | "toggleVideo" | "reset"
> = {
  callId: null,
  status: "idle",
  remoteUser: null,
  livekitUrl: null,
  livekitToken: null,
  roomName: null,
  isAudioMuted: false,
  isVideoOff: false,
  callStartTime: null,
};

export const useCallStore = create<CallState>((set) => ({
  ...idle,
  setIncoming: (payload) =>
    set({
      callId: payload.callId,
      remoteUser: payload.remoteUser,
      livekitUrl: payload.livekitUrl,
      livekitToken: payload.livekitToken,
      roomName: payload.roomName,
      status: "incoming",
    }),
  setOutgoing: (payload) =>
    set({
      callId: payload.callId,
      remoteUser: payload.remoteUser,
      livekitUrl: payload.livekitUrl,
      livekitToken: payload.livekitToken,
      roomName: payload.roomName,
      status: "outgoing",
    }),
  setConnecting: () => set({ status: "connecting" }),
  setActive: () => set({ status: "active", callStartTime: Date.now() }),
  toggleAudio: () => set((s) => ({ isAudioMuted: !s.isAudioMuted })),
  toggleVideo: () => set((s) => ({ isVideoOff: !s.isVideoOff })),
  reset: () => set({ ...idle }),
}));
