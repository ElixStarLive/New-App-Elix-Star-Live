import { Radio, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
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
  const [activeIds, setActiveIds] = useState<Set<string>>(() => new Set());
  const cardRefs = useRef<Map<string, HTMLElement>>(new Map());
  const observerRef = useRef<IntersectionObserver | null>(null);
  const visibleIdsRef = useRef<Set<string>>(new Set());

  // First visible card should preview immediately (same as For You active slide).
  useEffect(() => {
    if (streams.length === 0) return;
    setActiveIds((prev) => (prev.size > 0 ? prev : new Set([liveKey(streams[0])])));
  }, [streams]);

  // Activate live preview only for cards on screen — one LiveKit room at a time (Android OOM).
  const streamIdsKey = streams.map((s) => liveKey(s)).join(",");
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    observerRef.current?.disconnect();
    visibleIdsRef.current = new Set();
    observerRef.current = new IntersectionObserver(
      (entries) => {
        let changed = false;
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.streamId;
          if (!id) continue;
          const on = entry.isIntersecting && entry.intersectionRatio >= 0.35;
          if (on) {
            if (!visibleIdsRef.current.has(id)) {
              visibleIdsRef.current.add(id);
              changed = true;
            }
          } else if (visibleIdsRef.current.delete(id)) {
            changed = true;
          }
        }
        if (changed) {
          const first = visibleIdsRef.current.values().next().value as string | undefined;
          setActiveIds(first ? new Set([first]) : new Set());
        }
      },
      { threshold: [0, 0.35, 0.6], rootMargin: "40px 0px" },
    );
    for (const el of cardRefs.current.values()) {
      observerRef.current.observe(el);
    }
    return () => observerRef.current?.disconnect();
  }, [streamIdsKey]);

  const setCardRef = useCallback((id: string, el: HTMLDivElement | null) => {
    const prev = cardRefs.current.get(id);
    if (prev && observerRef.current) observerRef.current.unobserve(prev);
    if (el) {
      el.dataset.streamId = id;
      cardRefs.current.set(id, el);
      observerRef.current?.observe(el);
    } else {
      cardRefs.current.delete(id);
    }
  }, []);

  return (
    <div className="app-live-column bg-transparent">
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
              {streams.map((stream, i) => {
                const key = liveKey(stream);
                return (
                  <div
                    key={key}
                    ref={(el) => setCardRef(key, el)}
                    className={`relative overflow-hidden bg-transparent ${
                      i === 0 && streams.length > 2 ? "col-span-2 aspect-[2/1.2]" : "aspect-[3/4]"
                    }`}
                  >
                    <ForYouLiveCard stream={stream} isActive={activeIds.has(key)} />
                  </div>
                );
              })}
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
