import { Radio, RefreshCw } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { RoyceBackIcon } from "@/components/royce";
import { ForYouLiveCard } from "@/components/ForYouLiveCard";
import { useLiveDiscover } from "@/features/live/useLiveDiscover";
import { liveKey } from "@/features/feed/livePresence";
import { FEED_HOME, exitToFromLocationState } from "@/lib/settingsNav";

export default function LiveDiscover() {
  const navigate = useNavigate();
  const location = useLocation();
  const { streams, loading, reload } = useLiveDiscover();

  return (
    <div className="app-live-column elix-page-glass bg-transparent">
      <div
        className="flex-shrink-0 w-full px-3 flex items-center justify-between z-20"
        style={{
          paddingTop: "var(--topnav-anchor-top)",
          minHeight: "calc(var(--topnav-anchor-top) + var(--topnav-bar-height))",
        }}
      >
        <button
          type="button"
          onClick={() => reload()}
          className="p-1"
          title="Refresh"
          aria-label="Refresh"
        >
          <RefreshCw size={18} className={`text-white ${loading ? "animate-spin" : ""}`} />
        </button>
        <h1 className="text-sm font-bold text-white">
          Live
          {streams.length > 0 ? (
            <span className="text-white/40 font-medium text-xs ml-1.5">{streams.length}</span>
          ) : null}
        </h1>
        <button
          type="button"
          onClick={() => navigate(exitToFromLocationState(location.state, FEED_HOME), { replace: true })}
          className="p-1"
          title="Back"
        >
          <RoyceBackIcon />
        </button>
      </div>

      <div
        className="flex-1 min-h-0 w-full overflow-y-auto"
        style={{ paddingBottom: "var(--bottom-ui-reserve)" }}
      >
        <div className="w-full max-w-[480px] mx-auto">
          {loading && streams.length === 0 ? (
            <div className="flex items-center justify-center py-32">
              <div className="w-8 h-8 border-2 border-[#E6E9EE]/25 border-t-[#E6E9EE] rounded-full animate-spin elix-loader" />
            </div>
          ) : streams.length > 0 ? (
            <div className="grid grid-cols-2 gap-1 px-1 pb-[env(safe-area-inset-bottom,20px)]">
              {streams.map((stream, i) => (
                <div
                  key={liveKey(stream)}
                  className={`relative overflow-hidden bg-transparent ${
                    i === 0 && streams.length > 2 ? "col-span-2 aspect-[2/1.2]" : "aspect-[3/4]"
                  }`}
                >
                  <ForYouLiveCard stream={stream} isActive={i === 0} />
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-32 px-8 text-center">
              <div className="w-20 h-20 rounded-full bg-white/[0.02] border border-white/5 flex items-center justify-center mb-5">
                <Radio className="w-8 h-8 text-white/10" />
              </div>
              <p className="text-white/60 font-bold text-base mb-1">No one is live right now</p>
              <p className="text-white/25 text-xs mb-6 max-w-[240px]">
                Check back later to watch creators streaming live
              </p>
              <button
                type="button"
                onClick={() => reload()}
                className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-white/5 border border-white/10 active:scale-95 transition-all"
              >
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
