import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";
import { RoyceBackIcon } from "@/components/royce";
import { StoryGoldRingAvatar } from "@/components/StoryGoldRingAvatar";
import { liveEndedKeys } from "@/features/feed/livePresence";
import { alertsTimeAgo } from "@/features/alerts/alertsTimeAgo";
import { createAlertsSession } from "@/features/alerts/alertsSession";
import { useAlertsSession } from "@/features/alerts/useAlertsSession";
import { isRecord } from "@/lib/isRecord";
import { INBOX_HOME, inboxReturnState } from "@/lib/settingsNav";
import { showToast } from "@/lib/toast";
import { wsClient } from "@/lib/wsClient";
import { useAuthStore } from "@/store/useAuthStore";

function liveInitial(title: string): string {
  return title.replace(/\s+is live.*$/i, "").trim().charAt(0).toUpperCase() || "?";
}

function openablePath(actionUrl: string | null): string | null {
  if (!actionUrl) return null;
  const path = actionUrl.trim();
  if (!path.startsWith("/") || path.startsWith("//")) return null;
  return path;
}

export default function AlertsPage() {
  const navigate = useNavigate();
  const me = useAuthStore((s) => s.user);
  const sessionRef = useRef(createAlertsSession());
  const session = sessionRef.current;
  const snap = useAlertsSession(session);
  const viewerId = me?.id || "";

  useEffect(() => {
    if (!viewerId) return;
    void session.load(viewerId).then(() => {
      const after = session.getSnapshot();
      if (after.error) showToast(after.error);
      if (after.markError) showToast(after.markError);
    });
    return () => {
      session.dispose();
    };
  }, [session, viewerId]);

  useEffect(() => {
    const onEnded = (data: unknown) => {
      const hostId = isRecord(data) && typeof data.hostId === "string" ? data.hostId : "";
      const keys = liveEndedKeys(data);
      session.applyStreamEnded(hostId, keys[0] || "");
    };
    wsClient.on("stream_ended", onEnded);
    return () => {
      wsClient.off("stream_ended", onEnded);
    };
  }, [session]);

  return (
    <div className="page-above-bottom-nav bg-transparent">
      <div className="page-above-bottom-nav__inner bg-transparent flex flex-col min-h-0">
        <div className="flex-1 min-h-0 overflow-y-auto bg-transparent">
          <div className="px-3 pt-page-header pb-1 flex items-center justify-between relative bg-transparent">
            <div className="w-8" aria-hidden />
            <h2 className="text-sm font-bold text-gold-bright absolute left-1/2 transform -translate-x-1/2">Alerts</h2>
            <button
              type="button"
              onClick={() => navigate(INBOX_HOME, { replace: true })}
              className="p-1 z-10"
              title="Back to inbox"
              aria-label="Back to inbox"
            >
              <RoyceBackIcon />
            </button>
          </div>

          <div className="px-4 py-2 space-y-0.5 pb-4">
            {snap.phase === "error" && snap.items.length === 0 ? (
              <p className="text-rose-300 text-sm py-8 text-center">{snap.error || "Could not load alerts"}</p>
            ) : snap.phase === "loading" && snap.items.length === 0 ? null : snap.items.length === 0 ? (
              <p className="text-gold-bright/50 text-sm py-8 text-center">No alerts yet.</p>
            ) : (
              snap.items.map((notif) => {
                const liveNotif = notif.kind === "live_started";
                const path = openablePath(notif.actionUrl);
                return (
                  <button
                    key={notif.id}
                    type="button"
                    onClick={() => {
                      if (path) navigate(path, { state: inboxReturnState() });
                    }}
                    className="flex items-center gap-3 w-full text-left py-2 px-2 bg-transparent"
                  >
                    {liveNotif ? (
                      <div className="flex-shrink-0">
                        <StoryGoldRingAvatar size={48} src={notif.imageUrl || ""} alt={liveInitial(notif.title)} live />
                      </div>
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-transparent border border-[#D8D9DD]/40 flex items-center justify-center flex-shrink-0">
                        <Bell className="w-6 h-6 royce-icon-gold" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-sm text-gold-metallic">{notif.title}</h3>
                      <p className="text-gold-bright text-xs truncate">{notif.body}</p>
                    </div>
                    <span className="text-[10px] text-gold-bright">{notif.createdAt ? alertsTimeAgo(notif.createdAt) : ""}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
