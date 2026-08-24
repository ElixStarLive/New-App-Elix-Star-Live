import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Play, Search as SearchIcon, X } from "lucide-react";
import type { FeedVideo } from "@shared/contracts";
import { SEARCH_BROWSE_CATEGORIES, type SearchBrowseCategory } from "@shared/searchCategories";
import { AvatarRing } from "@/components/AvatarRing";
import { RoyceBackIcon } from "@/components/royce";
import { apiFetchSearch, type SearchUserHit } from "@/features/feed/feedApi";
import { formatCompactNumber } from "@/lib/formatCompactNumber";
import { SEARCH_EXIT_TO, exitToFromLocationState, returnToFromLocationState } from "@/lib/settingsNav";
import { showToast } from "@/lib/toast";

export default function SearchPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const loadSeq = useRef(0);
  const touchStart = useRef({ x: 0, y: 0 });
  const [query, setQuery] = useState(() => new URLSearchParams(location.search).get("q") ?? "");
  const [category, setCategory] = useState<SearchBrowseCategory>("All");
  const [users, setUsers] = useState<SearchUserHit[]>([]);
  const [videos, setVideos] = useState<FeedVideo[]>([]);
  const [browse, setBrowse] = useState<FeedVideo[]>([]);
  const [searching, setSearching] = useState(false);
  const [visible, setVisible] = useState(true);
  const exitTo = exitToFromLocationState(location.state, SEARCH_EXIT_TO);
  const resultReturnTo = returnToFromLocationState(location.state);
  const normalizedQuery = query.trim().toLowerCase();

  const finishClose = useCallback(() => {
    navigate(exitTo, { replace: true });
  }, [navigate, exitTo]);

  const closePanel = useCallback(() => {
    setVisible(false);
  }, []);

  useEffect(() => {
    if (visible) return;
    const node = panelRef.current;
    if (!node) {
      finishClose();
      return;
    }
    const onEnd = (event: TransitionEvent) => {
      if (event.target !== node) return;
      if (event.propertyName !== "transform") return;
      finishClose();
    };
    node.addEventListener("transitionend", onEnd);
    return () => node.removeEventListener("transitionend", onEnd);
  }, [visible, finishClose]);

  const load = useCallback(async (q: string, cat: SearchBrowseCategory) => {
    const seq = ++loadSeq.current;
    setSearching(true);
    const res = await apiFetchSearch(q ? { q } : { category: cat });
    if (seq !== loadSeq.current) return;
    setSearching(false);
    if (res.error) {
      showToast("Search failed. Try again.");
      if (q) {
        setUsers([]);
        setVideos([]);
      } else {
        setBrowse([]);
      }
      return;
    }
    if (q) {
      setUsers(res.users);
      setVideos(res.videos);
    } else {
      setUsers([]);
      setVideos([]);
      setBrowse(res.videos);
    }
  }, []);

  useEffect(() => {
    const q = new URLSearchParams(location.search).get("q") ?? "";
    setQuery(q);
  }, [location.search]);

  useEffect(() => {
    if (!normalizedQuery) {
      setUsers([]);
      setVideos([]);
      void load("", category);
      return () => {
        loadSeq.current += 1;
      };
    }
    void load(normalizedQuery, category);
    return () => {
      loadSeq.current += 1;
    };
  }, [normalizedQuery, category, load]);

  const handleSearch = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      const next = query.trim();
      const params = new URLSearchParams(location.search);
      if (next) params.set("q", next);
      else params.delete("q");
      const search = params.toString() ? `?${params.toString()}` : "";
      navigate({ pathname: location.pathname, search }, { replace: true, state: location.state });
    },
    [query, location.pathname, location.search, location.state, navigate],
  );

  const openUser = useCallback(
    (userId: string) => {
      navigate(`/profile/${userId}`, resultReturnTo ? { state: { returnTo: resultReturnTo } } : undefined);
    },
    [navigate, resultReturnTo],
  );

  const openVideo = useCallback(
    (videoId: string) => {
      navigate(`/video/${videoId}`, resultReturnTo ? { state: { returnTo: resultReturnTo } } : undefined);
    },
    [navigate, resultReturnTo],
  );

  return (
    <div className="fixed inset-0 z-[99999] flex justify-center overflow-hidden">
      <div
        className="absolute inset-0 transition-opacity duration-200"
        style={{ backgroundColor: visible ? "rgba(0,0,0,0.6)" : "rgba(0,0,0,0)" }}
        onClick={closePanel}
      />
      <div
        ref={panelRef}
        className="app-live-column elix-page-glass transition-transform duration-200 ease-out"
        style={{
          transform: visible ? "translateY(0)" : "translateY(100%)",
          pointerEvents: visible ? "auto" : "none",
          boxShadow: "0 -8px 30px rgba(0,0,0,0.5)",
          paddingTop: "var(--safe-top)",
          paddingBottom: "var(--bottom-ui-reserve)",
        }}
      >
        <div
          className="flex flex-col shrink-0"
          onTouchStart={(e) => {
            touchStart.current = { x: e.touches[0]?.clientX ?? 0, y: e.touches[0]?.clientY ?? 0 };
          }}
          onTouchEnd={(e) => {
            const dx = (e.changedTouches[0]?.clientX ?? 0) - touchStart.current.x;
            const dy = (e.changedTouches[0]?.clientY ?? 0) - touchStart.current.y;
            if (dy > 80 || Math.abs(dx) > 80) closePanel();
          }}
        >
          <div className="flex justify-center pt-0.5 pb-1" aria-hidden>
            <div className="w-10 h-1 rounded-full bg-white/25" />
          </div>
          <div className="relative flex items-center justify-between px-3 h-10">
            <button
              type="button"
              className="p-1 z-10"
              aria-label="Search"
              title="Search"
              onClick={() => searchInputRef.current?.focus()}
            >
              <SearchIcon size={18} className="text-[#F5F5F7]" />
            </button>
            <h1 className="absolute left-1/2 -translate-x-1/2 text-sm font-bold text-gold-metallic pointer-events-none">
              Search
            </h1>
            <button type="button" onClick={closePanel} className="p-1 z-10" title="Back" aria-label="Back">
              <RoyceBackIcon />
            </button>
          </div>
          <div className="px-3 pb-0">
            <form onSubmit={handleSearch} className="flex items-center gap-2 min-w-0">
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search"
                aria-label="Search"
                className="w-full min-w-0 bg-transparent text-gold-metallic placeholder-[#FFFFFF]/40 py-1 text-sm focus:outline-none border-0 rounded-none"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoFocus
              />
              {query ? (
                <button type="button" onClick={() => setQuery("")} className="shrink-0 text-[#F5F5F7]/60 p-0.5" aria-label="Clear search">
                  <X size={14} />
                </button>
              ) : null}
            </form>
            <div className="mt-1 border-b border-[#D8D9DD]/45" aria-hidden />
          </div>
        </div>

        <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">
          {!normalizedQuery ? (
            <>
              <div className="px-3 pt-1 pb-1 flex gap-2 overflow-x-auto no-scrollbar shrink-0">
                {SEARCH_BROWSE_CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategory(cat)}
                    className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap border border-transparent transition-opacity ${
                      category === cat ? "opacity-100" : "opacity-45"
                    }`}
                  >
                    <span className="elix-silver-red-text">{cat}</span>
                  </button>
                ))}
              </div>
              <SearchBrowseGrid videos={browse} onOpen={openVideo} />
            </>
          ) : (
            <div className="space-y-4 px-4 pb-4">
              {searching ? <div className="text-xs text-[#F5F5F7]/60 text-center py-3">Searching...</div> : null}
              {users.length > 0 ? (
                <div>
                  <h2 className="font-bold mb-2 text-gold-metallic text-sm">Users</h2>
                  <div className="space-y-1">
                    {users.map((user) => (
                      <button
                        key={user.userId}
                        type="button"
                        onClick={() => openUser(user.userId)}
                        className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 transition"
                      >
                        <AvatarRing src={user.avatarUrl} alt={user.username} size={32} />
                        <div className="text-left">
                          <div className="text-xs font-semibold text-gold-metallic">@{user.username}</div>
                          <div className="text-[10px] text-white/50">{user.displayName}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              <div>
                <h2 className="font-bold mb-2 text-gold-metallic text-sm">Videos</h2>
                {!searching && videos.length === 0 ? (
                  <div className="text-xs text-white/40">No videos found.</div>
                ) : (
                  <div className="space-y-2">
                    {videos.map((video) => (
                      <button
                        key={video.id}
                        type="button"
                        onClick={() => openVideo(video.id)}
                        className="w-full flex gap-3 p-2 rounded-xl hover:bg-white/5 transition"
                      >
                        {video.thumbnail || video.url ? (
                          <video
                            src={video.url}
                            poster={video.thumbnail || undefined}
                            className="w-16 h-[88px] rounded-lg object-cover bg-transparent border border-[#D8D9DD]/20"
                            muted
                            playsInline
                            preload="metadata"
                          />
                        ) : (
                          <div className="w-16 h-[88px] rounded-lg bg-white/5 border border-[#D8D9DD]/20" />
                        )}
                        <div className="text-left flex-1">
                          <div className="text-xs font-semibold line-clamp-2">{video.description || ""}</div>
                          <div className="text-[10px] text-[#F5F5F7] mt-1">@{video.user?.username || "user"}</div>
                          <div className="text-[10px] text-white/40 mt-1 line-clamp-1">
                            {(video.hashtags || []).map((tag) => `#${tag.replace(/^#/, "")}`).join(" ")}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SearchBrowseGrid({ videos, onOpen }: { videos: FeedVideo[]; onOpen: (id: string) => void }) {
  if (videos.length === 0) {
    return <div className="text-xs text-white/30 py-3 px-4 text-center w-full">No videos yet.</div>;
  }
  return (
    <div className="w-full px-3 pb-4">
      <div className="grid grid-cols-3 gap-1.5">
        {videos.map((video) => (
          <button
            key={video.id}
            type="button"
            className="relative aspect-[3/4] bg-transparent rounded-lg overflow-hidden"
            onClick={() => onOpen(video.id)}
          >
            {video.thumbnail || video.url ? (
              video.thumbnail ? (
                <img src={video.thumbnail} alt="" className="absolute inset-0 w-full h-full object-cover" />
              ) : (
                <video src={video.url} muted playsInline preload="metadata" className="absolute inset-0 w-full h-full object-cover" />
              )
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <Play size={24} className="text-white/30" />
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />
            <div className="absolute bottom-1.5 left-1.5 right-1.5 flex flex-col items-start gap-0.5">
              <Play size={10} fill="white" className="text-white drop-shadow-md" />
              <span className="text-[10px] font-bold text-white drop-shadow-md leading-none">
                {formatCompactNumber(video.stats?.views ?? 0)}
              </span>
              <span className="text-[9px] text-white/80 truncate max-w-full leading-none">@{video.user?.username || "user"}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
