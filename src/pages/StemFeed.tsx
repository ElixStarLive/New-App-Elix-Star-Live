import { useEffect, useRef, useState } from "react";
import { useStemFeed } from "@/features/feed/useStemFeed";
import { ForYouPlayer } from "@/components/ForYouPlayer";
import { StemFeedOverlay } from "@/components/StemFeedOverlay";

export default function StemFeed() {
  const pageRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [storyOpen, setStoryOpen] = useState(false);
  const {
    videos,
    activeIndex,
    setActiveIndex,
    loading,
    error,
    hasMore,
    loadingMore,
    reload,
    loadMore,
    updateVideo,
  } = useStemFeed();

  useEffect(() => {
    if (hasMore && !loadingMore && activeIndex >= videos.length - 5) {
      void loadMore();
    }
  }, [activeIndex, videos.length, hasMore, loadingMore, loadMore]);

  useEffect(() => {
    if (videos.length === 0) return;
    if (activeIndex >= videos.length) setActiveIndex(Math.max(0, videos.length - 1));
  }, [videos.length, activeIndex, setActiveIndex]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || videos.length === 0) return;
    const ratios = new Map<Element, number>();
    const pickActive = () => {
      let bestIdx = 0;
      let bestRatio = -1;
      container.querySelectorAll("[data-feed-index]").forEach((el) => {
        const idx = Number(el.getAttribute("data-feed-index") || "0");
        const ratio = ratios.get(el) ?? 0;
        if (ratio > bestRatio) {
          bestRatio = ratio;
          bestIdx = idx;
        }
      });
      if (bestRatio < 0.01) return;
      setActiveIndex((prev) => (prev === bestIdx ? prev : bestIdx));
    };
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) ratios.set(entry.target, entry.intersectionRatio);
        pickActive();
      },
      {
        root: container,
        threshold: [0, 0.25, 0.5, 0.6, 0.75, 1],
      },
    );
    container.querySelectorAll("[data-feed-index]").forEach((el) => {
      ratios.set(el, 0);
      observer.observe(el);
    });
    pickActive();
    return () => observer.disconnect();
  }, [videos, setActiveIndex]);

  return (
    <div ref={pageRef} className="app-live-column bg-transparent relative">
      <StemFeedOverlay pageRef={pageRef} onStoryOpenChange={setStoryOpen} />
      <div
        ref={containerRef}
        className="flex-1 min-h-0 w-full overflow-y-scroll snap-y snap-mandatory relative bg-transparent"
        style={{ scrollSnapType: "y mandatory" }}
      >
        {videos.map((item, index) => {
          const nearby = Math.abs(index - activeIndex) <= 1;
          return (
            <div
              key={item.id}
              data-feed-index={index}
              className="h-full w-full shrink-0 snap-start flex flex-col items-center bg-transparent"
              style={{
                scrollSnapAlign: "start",
                scrollSnapStop: "always",
                boxSizing: "border-box",
                paddingTop: 0,
                paddingBottom: "3mm",
              }}
            >
              <div className="w-full max-w-[480px] flex-1 min-h-0 relative overflow-hidden bg-transparent">
                {nearby ? (
                  <ForYouPlayer
                    item={item}
                    isActive={activeIndex === index && !storyOpen}
                    creatorLive={false}
                    onPatch={(patch) => updateVideo(item.id, patch)}
                  />
                ) : (
                  <div className="w-full h-full bg-[#080A0E]">
                    {item.thumbnail ? (
                      <img src={item.thumbnail} alt="" className="w-full h-full object-cover" />
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {loading && videos.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[1]">
            <div className="w-8 h-8 border-2 border-[#E6E9EE]/25 border-t-[#E6E9EE] rounded-full animate-spin elix-loader" />
          </div>
        ) : null}

        {!loading && error && videos.length === 0 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center px-6 z-[1]">
            <p className="text-rose-300 text-sm text-center mb-4">{error}</p>
            <button
              type="button"
              onClick={() => void reload()}
              className="px-5 py-2 bg-white/10 border border-[#D8D9DD]/40 rounded-full text-[#F5F5F7] text-sm font-bold pointer-events-auto active:scale-95 transition-transform"
            >
              Refresh
            </button>
          </div>
        ) : null}

        {!loading && !error && videos.length === 0 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-[1]">
            <div className="w-20 h-20 rounded-full bg-transparent border border-white/10 flex items-center justify-center mb-4">
              <span className="text-3xl">🔥</span>
            </div>
            <p className="text-white/60 font-semibold text-base mb-1">Most viewed</p>
            <p className="text-white/30 text-sm mb-4 text-center px-6">
              Nothing in the global list yet. STEM uses trending views plus caption-tagged clips.
            </p>
            <button
              type="button"
              onClick={() => void reload()}
              className="px-5 py-2 bg-white/10 border border-[#D8D9DD]/40 rounded-full text-[#F5F5F7] text-sm font-bold pointer-events-auto active:scale-95 transition-transform"
            >
              Refresh
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
