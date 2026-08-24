import { useCallback, useEffect, useRef, useState } from "react";
import { Hash } from "lucide-react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { RoyceBackIcon } from "@/components/royce";
import { apiFetchHashtag, type HashtagVideoHit } from "@/features/feed/feedApi";
import { formatCompactNumber } from "@/lib/formatCompactNumber";
import { DISCOVER_HOME, containerReturnState, exitToFromLocationState } from "@/lib/settingsNav";
import { showToast } from "@/lib/toast";
import { normalizeHashtag } from "@shared/hashtag";

export default function Hashtag() {
  const navigate = useNavigate();
  const location = useLocation();
  const { tag: rawTag } = useParams<{ tag: string }>();
  const tag = normalizeHashtag(rawTag || "");
  const loadSeq = useRef(0);
  const [videos, setVideos] = useState<HashtagVideoHit[]>([]);
  const [useCount, setUseCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const hashtagPath = tag ? `/hashtag/${encodeURIComponent(tag)}` : DISCOVER_HOME;

  const goBack = useCallback(
    () => navigate(exitToFromLocationState(location.state, DISCOVER_HOME), { replace: true }),
    [navigate, location.state],
  );

  const openVideo = useCallback(
    (videoId: string) => navigate(`/video/${videoId}`, { state: containerReturnState(hashtagPath) }),
    [navigate, hashtagPath],
  );

  useEffect(() => {
    if (!tag) {
      setVideos([]);
      setUseCount(0);
      setLoading(false);
      return;
    }
    const seq = ++loadSeq.current;
    setLoading(true);
    void apiFetchHashtag(tag).then((res) => {
      if (seq !== loadSeq.current) return;
      setLoading(false);
      if (res.error) {
        showToast("Failed to load hashtag videos");
        return;
      }
      setUseCount(res.useCount);
      setVideos(res.videos);
    });
    return () => {
      loadSeq.current += 1;
    };
  }, [tag]);

  return (
    <div className="h-full min-h-0 w-full bg-transparent text-white flex justify-center px-2">
      <div className="w-full max-w-[480px] h-full min-h-0 flex flex-col overflow-hidden elix-page-glass bg-transparent">
        <div className="sticky top-0 z-10 px-4 py-6 bg-transparent">
          <div className="flex items-center gap-3 mb-4">
            <button type="button" onClick={goBack} className="p-1 hover:brightness-125 transition" title="Back to For You">
              <RoyceBackIcon />
            </button>
            <div className="w-16 h-16 bg-gradient-to-br from-[#E6E9EE] to-[#E6E9EE] rounded-full flex items-center justify-center">
              <Hash className="w-8 h-8 text-black" />
            </div>
            <div className="flex-1">
              <h1 className="text-2xl font-bold">#{tag}</h1>
              {useCount != null ? (
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-sm text-white/60">{formatCompactNumber(useCount)} videos</span>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="px-4 py-4 flex-1 min-h-0 overflow-y-auto">
          {loading ? (
            <div className="text-center py-12 text-white/40">Loading...</div>
          ) : (
            <div className="grid grid-cols-3 gap-1">
              {videos.map((video) => (
                <button
                  key={video.id}
                  type="button"
                  onClick={() => openVideo(video.id)}
                  className="relative aspect-[9/16] bg-transparent rounded overflow-hidden text-left"
                >
                  {video.thumbnailUrl ? (
                    <img src={video.thumbnailUrl} alt="Video" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-white/5" />
                  )}
                  <div className="absolute bottom-2 left-2 text-white text-xs font-semibold">
                    {formatCompactNumber(video.viewCount)} views
                  </div>
                </button>
              ))}
            </div>
          )}

          {!loading && videos.length === 0 ? (
            <div className="text-center py-12 text-white/40">No videos found for this hashtag</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
