import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Mic, MicOff, Phone, PhoneOff, SwitchCamera, Video, VideoOff } from "lucide-react";
import { AvatarRing } from "@/components/AvatarRing";
import { RoyceCloseIcon } from "@/components/royce";
import { apiFetchCallToken } from "@/features/calls/callToken";
import {
  acceptIncomingCall,
  callReturnPath,
  endActiveCall,
  markCallConnected,
  markCallFailed,
} from "@/features/calls/videoCallSession";
import { LiveKitSession } from "@/lib/livekitSession";
import { INBOX_HOME } from "@/lib/settingsNav";
import { showToast } from "@/lib/toast";
import { useCallStore } from "@/store/useCallStore";
import { Track } from "livekit-client";

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

export default function VideoCall() {
  const navigate = useNavigate();
  const {
    callId,
    status,
    remoteUser,
    isAudioMuted,
    isVideoOff,
    callStartTime,
    endReason,
    toggleAudio,
    toggleVideo,
  } = useCallStore();

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const sessionRef = useRef<LiveKitSession | null>(null);
  const leavingRef = useRef(false);
  const [elapsed, setElapsed] = useState(0);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [remoteHasVideo, setRemoteHasVideo] = useState(false);
  const [mediaHint, setMediaHint] = useState<string | null>(null);

  const stopLocalMedia = useCallback(() => {
    setLocalStream((prev) => {
      prev?.getTracks().forEach((track) => track.stop());
      return null;
    });
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
  }, []);

  const leaveToThread = useCallback(
    (path: string) => {
      if (leavingRef.current) return;
      leavingRef.current = true;
      sessionRef.current?.disconnect();
      sessionRef.current = null;
      stopLocalMedia();
      setRemoteHasVideo(false);
      navigate(path, { replace: true });
    },
    [navigate, stopLocalMedia],
  );

  const endCallAndReturn = useCallback(() => {
    const { returnPath } = endActiveCall();
    leaveToThread(returnPath);
  }, [leaveToThread]);

  const handleAccept = useCallback(() => {
    if (!callId) return;
    const result = acceptIncomingCall(callId);
    if (!result.ok) showToast(result.error);
  }, [callId]);

  const facingModeRef = useRef(facingMode);
  facingModeRef.current = facingMode;

  const needsLocalMedia =
    Boolean(remoteUser) &&
    (status === "outgoing" || status === "incoming" || status === "connecting" || status === "connected");
  const holdMediaRoom = Boolean(callId) && (status === "connecting" || status === "connected");

  useEffect(() => {
    if (!needsLocalMedia) return;
    let cancelled = false;
    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facingModeRef.current } },
          audio: true,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        setLocalStream(stream);
      } catch {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
          if (cancelled) {
            stream.getTracks().forEach((track) => track.stop());
            return;
          }
          setLocalStream(stream);
        } catch {
          if (!cancelled) {
            showToast("Camera or microphone unavailable");
            markCallFailed("Camera or microphone unavailable");
          }
        }
      }
    })();
    return () => {
      cancelled = true;
      stopLocalMedia();
    };
  }, [needsLocalMedia, remoteUser?.id, stopLocalMedia]);

  useEffect(() => {
    const el = localVideoRef.current;
    if (!el || !localStream) return;
    el.srcObject = localStream;
    return () => {
      el.srcObject = null;
    };
  }, [localStream]);

  useEffect(() => {
    if (!localStream) return;
    localStream.getAudioTracks().forEach((track) => {
      track.enabled = !isAudioMuted;
    });
  }, [isAudioMuted, localStream]);

  useEffect(() => {
    if (!localStream) return;
    localStream.getVideoTracks().forEach((track) => {
      track.enabled = !isVideoOff;
    });
  }, [isVideoOff, localStream]);

  useEffect(() => {
    if (!holdMediaRoom || !callId) return;
    return () => {
      sessionRef.current?.disconnect();
      sessionRef.current = null;
      setRemoteHasVideo(false);
    };
  }, [holdMediaRoom, callId]);

  useEffect(() => {
    if (!holdMediaRoom || !callId || !localStream || sessionRef.current) return;
    if (status !== "connecting") return;
    let cancelled = false;
    const session = new LiveKitSession({
      onConnected: () => {
        if (!cancelled) markCallConnected();
      },
      onDisconnected: () => {
        if (!cancelled) setRemoteHasVideo(false);
      },
      onReconnecting: () => {
        if (!cancelled) setMediaHint("Reconnecting...");
      },
      onReconnected: () => {
        if (!cancelled) setMediaHint(null);
      },
      onTrackSubscribed: ({ track }) => {
        if (cancelled) return;
        if (track.kind === Track.Kind.Video && remoteVideoRef.current) {
          track.attach(remoteVideoRef.current);
          void remoteVideoRef.current.play().catch(() => undefined);
          setRemoteHasVideo(true);
        } else if (track.kind === Track.Kind.Audio) {
          track.attach();
        }
      },
      onTrackUnsubscribed: ({ track }) => {
        if (track.kind === Track.Kind.Video) {
          setRemoteHasVideo(false);
          track.detach();
        }
      },
    });
    sessionRef.current = session;
    void (async () => {
      const { creds, error } = await apiFetchCallToken(callId);
      if (cancelled) return;
      if (useCallStore.getState().callId !== callId) return;
      if (!creds) {
        showToast(error || "Could not join call");
        markCallFailed(error || "Could not join call");
        return;
      }
      try {
        await session.connect(creds.url, creds.token);
        if (cancelled || useCallStore.getState().callId !== callId) return;
        await session.publishFromStream(localStream);
      } catch (err: unknown) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "Call connection failed";
        showToast(msg);
        markCallFailed(msg);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [holdMediaRoom, callId, localStream, status]); // localStream captured only when canConnectMedia first becomes true

  useEffect(() => {
    if (status !== "connected" || !callStartTime) return;
    const interval = window.setInterval(() => {
      setElapsed(Date.now() - callStartTime);
    }, 1000);
    return () => window.clearInterval(interval);
  }, [status, callStartTime]);

  useEffect(() => {
    if (status !== "ended" && status !== "rejected" && status !== "failed") return;
    const path = callReturnPath();
    useCallStore.getState().reset();
    leaveToThread(path);
  }, [status, leaveToThread]);

  useEffect(() => {
    return () => {
      sessionRef.current?.disconnect();
      sessionRef.current = null;
      stopLocalMedia();
    };
  }, [stopLocalMedia]);

  const switchCamera = useCallback(async () => {
    if (!localStream) return;
    const next = facingMode === "user" ? "environment" : "user";
    localStream.getTracks().forEach((track) => track.stop());
    const republish = async (stream: MediaStream) => {
      setFacingMode(next);
      setLocalStream(stream);
      const session = sessionRef.current;
      if (!session) return;
      try {
        await session.publishFromStream(stream);
      } catch {
        showToast("Could not switch camera for the other person");
      }
    };
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: next } },
        audio: true,
      });
      await republish(stream);
    } catch {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        await republish(stream);
      } catch {
        showToast("Could not switch camera");
      }
    }
  }, [localStream, facingMode]);

  if (!remoteUser) {
    return (
      <div className="min-h-[100dvh] h-[100dvh] w-full bg-transparent flex justify-center text-white overflow-hidden">
        <div className="w-full max-w-[480px] mx-auto relative flex items-center justify-center px-4">
          <button
            type="button"
            onClick={() => navigate(INBOX_HOME, { replace: true })}
            className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full flex items-center justify-center bg-white/[0.06] border border-white/15 active:scale-95 transition-transform"
            aria-label="Close"
            title="Close"
          >
            <RoyceCloseIcon />
          </button>
          <p>No active call</p>
        </div>
      </div>
    );
  }

  const statusLabel =
    mediaHint ||
    (status === "outgoing"
      ? "Calling..."
      : status === "incoming"
        ? "Incoming call..."
        : status === "connecting"
          ? "Connecting..."
          : status === "rejected" || status === "ended" || status === "failed"
            ? endReason || "Call ended"
            : formatDuration(elapsed));

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-transparent pb-[var(--bottom-ui-reserve)]">
      <div className="flex flex-1 min-h-0 flex-col w-full max-w-[480px] mx-auto relative">
        <button
          type="button"
          onClick={() => endCallAndReturn()}
          className="absolute top-4 right-4 z-[60] w-10 h-10 rounded-full flex items-center justify-center bg-white/[0.06] border border-white/15 active:scale-95 transition-transform"
          aria-label="Close"
          title="Close"
        >
          <RoyceCloseIcon />
        </button>
        <div className="flex-1 min-h-0 relative w-full">
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className={`w-full h-full object-cover ${remoteHasVideo && status === "connected" ? "" : "hidden"}`}
          />
          {!(remoteHasVideo && status === "connected") && (
            <div className="w-full h-full flex flex-col items-center justify-center gap-4">
              {remoteUser.avatar ? (
                <AvatarRing src={remoteUser.avatar} alt={remoteUser.username} size={96} />
              ) : (
                <div className="w-24 h-24 rounded-full bg-transparent border border-[#D8D9DD]/40 flex items-center justify-center text-3xl text-white">
                  {remoteUser.username[0]?.toUpperCase()}
                </div>
              )}
              <p className="text-white text-lg font-semibold">{remoteUser.username}</p>
              <p className="text-white/60 text-sm">{statusLabel}</p>
            </div>
          )}

          {status === "connected" && (
            <div className="absolute top-12 left-1/2 -translate-x-1/2 bg-transparent/50 px-4 py-1 rounded-full">
              <p className="text-white text-sm font-mono">{statusLabel}</p>
            </div>
          )}

          {localStream && (
            <div className="absolute top-20 right-4 w-28 h-40 rounded-2xl overflow-hidden border-2 border-white/20 bg-transparent shadow-lg">
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover ${isVideoOff ? "hidden" : ""}`}
              />
              {isVideoOff && (
                <div className="w-full h-full flex items-center justify-center bg-transparent">
                  <VideoOff className="w-6 h-6 text-white/50" />
                </div>
              )}
            </div>
          )}
        </div>

        <div className="w-full bg-transparent/80 backdrop-blur-sm pb-10 pt-6 px-6 shrink-0">
          <div className="flex items-center justify-center gap-6">
            <button
              type="button"
              onClick={toggleAudio}
              className={`w-14 h-14 rounded-full flex items-center justify-center ${
                isAudioMuted ? "bg-white/40" : "bg-white/20"
              }`}
            >
              {isAudioMuted ? <MicOff className="w-6 h-6 text-white" /> : <Mic className="w-6 h-6 text-white" />}
            </button>

            <button
              type="button"
              onClick={toggleVideo}
              className={`w-14 h-14 rounded-full flex items-center justify-center ${
                isVideoOff ? "bg-white/40" : "bg-white/20"
              }`}
            >
              {isVideoOff ? <VideoOff className="w-6 h-6 text-white" /> : <Video className="w-6 h-6 text-white" />}
            </button>

            <button
              type="button"
              onClick={() => void switchCamera()}
              title="Switch camera"
              className="w-14 h-14 rounded-full bg-transparent border border-[#D8D9DD]/40 flex items-center justify-center"
            >
              <SwitchCamera className="w-6 h-6 text-white" />
            </button>

            {status === "incoming" && (
              <button
                type="button"
                onClick={() => handleAccept()}
                title="Accept call"
                aria-label="Accept call"
                className="w-16 h-16 rounded-full bg-[#22C55E] flex items-center justify-center shadow-lg active:scale-95 transition-transform"
              >
                <Phone className="w-7 h-7 text-white" />
              </button>
            )}

            <button
              type="button"
              onClick={() => endCallAndReturn()}
              title="End call"
              aria-label="End call"
              className="w-16 h-16 rounded-full bg-[#EF4444] flex items-center justify-center shadow-lg active:scale-95 transition-transform"
            >
              <PhoneOff className="w-7 h-7 text-white" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
