import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Search, X } from "lucide-react";
import { apiDeleteChatThread, apiListChatThreads, type ChatThread } from "@/features/chat/chatApi";
import { AvatarRing } from "@/components/AvatarRing";
import { FEED_HOME, inboxReturnState } from "@/lib/settingsNav";
import { showToast } from "@/lib/toast";
import { wsClient } from "@/lib/wsClient";

export default function Inbox() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<"main" | "unread">("main");
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    void apiListChatThreads().then((res) => {
      if (res.error) setError(res.error);
      else setThreads(res.threads);
    });
  }, []);

  useEffect(() => {
    load();
    const onDm = () => load();
    wsClient.on("dm_thread_updated", onDm);
    wsClient.on("dm_message", onDm);
    return () => {
      wsClient.off("dm_thread_updated", onDm);
      wsClient.off("dm_message", onDm);
    };
  }, [load]);

  const visible = tab === "unread" ? threads.filter((t) => t.unread) : threads;

  return (
    <div className="page-above-bottom-nav min-h-full">
      <div className="page-above-bottom-nav__inner elix-settings-write min-h-full text-white">
        <header className="px-3 pb-2 border-b border-[#D8D9DD]/45" style={{ paddingTop: "var(--page-header-top)" }}>
          <div className="flex justify-center mb-2">
            <div className="w-10 h-1 rounded-full bg-white/25" />
          </div>
          <div className="flex items-center justify-between">
            <button type="button" className="royce-glow-disc" onClick={() => navigate("/search", { state: inboxReturnState() })} aria-label="Search">
              <Search size={16} />
            </button>
            <h1 className="text-[16px] font-bold">Inbox</h1>
            <button type="button" className="royce-glow-disc" onClick={() => navigate(FEED_HOME, { replace: true })} aria-label="Close">
              <X size={16} />
            </button>
          </div>
          <div className="flex items-center justify-center gap-6 mt-3">
            <button type="button" onClick={() => setTab("main")} className={tab === "main" ? "text-white font-bold text-sm" : "text-white/50 text-sm"}>
              Main
            </button>
            <button type="button" onClick={() => setTab("unread")} className={tab === "unread" ? "text-white font-bold text-sm" : "text-white/50 text-sm"}>
              Unread
            </button>
            <button type="button" onClick={() => navigate("/alerts", { state: inboxReturnState() })} className="royce-glow-disc" aria-label="Alerts">
              <Bell size={16} />
            </button>
          </div>
        </header>
        {error ? <p className="px-4 py-3 text-rose-300 text-sm">{error}</p> : null}
        <div className="px-3 py-2">
          {visible.map((t) => (
            <div key={t.id} className="flex items-center gap-3 py-3 border-b border-white/5">
              <button type="button" className="flex-1 flex items-center gap-3 min-w-0 text-left" onClick={() => navigate(`/inbox/${t.id}`)}>
                <AvatarRing src={t.otherAvatarUrl} alt={t.otherDisplayName} size={48} />
                <div className="min-w-0">
                  <p className="font-semibold truncate">{t.otherDisplayName}</p>
                  <p className="text-[12px] text-white/50 truncate">{t.lastMessage || "No messages yet"}</p>
                </div>
              </button>
              <button
                type="button"
                className="text-[11px] text-white/40"
                onClick={() => {
                  void apiDeleteChatThread(t.id).then((r) => {
                    if (!r.ok) showToast(r.error);
                    else load();
                  });
                }}
              >
                Delete
              </button>
            </div>
          ))}
          {visible.length === 0 && !error ? <p className="text-center text-white/40 text-sm py-10">No conversations</p> : null}
        </div>
      </div>
    </div>
  );
}
