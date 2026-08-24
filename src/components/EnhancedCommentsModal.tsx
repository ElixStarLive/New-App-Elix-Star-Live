import { useCallback, useEffect, useMemo, useState } from "react";
import { Send } from "lucide-react";
import { apiFetchVideoComments, apiPostVideoComment, apiTrackInteraction } from "@/features/feed/feedApi";
import { AvatarRing } from "@/components/AvatarRing";
import { LevelBadge } from "@/components/LevelBadge";
import { useAuthStore } from "@/store/useAuthStore";
import { showToast } from "@/lib/toast";

type SortMode = "newest" | "oldest" | "mostLiked";

type CommentRow = {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  body: string;
  createdAt: string;
  likeCount: number;
};

export default function EnhancedCommentsModal({
  isOpen,
  onClose,
  videoId,
  onPosted,
}: {
  isOpen: boolean;
  onClose: () => void;
  videoId: string;
  onPosted?: () => void;
}) {
  const user = useAuthStore((state) => state.user);
  const [sortBy, setSortBy] = useState<SortMode>("newest");
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [draft, setDraft] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiFetchVideoComments(videoId);
    setLoading(false);
    if (res.error) {
      showToast(res.error);
      return;
    }
    setComments(res.comments);
  }, [videoId]);

  useEffect(() => {
    if (!isOpen || !videoId) return;
    void load();
  }, [isOpen, videoId, load]);

  const sorted = useMemo(() => {
    const rows = [...comments];
    if (sortBy === "oldest") rows.reverse();
    if (sortBy === "mostLiked") rows.sort((a, b) => b.likeCount - a.likeCount);
    return rows;
  }, [comments, sortBy]);

  if (!isOpen) return null;

  const sortClass = (mode: SortMode) =>
    `text-[11px] font-semibold capitalize ${sortBy === mode ? "text-[#A7A7AD]" : "text-white/60"}`;

  return (
    <div className="fixed inset-0 z-modals flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 pointer-events-auto" onClick={onClose} />
      <div
        className="elix-glass rounded-t-2xl p-3 h-1/2 w-full max-w-[480px] flex flex-col pointer-events-auto relative z-10 bottom-sheet-above-nav border border-black"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-0.5 pb-2">
          <div className="w-10 h-1 rounded-full bg-white/25" />
        </div>
        <div className="relative flex items-center justify-center mb-2 min-h-[28px]">
          <div className="absolute left-0 top-1/2 -translate-y-1/2">
            <button type="button" onClick={() => setSortBy("newest")} className={sortClass("newest")}>
              Newest
            </button>
          </div>
          <h2 className="text-white font-semibold text-sm pointer-events-none">Comments</h2>
          <div className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center gap-3">
            <button type="button" onClick={() => setSortBy("oldest")} className={sortClass("oldest")}>
              Oldest
            </button>
            <button type="button" onClick={() => setSortBy("mostLiked")} className={sortClass("mostLiked")}>
              Most Liked
            </button>
          </div>
        </div>
        <div className="w-full h-px bg-white/15 mb-2" aria-hidden />
        <div className="flex-1 overflow-y-auto no-scrollbar pr-1">
          {loading ? (
            <div className="text-center text-white/60 py-6 text-sm">Loading comments...</div>
          ) : sorted.length === 0 ? (
            <div className="text-center text-white/60 py-6 text-sm">No comments yet.</div>
          ) : (
            <div className="space-y-4">
              {sorted.map((comment) => (
                <div key={comment.id} className="flex gap-2 items-start">
                  <AvatarRing src={comment.avatarUrl} alt={comment.displayName || comment.username} size={28} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <LevelBadge level={1} circleSize={20} size={12} />
                      <span className="text-white text-xs font-semibold truncate">{comment.displayName || comment.username}</span>
                    </div>
                    <p className="text-white/90 text-sm mt-0.5 break-words">{comment.body}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="pt-3 mt-2 border-t border-white/10">
          <form
            className="flex gap-2 items-center"
            onSubmit={(e) => {
              e.preventDefault();
              const body = draft.trim();
              if (!body || posting) return;
              setPosting(true);
              void apiPostVideoComment(videoId, body).then((res) => {
                setPosting(false);
                if (!res.ok) {
                  showToast(res.error);
                  return;
                }
                setDraft("");
                void apiTrackInteraction(videoId, "comment");
                onPosted?.();
                void load();
              });
            }}
          >
            <LevelBadge level={1} circleSize={24} size={14} />
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={user ? "Add a comment..." : "Sign in to comment"}
              disabled={!user || posting}
              rows={1}
              className="flex-1 bg-white/10 border border-white/10 rounded-xl px-3 py-2 text-sm text-white resize-none"
            />
            <button type="submit" disabled={!user || posting || !draft.trim()} className="p-2" aria-label="Send comment">
              <Send size={18} className="text-[#E6E9EE]" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
