import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useForYouFeed } from "@/features/feed/useForYouFeed";
import { ForYouPlayer } from "@/components/ForYouPlayer";
import { ForYouLiveCard } from "@/components/ForYouLiveCard";
import { FollowingFeedOverlay } from "@/components/FollowingFeedOverlay";
import { platform } from "@/lib/platform";

export default function VideoFeed() {
  const pageRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [storyOpen, setStoryOpen] = useState(false);
  const {
    slides,
    activeIndex,
    setActiveIndex,
    loading,
    error,
    hasMore,
    loadingMore,
    reload,
    loadMore,
    updateVideo,
    liveHostIds,
    liveByHost,
  } = useForYouFeed();

  useEffect(() => {
    const vodSlides = slides.filter((slide) => slide.kind === "video").length;
    const vodIndex = activeIndex - (slides.length - vodSlides);
    if (hasMore && !loadingMore && vodIndex >= vodSlides - 5) {
      void loadMore();
    }
  }, [activeIndex, slides, hasMore, loadingMore, loadMore]);

  useEffect(() => {
    if (slides.length === 0) return;
    if (activeIndex >= slides.length) setActiveIndex(Math.max(0, slides.length - 1));
  }, [slides.length, activeIndex, setActiveIndex]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || slides.length === 0) return;
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
  }, [slides, setActiveIndex]);

  return (
    <div ref={pageRef} className="h-full min-h-0 w-full flex flex-col bg-transparent relative">
      <FollowingFeedOverlay
        pageRef={pageRef}
        onStoryOpenChange={setStoryOpen}
        showPageChrome={false}
        sitBelowTopNav
        returnPath="/feed"
        liveByHost={liveByHost}
      />
      <div
        ref={containerRef}
        className="flex-1 min-h-0 w-full overflow-y-scroll snap-y snap-mandatory relative"
        style={{
          scrollSnapType: "y mandatory",
          marginTop: platform.isNative ? undefined : "-4mm",
        }}
      >
        {slides.map((slide, index) => {
          const nearby = Math.abs(index - activeIndex) <= 1;
          const slideStyle: CSSProperties = {
            scrollSnapAlign: "start",
            scrollSnapStop: "always",
            boxSizing: "border-box",
            paddingTop: 0,
            paddingBottom: platform.isNative ? undefined : "3mm",
          };
          return (
            <div
              key={slide.key}
              data-feed-index={index}
              className="h-full w-full shrink-0 snap-start flex flex-col items-center bg-transparent"
              style={slideStyle}
            >
              <div className="w-full flex-1 min-h-0 relative overflow-hidden bg-transparent">
                {slide.kind === "live" ? (
                  nearby ? <ForYouLiveCard stream={slide.stream} isActive={activeIndex === index && !storyOpen} /> : <div className="w-full h-full bg-[#080A0E]" />
                ) : nearby ? (
                  <ForYouPlayer
                    item={slide.item}
                    isActive={activeIndex === index && !storyOpen}
                    creatorLive={liveHostIds.has(slide.item.user.id)}
                    onPatch={(patch) => updateVideo(slide.item.id, patch)}
                  />
                ) : (
                  <div className="w-full h-full bg-[#080A0E]">
                    {slide.item.thumbnail ? (
                      <img src={slide.item.thumbnail} alt="" className="w-full h-full object-cover" />
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {loading && slides.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-8 h-8 border-2 border-[#E6E9EE]/25 border-t-[#E6E9EE] rounded-full animate-spin elix-loader" />
          </div>
        ) : null}

        {!loading && error && slides.length === 0 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center px-6">
            <p className="text-rose-300 text-sm text-center mb-4">{error}</p>
            <button
              type="button"
              onClick={() => void reload()}
              className="px-5 py-2 bg-gold/15 border border-gold/30 rounded-full text-gold-bright text-sm font-bold active:scale-95"
            >
              Retry
            </button>
          </div>
        ) : null}

        {!loading && !error && slides.length === 0 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center px-6">
            <span className="text-3xl mb-4 pointer-events-none">📡</span>
            <p className="text-gold-light/70 font-semibold text-base mb-1 text-center">Nothing here yet</p>
            <p className="text-gold-light/40 text-sm mb-4 text-center">
              Videos and livestreams from everyone appear here. When creators post or go live, it shows up right away.
            </p>
            <button
              type="button"
              onClick={() => void reload()}
              className="px-5 py-2 bg-gold/15 border border-gold/30 rounded-full text-gold-bright text-sm font-bold active:scale-95"
            >
              Refresh
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
