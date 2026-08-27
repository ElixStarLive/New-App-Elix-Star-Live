import { useCallback, useEffect, useState } from 'react';
import { Bookmark, ChevronLeft, Play } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { fetchSaved, type FeedVideo } from '../features/feed/feedApi';
import { formatCompactNumber } from '../lib/formatCompactNumber';

export default function SavedVideos() {
  const navigate = useNavigate();
  const location = useLocation();
  const [videos, setVideos] = useState<FeedVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const { data, error } = await fetchSaved();
    if (error) {
      setLoadError(error.message);
    } else if (data) {
      setVideos(data.videos);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const goBack = useCallback(() => {
    const from = location.state?.from || '/settings';
    navigate(from, { replace: true });
  }, [navigate, location.state]);

  const openVideo = useCallback(
    (videoId: string) => {
      navigate(`/video/${videoId}`, { state: { from: '/saved' } });
    },
    [navigate],
  );

  return (
    <div className="app-live-column h-full w-full text-white flex justify-center px-2">
      <div className="w-full max-w-[480px] h-full flex flex-col overflow-y-auto bg-transparent">
        <div className="p-4 flex items-center gap-4">
          <button onClick={goBack} className="p-1" aria-label="Back">
            <span className="royce-glow-disc">
              <ChevronLeft size={18} strokeWidth={2.35} className="royce-icon-gold" />
            </span>
          </button>
          <h1 className="elix-silver-red-text text-lg font-bold">Saved Videos</h1>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#D8D9DD] border-t-transparent" />
          </div>
        ) : loadError ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 px-8">
            <Bookmark size={48} className="text-white/20" />
            <p className="text-red-400/80 text-sm text-center">{loadError}</p>
          </div>
        ) : videos.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 px-8">
            <Bookmark size={48} className="text-white/20" />
            <p className="text-white/40 text-sm text-center">
              No saved videos yet. Tap the bookmark icon on any video to save it.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-0.5 p-0.5 flex-1 overflow-y-auto">
              {videos.map((video) => (
                <div
                  key={video.id}
                  className="relative aspect-[3/4] cursor-pointer bg-transparent group"
                  onClick={() => openVideo(video.id)}
                >
                  {video.thumbnail ? (
                    <img src={video.thumbnail} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <video
                      src={video.url}
                      className="h-full w-full object-cover"
                      muted
                      playsInline
                      preload="metadata"
                      onMouseOver={(e) => e.currentTarget.play()}
                      onMouseOut={(e) => {
                        e.currentTarget.pause();
                        e.currentTarget.currentTime = 0;
                      }}
                    />
                  )}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 transition-opacity group-hover:opacity-100">
                    <Play size={24} fill="white" className="text-white" />
                  </div>
                  <span className="absolute bottom-1 left-1 text-[10px] font-bold text-white drop-shadow">
                    {formatCompactNumber(video.stats.views)}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
