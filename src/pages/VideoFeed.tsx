import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { fetchForYou, type FeedVideo } from '../features/feed/feedApi';
import EnhancedVideoPlayer from '../components/EnhancedVideoPlayer';

export default function VideoFeed() {
  const location = useLocation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [videos, setVideos] = useState<FeedVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await fetchForYou();
    if (data) setVideos(data.videos);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (location.pathname === '/feed') {
      setActiveIndex(0);
      void load();
      setTimeout(() => containerRef.current?.scrollTo({ top: 0, behavior: 'auto' }), 0);
    }
  }, [location.pathname, load]);

  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const index = Math.round(container.scrollTop / container.clientHeight);
    if (index >= 0 && index < videos.length) setActiveIndex(index);
  }, [videos.length]);

  const handleVideoEnd = useCallback(
    (index: number) => {
      if (!containerRef.current || index >= videos.length - 1) return;
      containerRef.current.scrollTo({
        top: (index + 1) * containerRef.current.clientHeight,
        behavior: 'smooth',
      });
    },
    [videos.length],
  );

  return (
    <div className="app-live-column relative h-full w-full">
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="h-full w-full snap-y snap-mandatory overflow-y-scroll"
        style={{ scrollSnapType: 'y mandatory' }}
      >
        {videos.map((video, index) => (
          <div
            key={`foryou-${video.id}-${index}`}
            data-feed-index={index}
            className="h-full w-full shrink-0 snap-start"
            style={{ scrollSnapAlign: 'start', scrollSnapStop: 'always' }}
          >
            <div className="h-full w-full">
              <EnhancedVideoPlayer
                video={video}
                isActive={activeIndex === index}
                onVideoEnd={() => handleVideoEnd(index)}
              />
            </div>
          </div>
        ))}

        {loading && videos.length === 0 && (
          <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/25 border-t-white elix-loader" />
          </div>
        )}

        {!loading && videos.length === 0 && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center p-8 text-center">
            <span className="text-3xl mb-4">📡</span>
            <p className="elix-silver-red-text font-semibold text-base mb-1 text-center">
              Nothing here yet
            </p>
            <p className="elix-silver-red-text text-sm opacity-60 mb-4 text-center">
              Videos and livestreams from everyone appear here. When creators post or go live, it shows up right away.
            </p>
            <button
              type="button"
              onClick={load}
              className="rounded-full border border-[#E6E9EE]/30 bg-white/10 px-5 py-2 text-sm font-bold text-white active:scale-95"
            >
              Refresh
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
