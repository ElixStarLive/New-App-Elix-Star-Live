import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, X } from "lucide-react";
import { apiListActivity } from "@/features/chat/chatApi";
import { INBOX_HOME } from "@/lib/settingsNav";

function timeAgo(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const sec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  return `${Math.floor(hr / 24)}d`;
}

export default function AlertsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Array<{ id: string; title: string; body: string; createdAt: string }>>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void apiListActivity().then((res) => {
      if (res.error) setError(res.error);
      else setItems(res.items);
    });
  }, []);

  return (
    <div className="page-above-bottom-nav bg-transparent">
      <div className="page-above-bottom-nav__inner bg-transparent flex flex-col min-h-0">
        <div className="px-3 pb-1 flex items-center justify-between relative" style={{ paddingTop: "var(--page-header-top)" }}>
          <div className="w-8" aria-hidden />
          <h2 className="text-sm font-bold text-gold-metallic absolute left-1/2 -translate-x-1/2">Alerts</h2>
          <button type="button" onClick={() => navigate(INBOX_HOME, { replace: true })} className="p-1 z-10" aria-label="Back to inbox">
            <X size={18} />
          </button>
        </div>
        {error ? <p className="px-4 text-rose-300 text-sm">{error}</p> : null}
        <div className="px-4 py-2 space-y-0.5 pb-4">
          {items.length === 0 && !error ? <p className="text-white/50 text-sm py-8 text-center">No alerts yet.</p> : null}
          {items.map((notif) => (
            <div key={notif.id} className="flex items-center gap-3 w-full text-left py-2 px-2">
              <div className="w-12 h-12 rounded-full border border-[#D8D9DD]/40 flex items-center justify-center flex-shrink-0">
                <Bell className="w-6 h-6 text-[#E6E9EE]" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-sm text-gold-metallic">{notif.title}</h3>
                <p className="text-[#E6E9EE] text-xs truncate">{notif.body}</p>
              </div>
              <span className="text-[10px] text-[#C8CDD5]">{notif.createdAt ? timeAgo(notif.createdAt) : ""}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
