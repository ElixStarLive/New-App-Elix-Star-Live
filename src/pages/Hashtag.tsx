import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { ChevronLeft, Hash, TrendingUp } from 'lucide-react';
import { fetchHashtag, type FeedVideo } from '../features/feed/feedApi';
import { formatCompactNumber } from '../lib/formatCompactNumber';

export default function Hashtag() {
  const navigate = useNavigate();
  const location = useLocation();
  const { tag } = useParams<{ tag: string }>();
  const [videos, setVideos] = useState<FeedVideo[]>([]);
  const [loading, setLoading] = useState(true);

  const goBack = useCallback(
    () => navigate((location.state as { from?: string } | null)?.from || '/discover', { replace: true }),
    [navigate, location.state],
  );

  const openVideo = useCallback(
    (videoId: string) => navigate(`/video/${videoId}`, { state: { from: `/hashtag/${tag}` } }),
    [navigate, tag],
  );

  useEffect(() => {
    if (!tag) return;
    let cancelled = false;
    setLoading(true);
    fetchHashtag(tag).then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        // no-op; keep empty
      } else if (data) {
        setVideos(data.videos);
      }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [tag]);

  return (
    <div className="app-live-column h-full w-full text-white flex justify-center px-2">
      <div className="w-full max-w-[480px] h-full flex flex-col overflow-hidden bg-transparent">
        <div className="sticky top-0 z-10 px-4 py-6 bg-transparent">
          <div className="flex items-center gap-3 mb-4">
            <button onClick={goBack} className="p-1 hover:brightness-125 transition" title="Back">
              <span className="royce-glow-disc">
                <ChevronLeft size={18} strokeWidth={2.35} className="royce-icon-gold" />
              </span>
            </button>
            <div className="w-16 h-16 rounded-full bg-[#E6E9EE] flex items-center justify-center">
              <Hash className="w-8 h-8 text-black" />
            </div>
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-white">#{tag}</h1>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-sm text-white/60">{formatCompactNumber(videos.length)} videos</span>
                {videos.length > 10 && (
                  <div className="flex items-center gap-1 text-xs text-white">
                    <TrendingUp className="w-3 h-3" />
                    Trending
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="px-4 py-4 flex-1 overflow-y-auto">
          {loading ? (
            <div className="text-center py-12 text-white/40">Loading...</div>
          ) : (
            <div className="grid grid-cols-3 gap-1">
              {videos.map((video) => (
                <button
                  key={video.id}
                  onClick={() => openVideo(video.id)}
                  className="relative aspect-[9/16] rounded overflow-hidden bg-transparent text-left"
                >
                  <img
                    src={video.thumbnail}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                  <div className="absolute bottom-2 left-2 text-xs font-semibold text-white">
                    {formatCompactNumber(video.stats.views)} views
                  </div>
                </button>
              ))}
            </div>
          )}

          {!loading && videos.length === 0 && (
            <div className="text-center py-12 text-white/40">No videos found for this hashtag</div>
          )}
        </div>
      </div>
    </div>
  );
}
