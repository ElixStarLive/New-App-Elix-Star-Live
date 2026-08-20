import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Radio, RefreshCw, X } from "lucide-react";
import type { LiveStreamCard } from "@shared/contracts";
import { apiLiveStreams } from "@/features/feed/feedApi";
import { AvatarRing } from "@/components/AvatarRing";
import { FEED_HOME, exitToFromLocationState } from "@/lib/settingsNav";

export default function LiveDiscover() {
  const navigate = useNavigate();
  const location = useLocation();
  const [streams, setStreams] = useState<LiveStreamCard[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = (silent = false) => {
    if (!silent) setLoading(true);
    void apiLiveStreams().then((res) => {
      setLoading(false);
      if (res.error) setError(res.error);
      else {
        setError(null);
        setStreams(res.streams);
      }
    });
  };

  useEffect(() => {
    reload();
  }, []);

  return (
    <div className="page-above-bottom-nav bg-transparent text-white">
      <div className="page-above-bottom-nav__inner flex flex-col min-h-0">
        <div
          className="flex-shrink-0 w-full px-3 flex items-center justify-between z-20"
          style={{ paddingTop: "var(--page-header-top)" }}
        >
          <button type="button" onClick={() => reload()} className="p-1" title="Refresh" aria-label="Refresh">
            <RefreshCw size={18} className={`text-white ${loading ? "animate-spin" : ""}`} />
          </button>
          <h1 className="text-sm font-bold text-white">
            Live
            {streams.length > 0 ? <span className="text-white/40 font-medium text-xs ml-1.5">{streams.length}</span> : null}
          </h1>
          <button type="button" onClick={() => navigate(exitToFromLocationState(location.state, FEED_HOME), { replace: true })} className="p-1" title="Back">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          {error ? <p className="px-4 text-rose-300 text-sm">{error}</p> : null}
          {loading && streams.length === 0 ? (
            <div className="flex items-center justify-center py-32">
              <div className="w-8 h-8 border-2 border-[#E6E9EE]/25 border-t-[#E6E9EE] rounded-full animate-spin elix-loader" />
            </div>
          ) : streams.length > 0 ? (
            <div className="grid grid-cols-2 gap-1 px-1 pb-[env(safe-area-inset-bottom,20px)]">
              {streams.map((s, i) => (
                <button
                  key={s.streamId}
                  type="button"
                  onClick={() => navigate(`/watch/${s.streamId}`)}
                  className={`relative overflow-hidden bg-transparent text-left ${i === 0 && streams.length > 2 ? "col-span-2 aspect-[2/1.2]" : "aspect-[3/4]"}`}
                >
                  <div className="absolute inset-0 bg-black flex items-end p-2">
                    <div className="relative z-[1] flex items-center gap-2">
                      <AvatarRing src={s.avatarUrl} alt={s.displayName} size={28} />
                      <div>
                        <p className="text-[12px] font-bold truncate">{s.displayName}</p>
                        <p className="text-[10px] text-white/70">{s.viewerCount} watching</p>
                      </div>
                    </div>
                    <span className="absolute top-2 left-2 text-[10px] font-black text-[#FF2D55]">LIVE</span>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-32 px-8 text-center">
              <div className="w-20 h-20 rounded-full bg-white/[0.02] border border-white/5 flex items-center justify-center mb-5">
                <Radio className="w-8 h-8 text-white/10" />
              </div>
              <p className="text-white/60 font-bold text-base mb-1">No one is live right now</p>
              <p className="text-white/25 text-xs mb-6 max-w-[240px]">Check back later to watch creators streaming live</p>
              <button type="button" onClick={() => reload()} className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-white/5 border border-white/10">
                <RefreshCw size={14} className="text-white/50" />
                <span className="text-white/60 font-bold text-sm">Refresh</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
