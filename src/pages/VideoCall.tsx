import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Mic, MicOff, Phone, PhoneOff, SwitchCamera, Video, VideoOff, X } from "lucide-react";
import { useCallStore } from "@/store/useCallStore";
import { apiCallAction } from "@/features/calls/callApi";
import { apiEnsureDmThread } from "@/features/chat/chatApi";
import { LiveKitSession } from "@/lib/livekitSession";
import { AvatarRing } from "@/components/AvatarRing";
import { showToast } from "@/lib/toast";
import { Track } from "livekit-client";

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

export default function VideoCall() {
  const navigate = useNavigate();
  const { callId, status, remoteUser, isAudioMuted, isVideoOff, callStartTime, livekitUrl, livekitToken, toggleAudio, toggleVideo } = useCallStore();
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const sessionRef = useRef<LiveKitSession | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [remoteHasVideo, setRemoteHasVideo] = useState(false);

  const exitToMessages = useCallback(async () => {
    const otherId = remoteUser?.id ?? null;
    if (otherId) {
      const { threadId, error } = await apiEnsureDmThread(otherId);
      if (threadId) {
        navigate(`/inbox/${encodeURIComponent(threadId)}`, { replace: true });
        return;
      }
      showToast(error || "Could not open chat");
    }
    navigate("/inbox", { replace: true });
  }, [navigate, remoteUser?.id]);

  const endCallAndReturn = useCallback(async () => {
    sessionRef.current?.disconnect();
    sessionRef.current = null;
    if (callId) {
      const res = await apiCallAction(callId, "end");
      if (!res.ok) showToast(res.error);
    }
    useCallStore.getState().reset();
    await exitToMessages();
  }, [callId, exitToMessages]);

  useEffect(() => {
    const t = window.setInterval(() => {
      if (callStartTime) setElapsed(Date.now() - callStartTime);
    }, 1000);
    return () => window.clearInterval(t);
  }, [callStartTime]);

  useEffect(() => {
    if (!livekitUrl || !livekitToken) return;
    const session = new LiveKitSession({
      onConnected: () => useCallStore.getState().setActive(),
      onTrackSubscribed: ({ track }) => {
        if (track.kind === Track.Kind.Video && remoteVideoRef.current) {
          track.attach(remoteVideoRef.current);
          setRemoteHasVideo(true);
        }
      },
    });
    sessionRef.current = session;
    void session.connect(livekitUrl, livekitToken).then(async () => {
      await session.publishCamera({ audio: !isAudioMuted, video: !isVideoOff });
      if (localVideoRef.current) session.attachLocalVideo(localVideoRef.current);
    }).catch((err: unknown) => {
      showToast(err instanceof Error ? err.message : "Call failed");
    });
    return () => {
      void session.disconnect();
    };
  }, [livekitUrl, livekitToken, isAudioMuted, isVideoOff]);

  return (
    <div className="relative h-[100dvh] bg-black text-white">
      <video ref={remoteVideoRef} className="absolute inset-0 w-full h-full object-cover" autoPlay playsInline />
      {!remoteHasVideo ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <AvatarRing src={remoteUser?.avatar} alt={remoteUser?.username || "Call"} size={96} />
          <p className="mt-3 font-bold">{remoteUser?.username}</p>
          <p className="text-white/60 text-sm">{status === "incoming" ? "Incoming..." : "Calling..."}</p>
        </div>
      ) : null}
      <video ref={localVideoRef} className="absolute top-4 right-4 w-28 h-40 object-cover rounded-xl bg-black" autoPlay muted playsInline />
      <button type="button" className="absolute top-4 right-36 royce-glow-disc" style={{ top: "calc(var(--safe-top) + 12px)" }} onClick={() => void endCallAndReturn()} aria-label="Close">
        <X size={16} />
      </button>
      <p className="absolute left-1/2 -translate-x-1/2 text-xs" style={{ top: "calc(var(--safe-top) + 16px)" }}>{formatDuration(elapsed)}</p>
      <div className="absolute bottom-10 left-0 right-0 flex items-center justify-center gap-5">
        {status === "incoming" ? (
          <button type="button" className="w-16 h-16 rounded-full bg-[#22C55E] flex items-center justify-center" onClick={() => callId && void apiCallAction(callId, "accept")} aria-label="Accept">
            <Phone className="w-7 h-7" />
          </button>
        ) : null}
        <button type="button" className="royce-glow-disc w-12 h-12" onClick={() => { toggleAudio(); void sessionRef.current?.setMicrophoneEnabled(isAudioMuted); }}>
          {isAudioMuted ? <MicOff size={18} /> : <Mic size={18} />}
        </button>
        <button type="button" className="royce-glow-disc w-12 h-12" onClick={() => { toggleVideo(); void sessionRef.current?.setCameraEnabled(isVideoOff); }}>
          {isVideoOff ? <VideoOff size={18} /> : <Video size={18} />}
        </button>
        <button type="button" className="royce-glow-disc w-12 h-12" aria-label="Switch camera">
          <SwitchCamera size={18} />
        </button>
        <button type="button" className="elix-solid-red w-16 h-16 rounded-full bg-[#EF4444] flex items-center justify-center" onClick={() => void endCallAndReturn()}>
          <PhoneOff className="w-7 h-7 text-white" />
        </button>
      </div>
    </div>
  );
}
