import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Flame, Hash, Music, Search, Sparkles, Star, Trophy, Zap } from "lucide-react";
import { apiRequest } from "@/lib/apiClient";
import { isRecord } from "@/lib/isRecord";
import { apiFetchFeed } from "@/features/feed/feedApi";
import type { FeedItem } from "@shared/contracts";
import { DISCOVER_HOME, FEED_HOME, containerReturnState } from "@/lib/settingsNav";
import { X } from "lucide-react";

type Tab = "trending" | "ranking" | "hashtags";

export default function Discover() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<Tab>("trending");
  const [tags, setTags] = useState<string[]>([]);
  const [videos, setVideos] = useState<FeedItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    void Promise.all([apiRequest<unknown>("/api/discover"), apiFetchFeed()]).then(([disc, feed]) => {
      setLoading(false);
      if (disc.error) setError(disc.error.message);
      const list = Array.isArray(disc.data) ? disc.data : isRecord(disc.data) && Array.isArray(disc.data.tags) ? disc.data.tags : [];
      setTags(list.filter((t): t is string => typeof t === "string"));
      if (feed.error || !feed.page) {
        if (feed.error) setError(feed.error);
      } else setVideos(feed.page.items.filter((item) => item.kind === "video"));
    });
  }, []);

  const goSearch = useCallback(() => navigate(`/search`, { state: containerReturnState(DISCOVER_HOME) }), [navigate]);

  return (
    <div className="page-above-bottom-nav bg-transparent text-white relative">
      <div className="page-above-bottom-nav__inner">
        <div className="w-full shrink-0 z-10" style={{ paddingTop: "var(--page-header-top)" }}>
          <div className="flex items-center justify-between px-3 h-10">
            <button type="button" className="p-1" onClick={goSearch} aria-label="Search">
              <Search size={16} className="text-[#F5F5F7]" />
            </button>
            <h1 className="text-[16px] font-bold">Explore</h1>
            <button type="button" onClick={() => navigate(FEED_HOME, { replace: true })} className="p-1" aria-label="Back">
              <X size={18} />
            </button>
          </div>
          <div className="w-full px-3 mb-1.5">
            <div className="w-full flex items-center gap-2 bg-white/5 rounded-xl px-3 py-2 border border-white/10">
              <Search className="w-3.5 h-3.5 text-[#F5F5F7]/50 shrink-0" />
              <input
                type="text"
                placeholder="Search videos, users, hashtags..."
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  if (e.target.value.length >= 2) navigate(`/search`);
                }}
                className="flex-1 min-w-0 bg-transparent outline-none text-[13px] text-gold-metallic placeholder-[#FFFFFF]/30"
              />
            </div>
          </div>
          <div className="w-full px-3 pb-1.5">
            <div className="w-full flex flex-nowrap gap-1.5 overflow-x-auto no-scrollbar">
              <TabChip active={tab === "trending"} onClick={() => setTab("trending")} icon={<Flame className="w-3 h-3" />} label="Trending" />
              <TabChip active={false} onClick={() => navigate("/rising-stars")} icon={<Trophy className="w-3 h-3" />} label="Rising" />
              <TabChip active={tab === "ranking"} onClick={() => setTab("ranking")} icon={<Trophy className="w-3 h-3" />} label="Top 99" />
              <TabChip active={tab === "hashtags"} onClick={() => setTab("hashtags")} icon={<Hash className="w-3 h-3" />} label="Tags" />
              <TabChip active={false} onClick={() => navigate("/music")} icon={<Music className="w-3 h-3" />} label="Music" />
              <TabChip active={false} onClick={() => navigate("/hashtag/comedy")} icon={<Sparkles className="w-3 h-3" />} label="Comedy" />
              <TabChip active={false} onClick={() => navigate("/hashtag/gaming")} icon={<Zap className="w-3 h-3" />} label="Gaming" />
              <TabChip active={false} onClick={() => navigate("/hashtag/dance")} icon={<Star className="w-3 h-3" />} label="Dance" />
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto w-full pb-24">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <div className="w-7 h-7 border-2 border-[#D8D9DD]/20 border-t-[#FFFFFF] rounded-full animate-spin" />
              <p className="text-white/30 text-xs">Loading...</p>
            </div>
          ) : null}
          {error ? <p className="px-4 text-rose-300 text-sm">{error}</p> : null}
          {!loading && (tab === "trending" || tab === "ranking") ? (
            <div className="grid grid-cols-2 gap-1 px-1">
              {videos.map((video) => (
                <button key={video.id} type="button" className="relative aspect-[9/16] overflow-hidden" onClick={() => navigate(`/video/${video.id}`)}>
                  {video.thumbnailUrl || video.mediaUrl ? (
                    video.mediaUrl ? (
                      <video src={video.mediaUrl} className="absolute inset-0 size-full object-cover" muted playsInline />
                    ) : (
                      <img src={video.thumbnailUrl ?? ""} alt="" className="absolute inset-0 size-full object-cover" />
                    )
                  ) : (
                    <div className="absolute inset-0 bg-[#080A0E]" />
                  )}
                  <span className="absolute bottom-2 left-2 text-[10px] font-bold">@{video.username}</span>
                </button>
              ))}
              {videos.length === 0 ? <p className="col-span-2 text-center text-white/30 text-[13px] py-16">No matching videos yet</p> : null}
            </div>
          ) : null}
          {!loading && tab === "hashtags" ? (
            <div className="px-3 pt-2">
              {tags.map((tag, index) => (
                <button key={tag} type="button" className="w-full flex items-center gap-3 p-3 rounded-xl text-left" onClick={() => navigate(`/hashtag/${encodeURIComponent(tag)}`)}>
                  <div className="w-9 h-9 bg-white/5 rounded-xl flex items-center justify-center shrink-0">
                    <Hash className="w-4 h-4 text-[#F5F5F7]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-[13px] truncate">#{tag}</p>
                  </div>
                  <span className="text-[10px] font-bold">#{index + 1}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function TabChip({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold whitespace-nowrap border border-white/10 ${active ? "bg-white/10 text-white" : "text-white/50"}`}
    >
      {icon}
      {label}
    </button>
  );
}
