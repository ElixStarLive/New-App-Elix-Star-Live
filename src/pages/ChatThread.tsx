import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Send, Video, X } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { apiFetchThreadMessages, apiSendThreadMessage, type ChatMessage } from "@/features/chat/chatApi";
import { apiStartCall } from "@/features/calls/callApi";
import { useCallStore } from "@/store/useCallStore";
import { AvatarRing } from "@/components/AvatarRing";
import { LevelBadge } from "@/components/LevelBadge";
import { INBOX_HOME } from "@/lib/settingsNav";
import { wsClient } from "@/lib/wsClient";
import { showToast } from "@/lib/toast";
import { isRecord } from "@/lib/isRecord";

export default function ChatThread() {
  const { threadId } = useParams();
  const navigate = useNavigate();
  const me = useAuthStore((s) => s.user);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [otherName] = useState("Chat");
  const [otherAvatar] = useState<string | null>(null);
  const [otherId, setOtherId] = useState<string | null>(null);

  useEffect(() => {
    if (!threadId) return;
    void apiFetchThreadMessages(threadId).then((res) => {
      if (res.error) setError(res.error);
      else setMessages(res.messages);
    });
    const onMsg = (data: unknown) => {
      if (!isRecord(data)) return;
      const id = typeof data.id === "string" ? data.id : "";
      const senderId = typeof data.senderId === "string" ? data.senderId : "";
      const body = typeof data.body === "string" ? data.body : "";
      const eventThread = typeof data.threadId === "string" ? data.threadId : "";
      if (eventThread !== threadId || !id || !body || !senderId) return;
      const createdAt = typeof data.createdAt === "string" ? data.createdAt : "";
      setMessages((prev) => [...prev, { id, threadId, senderId, body, createdAt }]);
    };
    wsClient.on("dm_message", onMsg);
    return () => wsClient.off("dm_message", onMsg);
  }, [threadId]);

  useEffect(() => {
    const first = messages.find((m) => m.senderId !== me?.id);
    if (first) setOtherId(first.senderId);
  }, [messages, me?.id]);

  const send = async () => {
    if (!threadId || !draft.trim()) return;
    const sent = await apiSendThreadMessage(threadId, draft.trim());
    if (sent.error || !sent.message) {
      showToast(sent.error || "Could not send");
      return;
    }
    const message = sent.message;
    setMessages((prev) => [...prev, message]);
    setDraft("");
  };

  return (
    <div className="h-[100dvh] flex flex-col text-white page-above-bottom-nav">
      <div className="page-above-bottom-nav__inner flex flex-col h-full">
        <header className="px-3 pb-2 border-b border-[#D8D9DD]/45" style={{ paddingTop: "var(--page-header-top)" }}>
          <div className="flex justify-center mb-2">
            <div className="w-10 h-1 rounded-full bg-white/25" />
          </div>
          <div className="flex items-center justify-between">
            <button
              type="button"
              className="royce-glow-disc"
              aria-label="Video call"
              onClick={() => {
                if (!otherId) {
                  showToast("Cannot start call");
                  return;
                }
                void apiStartCall(otherId).then((r) => {
                  if (!r.invite) {
                    showToast(r.error || "Call failed");
                    return;
                  }
                  useCallStore.getState().setOutgoing({
                    callId: r.invite.callId,
                    remoteUser: { id: otherId, username: otherName, avatar: otherAvatar },
                    livekitUrl: r.invite.livekitUrl,
                    livekitToken: r.invite.livekitToken,
                    roomName: r.invite.roomName,
                  });
                  navigate("/call");
                });
              }}
            >
              <Video size={16} />
            </button>
            <div className="flex flex-col items-center">
              <AvatarRing src={otherAvatar} alt={otherName} size={48} />
              <p className="text-[12px] font-semibold mt-1">{otherName}</p>
            </div>
            <button type="button" className="royce-glow-disc" onClick={() => navigate(INBOX_HOME, { replace: true })} aria-label="Back">
              <X size={16} />
            </button>
          </div>
        </header>
        {error ? <p className="px-3 text-rose-300 text-sm">{error}</p> : null}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
          {messages.map((m) => (
            <div key={m.id} className="flex items-start gap-2">
              <AvatarRing src={m.senderId === me?.id ? me.avatarUrl : otherAvatar} alt="" size={30} />
              <LevelBadge level={0} circleSize={30} size={16} />
              <div>
                <p className="text-[11px] text-white/60">{m.senderId === me?.id ? me.displayName : otherName}</p>
                <p className="text-sm">{m.body}</p>
              </div>
            </div>
          ))}
        </div>
        <form
          className="flex items-center gap-2 px-3 py-3"
          style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 bg-white/10 border border-white/10 rounded-full px-4 py-2"
          />
          <button type="submit" className="royce-glow-disc" aria-label="Send">
            <Send size={16} />
          </button>
        </form>
      </div>
    </div>
  );
}
