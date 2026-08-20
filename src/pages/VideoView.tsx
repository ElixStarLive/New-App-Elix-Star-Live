import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Heart, MessageCircle, Send, X } from "lucide-react";
import { apiRequest } from "@/lib/apiClient";
import { isRecord } from "@/lib/isRecord";
import { apiLikeVideo } from "@/features/feed/feedApi";
import { FEED_HOME, VIDEO_EXIT_TO, exitToFromLocationState } from "@/lib/settingsNav";
import { showToast } from "@/lib/toast";

type CommentRow = { id: string; username: string; body: string };

export default function VideoView() {
  const { videoId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [liked, setLiked] = useState(false);

  const loadComments = useCallback(() => {
    if (!videoId) return;
    void apiRequest<unknown>(`/api/videos/${encodeURIComponent(videoId)}/comments`).then((res) => {
      if (res.error || !isRecord(res.data) || !Array.isArray(res.data.comments)) return;
      const next: CommentRow[] = [];
      for (const raw of res.data.comments) {
        if (!isRecord(raw) || typeof raw.id !== "string") continue;
        next.push({
          id: raw.id,
          username: typeof raw.username === "string" ? raw.username : "",
          body: typeof raw.body === "string" ? raw.body : "",
        });
      }
      setComments(next);
    });
  }, [videoId]);

  useEffect(() => {
    if (!videoId) return;
    void apiRequest<unknown>(`/api/videos/${encodeURIComponent(videoId)}`).then((res) => {
      if (res.error) {
        setError(res.error.message);
        return;
      }
      if (!isRecord(res.data)) {
        setError("Invalid video");
        return;
      }
      setMediaUrl(typeof res.data.mediaUrl === "string" ? res.data.mediaUrl : null);
      setCaption(typeof res.data.caption === "string" ? res.data.caption : "");
      setUsername(typeof res.data.username === "string" ? res.data.username : "");
    });
    loadComments();
  }, [videoId, loadComments]);

  return (
    <div className="h-[100dvh] bg-black text-white relative max-w-[480px] mx-auto">
      <button
        type="button"
        className="absolute top-0 right-3 z-20 p-1"
        style={{ top: "var(--page-header-top)" }}
        onClick={() => navigate(exitToFromLocationState(location.state, VIDEO_EXIT_TO || FEED_HOME), { replace: true })}
        aria-label="Close"
      >
        <X size={20} />
      </button>
      {error ? <p className="absolute top-16 left-4 z-20 text-rose-300 text-sm">{error}</p> : null}
      {mediaUrl ? (
        <video src={mediaUrl} className="absolute inset-0 w-full h-full object-cover" autoPlay loop playsInline />
      ) : (
        <div className="absolute inset-0 bg-[#080A0E]" />
      )}
      <div className="absolute right-3 bottom-36 z-10 flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={() => {
            if (!videoId) return;
            void apiLikeVideo(videoId).then((r) => {
              if (!r.ok) showToast(r.error);
              else setLiked(true);
            });
          }}
        >
          <Heart size={26} className={liked ? "fill-red-500 text-red-500" : "text-white"} />
        </button>
        <MessageCircle size={26} className="text-white" />
      </div>
      <div className="absolute left-3 right-20 bottom-36 z-10">
        {username ? <p className="font-bold text-sm">@{username}</p> : null}
        <p className="text-sm text-white/80">{caption}</p>
      </div>
      <div className="absolute left-0 right-0 bottom-0 z-10 bg-black/80 max-h-[32vh] flex flex-col">
        <div className="flex justify-center pt-2">
          <div className="w-10 h-1 rounded-full bg-white/25" />
        </div>
        <div className="px-3 py-1 flex items-center justify-between">
          <span className="text-[12px] text-white/50">Newest</span>
          <h2 className="text-sm font-bold">Comments</h2>
          <span className="text-[12px] text-white/50">Oldest</span>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-2 space-y-2">
          {comments.map((row) => (
            <p key={row.id} className="text-sm">
              <span className="font-bold">{row.username}</span> {row.body}
            </p>
          ))}
        </div>
        <form
          className="px-4 pb-4 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!videoId || !comment.trim()) return;
            void apiRequest(`/api/videos/${encodeURIComponent(videoId)}/comments`, {
              method: "POST",
              body: JSON.stringify({ body: comment.trim() }),
            }).then((r) => {
              if (r.error) showToast(r.error.message);
              else {
                setComment("");
                loadComments();
              }
            });
          }}
        >
          <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add a comment" className="flex-1 bg-white/10 border border-white/10 rounded-full px-3 py-2" />
          <button type="submit" className="royce-glow-disc" aria-label="Send">
            <Send size={16} />
          </button>
        </form>
      </div>
    </div>
  );
}
