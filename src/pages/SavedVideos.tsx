import { useCallback, useEffect, useRef, useState } from "react";
import { Bookmark, Play } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { RoyceBackIcon } from "@/components/royce";
import { apiFetchSavedVideos, type SavedVideoHit } from "@/features/feed/feedApi";
import { SETTINGS_HOME, SAVED_HOME, containerReturnState, exitToFromLocationState } from "@/lib/settingsNav";
import { showToast } from "@/lib/toast";
import { subscribeVideoCollection } from "@/lib/videoCollectionEvents";
import { useAuthStore } from "@/store/useAuthStore";

function formatSavedViews(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

export default function SavedVideos() {
  const navigate = useNavigate();
  const location = useLocation();
  const viewerId = useAuthStore((state) => state.user?.id) ?? null;
  const loadSeq = useRef(0);
  const videosRef = useRef<SavedVideoHit[]>([]);
  const [videos, setVideos] = useState<SavedVideoHit[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const goBack = useCallback(
    () => navigate(exitToFromLocationState(location.state, SETTINGS_HOME), { replace: true }),
    [navigate, location.state],
  );

  const openVideo = useCallback(
    (videoId: string) => navigate(`/video/${videoId}`, { state: containerReturnState(SAVED_HOME) }),
    [navigate],
  );

  const load = useCallback(async (offset: number, append: boolean) => {
    const seq = ++loadSeq.current;
    if (append) setLoadingMore(true);
    else setLoading(true);
    const res = await apiFetchSavedVideos(50, offset);
    if (seq !== loadSeq.current) return;
    setLoading(false);
    setLoadingMore(false);
    if (res.error) {
      showToast(res.error || "Failed to load saved videos");
      if (!append && videosRef.current.length === 0) {
        setLoadError(res.error || "Failed to load saved videos");
      }
      return;
    }
    setLoadError(null);
    setHasMore(res.hasMore);
    const next = append
      ? [...videosRef.current, ...res.videos.filter((row) => !videosRef.current.some((prev) => prev.id === row.id))]
      : res.videos;
    videosRef.current = next;
    setVideos(next);
  }, []);

  useEffect(() => {
    setVideos([]);
    setHasMore(false);
    setLoadError(null);
    videosRef.current = [];
    void load(0, false);
    return () => {
      loadSeq.current += 1;
    };
  }, [load, viewerId]);

  useEffect(() => {
    return subscribeVideoCollection((ev) => {
      if (ev.type === "refresh" && (ev.collection === "all" || ev.collection === "saved")) {
        void load(0, false);
        return;
      }
      if (ev.type !== "saved") return;
      if (!ev.saved) {
        const next = videosRef.current.filter((v) => v.id !== ev.videoId);
        videosRef.current = next;
        setVideos(next);
        return;
      }
      void load(0, false);
    });
  }, [load]);

  const loadMore = useCallback(() => {
    void load(videos.length, true);
  }, [load, videos.length]);

  return (
    <div className="h-full min-h-0 w-full bg-transparent text-white flex justify-center px-2">
      <div className="w-full max-w-[480px] h-full min-h-0 flex flex-col overflow-y-auto bg-transparent">
        <div className="p-4 flex items-center gap-4">
          <button type="button" onClick={goBack} className="p-1" aria-label="Back">
            <RoyceBackIcon />
          </button>
          <h1 className="text-lg font-bold text-gold-metallic">Saved Videos</h1>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-10 h-10 border-[3px] border-[#D8D9DD] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : loadError ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 px-8">
            <Bookmark size={48} className="text-white/20" />
            <p className="text-red-400/80 text-sm text-center">{loadError}</p>
          </div>
        ) : videos.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 px-8">
            <Bookmark size={48} className="text-white/20" />
            <p className="text-white/40 text-sm text-center">No saved videos yet. Tap the bookmark icon on any video to save it.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-0.5 p-0.5 flex-1 overflow-y-auto">
              {videos.map((video) => (
                <button
                  key={video.id}
                  type="button"
                  className="aspect-[3/4] bg-transparent relative cursor-pointer group text-left"
                  onClick={() => openVideo(video.id)}
                >
                  {video.thumbnailUrl ? (
                    <img src={video.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <video
                      src={video.mediaUrl}
                      className="w-full h-full object-cover"
                      muted
                      playsInline
                      preload="metadata"
                      onMouseOver={(e) => void e.currentTarget.play()}
                      onMouseOut={(e) => {
                        e.currentTarget.pause();
                        e.currentTarget.currentTime = 0;
                      }}
                    />
                  )}
                  <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Play size={24} fill="white" className="text-white" />
                  </div>
                  <span className="absolute bottom-1 left-1 text-[10px] font-bold text-white drop-shadow">
                    {formatSavedViews(video.viewCount)}
                  </span>
                </button>
              ))}
            </div>
            {hasMore ? (
              <div className="flex justify-center py-3">
                <button
                  type="button"
                  disabled={loadingMore}
                  onClick={loadMore}
                  className="px-4 py-2 rounded-lg bg-white/10 text-xs font-semibold disabled:opacity-40"
                >
                  {loadingMore ? "Loading…" : "Load more"}
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
