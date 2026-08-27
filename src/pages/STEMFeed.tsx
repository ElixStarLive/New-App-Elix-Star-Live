import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { fetchSTEM, type FeedVideo } from '../features/feed/feedApi';
import EnhancedVideoPlayer from '../components/EnhancedVideoPlayer';
import FeedStoryCirclesOverlay from '../components/FeedStoryCirclesOverlay';

export default function STEMFeed() {
  const navigate = useNavigate();
  const location = useLocation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [videos, setVideos] = useState<FeedVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);

  const load = useCallback(async () => {
    const { data } = await fetchSTEM();
    if (data) setVideos(data.videos);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (location.pathname === '/stem') {
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

  const goSearch = useCallback(() => navigate('/search'), [navigate]);
  const goBack = useCallback(() => navigate('/feed', { replace: true }), [navigate]);
  const refresh = useCallback(() => load(), [load]);

  return (
    <div className="app-live-column relative h-full w-full">
      <FeedStoryCirclesOverlay title="STEM" onSearch={goSearch} onBack={goBack} />

      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="h-full w-full snap-y snap-mandatory overflow-y-scroll"
        style={{ scrollSnapType: 'y mandatory' }}
      >
        {videos.map((video, index) => (
          <div
            key={`stem-${video.id}-${index}`}
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
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/25 border-t-white" />
          </div>
        )}

        {!loading && videos.length === 0 && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center p-8 text-center text-white">
            <p className="text-3xl mb-4">🔥</p>
            <p className="font-semibold text-white/80 mb-2">Most viewed</p>
            <p className="text-sm text-white/50 mb-6">
              Nothing in the global list yet. STEM uses trending views plus caption-tagged clips.
            </p>
            <button
              type="button"
              onClick={refresh}
              className="rounded-full border border-white/40 bg-white/10 px-5 py-2 text-sm font-bold text-white active:scale-95"
            >
              Refresh
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
