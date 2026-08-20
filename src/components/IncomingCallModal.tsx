import { useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Phone, PhoneOff } from "lucide-react";
import { useCallStore } from "@/store/useCallStore";
import { apiCallAction } from "@/features/calls/callApi";
import { AvatarRing } from "./AvatarRing";
import { showToast } from "@/lib/toast";

export function IncomingCallModal() {
  const navigate = useNavigate();
  const { callId, status, remoteUser } = useCallStore();

  const goCall = useCallback(() => navigate("/call"), [navigate]);

  useEffect(() => {
    if (status === "connecting" && callId) goCall();
  }, [status, callId, goCall]);

  if (status !== "incoming" || !callId || !remoteUser) return null;

  const handleAccept = async () => {
    const result = await apiCallAction(callId, "accept");
    if (!result.ok) {
      showToast(result.error);
      return;
    }
    useCallStore.getState().setConnecting();
    goCall();
  };

  const handleReject = async () => {
    const result = await apiCallAction(callId, "reject");
    if (!result.ok) showToast(result.error);
    useCallStore.getState().reset();
  };

  return (
    <div className="fixed inset-0 z-[100] elix-panel backdrop-blur-md flex items-center justify-center">
      <div className="bg-[rgba(0,0,0,0.35)] rounded-3xl p-8 max-w-sm w-full mx-4 text-center shadow-2xl">
        <AvatarRing src={remoteUser.avatar} alt={remoteUser.username} size={96} className="mx-auto mb-4" />
        <h2 className="text-white text-xl font-bold mb-1">{remoteUser.username}</h2>
        <p className="text-white/60 text-sm mb-8">Incoming video call...</p>
        <div className="flex items-center justify-center gap-12">
          <button
            type="button"
            onClick={() => void handleReject()}
            title="Decline call"
            aria-label="Decline call"
            className="elix-solid-red w-16 h-16 rounded-full bg-[#EF4444] flex items-center justify-center shadow-lg active:scale-95 transition-transform"
          >
            <PhoneOff className="w-7 h-7 text-white" />
          </button>
          <button
            type="button"
            onClick={() => void handleAccept()}
            title="Accept call"
            aria-label="Accept call"
            className="w-16 h-16 rounded-full bg-[#22C55E] flex items-center justify-center shadow-lg active:scale-95 transition-transform animate-pulse"
          >
            <Phone className="w-7 h-7 text-white" />
          </button>
        </div>
      </div>
    </div>
  );
}
