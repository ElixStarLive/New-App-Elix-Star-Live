import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchFriends, type FeedVideo } from '../features/feed/feedApi';
import EnhancedVideoPlayer from '../components/EnhancedVideoPlayer';
import FeedStoryCirclesOverlay from '../components/FeedStoryCirclesOverlay';

export default function FriendsFeed() {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const [videos, setVideos] = useState<FeedVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await fetchFriends();
    if (data) setVideos(data.videos);
    setLoading(false);
  }, []);

  useEffect(() => {
    setActiveIndex(0);
    void load();
    setTimeout(() => containerRef.current?.scrollTo({ top: 0, behavior: 'auto' }), 0);
  }, [load]);

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
  const goDiscover = useCallback(() => navigate('/discover'), [navigate]);
  const goUploadStory = useCallback(() => navigate('/upload?type=story'), [navigate]);

  return (
    <div className="app-live-column relative h-full w-full">
      <FeedStoryCirclesOverlay title="Friends" onSearch={goSearch} onBack={goBack} />

      <div className="mx-auto w-full max-w-[480px] flex h-full flex-1 flex-col overflow-hidden">
        <div
          ref={containerRef}
          onScroll={handleScroll}
          className="h-full w-full snap-y snap-mandatory overflow-y-scroll overscroll-none"
          style={{ scrollSnapType: 'y mandatory', WebkitOverflowScrolling: 'touch' }}
        >
          {videos.map((video, index) => (
            <div
              key={`friends-${video.id}-${index}`}
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
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center p-6 text-center">
              <p className="elix-silver-red-text font-semibold text-base mb-1">No friend videos yet</p>
              <p className="elix-silver-red-text text-sm opacity-60 mb-4">
                Add a photo or video story, or follow people who post.
              </p>
              <button
                type="button"
                onClick={goUploadStory}
                className="mb-3 rounded-full border border-[#D8D9DD]/40 bg-transparent px-5 py-2 text-sm font-bold text-[#F5F5F7]"
              >
                Add story
              </button>
              <button
                type="button"
                onClick={goDiscover}
                className="rounded-full bg-white/10 px-5 py-2 text-sm font-bold text-white"
              >
                Discover people
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
