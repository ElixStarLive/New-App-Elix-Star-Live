import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Flame,
  Hash,
  Heart,
  MessageCircle,
  Bookmark,
  MoreHorizontal,
  Music,
  Search,
  Share2,
  Sparkles,
  Star,
  TrendingUp,
  Trophy,
  Users,
  Video as VideoIcon,
  Zap,
} from "lucide-react";
import type { FeedVideo } from "@shared/contracts";
import { FollowingFeedOverlay } from "@/components/FollowingFeedOverlay";
import { AvatarRing } from "@/components/AvatarRing";
import { RoyceIcon } from "@/components/royce";
import {
  apiDiscoverSearch,
  apiFetchDiscover,
  apiFollow,
  apiLikeVideo,
  apiSaveVideo,
  type DiscoverHashtag,
  type DiscoverRanking,
  type DiscoverSearchUser,
} from "@/features/feed/feedApi";
import { getPublicWebOrigin } from "@/lib/api";
import { formatCompactNumber } from "@/lib/formatCompactNumber";
import { nativeShareUrl } from "@/lib/platform";
import {
  DISCOVER_HOME,
  FEED_HOME,
  containerReturnState,
  exitToFromLocationState,
} from "@/lib/settingsNav";
import { showToast } from "@/lib/toast";
import { useAuthStore } from "@/store/useAuthStore";

type Tab = "trending" | "search" | "hashtags" | "ranking";

const DEFAULT_AVATAR = "";

export default function Discover() {
  const navigate = useNavigate();
  const location = useLocation();
  const pageRef = useRef<HTMLDivElement>(null);
  const viewerId = useAuthStore((s) => s.user?.id ?? null);
  const [activeTab, setActiveTab] = useState<Tab>("trending");
  const [searchQuery, setSearchQuery] = useState("");
  const [trendingVideos, setTrendingVideos] = useState<FeedVideo[]>([]);
  const [searchResults, setSearchResults] = useState<{ videos: FeedVideo[]; users: DiscoverSearchUser[] }>({
    videos: [],
    users: [],
  });
  const [trendingHashtags, setTrendingHashtags] = useState<DiscoverHashtag[]>([]);
  const [rankings, setRankings] = useState<DiscoverRanking[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadSeq = useRef(0);
  const searchSeq = useRef(0);
  const viewerRef = useRef<string | null>(viewerId);

  const loadDiscover = useCallback(async () => {
    const seq = ++loadSeq.current;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetchDiscover();
      if (seq !== loadSeq.current) return;
      if (res.error) {
        setError(res.error);
        showToast("Could not load Explore");
        return;
      }
      setTrendingVideos(res.trending);
      setTrendingHashtags(res.hashtags);
      setRankings(res.rankings);
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const switched = viewerRef.current !== viewerId;
    if (switched) {
      viewerRef.current = viewerId;
      loadSeq.current += 1;
      searchSeq.current += 1;
      setSearchQuery("");
      setActiveTab("trending");
      setSearchResults({ videos: [], users: [] });
      setTrendingVideos([]);
      setTrendingHashtags([]);
      setRankings([]);
      setError(null);
    }
    void loadDiscover();
    return () => {
      loadSeq.current += 1;
    };
  }, [viewerId, loadDiscover]);

  const performSearch = useCallback(async (q: string) => {
    if (q.length < 2) return;
    const seq = ++searchSeq.current;
    setLoading(true);
    try {
      const res = await apiDiscoverSearch(q);
      if (seq !== searchSeq.current) return;
      if (res.error) {
        showToast(res.error);
        return;
      }
      setSearchResults({ videos: res.videos, users: res.users });
    } finally {
      if (seq === searchSeq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (searchQuery.length >= 2) {
      const timer = window.setTimeout(() => {
        void performSearch(searchQuery);
      }, 300);
      return () => window.clearTimeout(timer);
    }
    searchSeq.current += 1;
    setSearchResults({ videos: [], users: [] });
    setLoading(false);
    return undefined;
  }, [searchQuery, performSearch]);

  const focusSearch = useCallback(() => {
    document.getElementById("discover-search")?.focus();
  }, []);

  const goBack = useCallback(() => {
    navigate(exitToFromLocationState(location.state, FEED_HOME), { replace: true });
  }, [navigate, location.state]);

  const clearSearchQuery = useCallback(() => {
    setSearchQuery("");
  }, []);

  const tabTrending = useCallback(() => {
    setActiveTab("trending");
    void loadDiscover();
  }, [loadDiscover]);

  const tabRanking = useCallback(() => {
    setActiveTab("ranking");
  }, []);

  const tabHashtags = useCallback(() => {
    setActiveTab("hashtags");
  }, []);

  const goRisingStars = useCallback(() => {
    navigate("/rising-stars", { state: containerReturnState(DISCOVER_HOME) });
  }, [navigate]);

  const searchShortcut = useCallback((q: string) => {
    setSearchQuery(q);
    setActiveTab("search");
  }, []);

  const openCreatorProfile = useCallback(
    (userId: string) => {
      navigate(`/profile/${userId}`, { state: containerReturnState(DISCOVER_HOME) });
    },
    [navigate],
  );

  return (
    <div ref={pageRef} className="page-above-bottom-nav bg-transparent text-white relative">
      <div className="page-above-bottom-nav__inner">
        <div className="w-full shrink-0 z-10 bg-transparent" style={{ paddingTop: "var(--topnav-anchor-top)" }}>
          <FollowingFeedOverlay
            pageRef={pageRef}
            layout="inline"
            title="Explore"
            returnPath={DISCOVER_HOME}
            followingFirst={false}
            onSearch={focusSearch}
            onBack={goBack}
          />

          <div className="w-full px-3 mb-1.5 box-border bg-transparent">
            <div className="w-full flex items-center gap-2 bg-white/5 rounded-xl px-3 py-2 border border-white/10">
              <Search className="w-3.5 h-3.5 text-[#F5F5F7]/50 shrink-0" />
              <input
                id="discover-search"
                type="text"
                placeholder="Search videos, users, hashtags..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  if (e.target.value.length >= 2) setActiveTab("search");
                }}
                className="flex-1 min-w-0 bg-transparent outline-none text-[13px] text-gold-metallic placeholder-[#FFFFFF]/30"
              />
              {searchQuery ? (
                <button type="button" onClick={clearSearchQuery} className="p-0.5 rounded-full bg-transparent border border-white/15 shrink-0" title="Clear">
                  <span className="text-white/50 text-xs leading-none px-1">✕</span>
                </button>
              ) : null}
            </div>
          </div>

          {searchQuery.length < 2 ? (
            <div className="w-full px-3 pb-1.5 box-border">
              <div className="w-full flex flex-nowrap gap-1.5 overflow-x-auto no-scrollbar">
                <TabButton active={activeTab === "trending"} onClick={tabTrending} icon={<Flame className="w-3 h-3" />} label="Trending" />
                <TabButton active={false} onClick={goRisingStars} icon={<Trophy className="w-3 h-3" />} label="Rising" />
                <TabButton active={activeTab === "ranking"} onClick={tabRanking} icon={<Trophy className="w-3 h-3" />} label="Top 99" />
                <TabButton active={activeTab === "hashtags"} onClick={tabHashtags} icon={<Hash className="w-3 h-3" />} label="Tags" />
                <TabButton active={false} onClick={() => searchShortcut("music")} icon={<Music className="w-3 h-3" />} label="Music" />
                <TabButton active={false} onClick={() => searchShortcut("comedy")} icon={<Sparkles className="w-3 h-3" />} label="Comedy" />
                <TabButton active={false} onClick={() => searchShortcut("gaming")} icon={<Zap className="w-3 h-3" />} label="Gaming" />
                <TabButton active={false} onClick={() => searchShortcut("dance")} icon={<Star className="w-3 h-3" />} label="Dance" />
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto w-full bg-transparent pb-24">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <div className="w-7 h-7 border-2 border-[#D8D9DD]/20 border-t-[#FFFFFF] rounded-full animate-spin" />
              <p className="text-white/30 text-xs">Loading...</p>
            </div>
          ) : null}

          {!loading && error && trendingVideos.length === 0 && trendingHashtags.length === 0 && rankings.length === 0 && activeTab !== "search" ? (
            <div className="px-3 pt-6">
              <EmptyState icon={<TrendingUp className="w-10 h-10" />} text="Could not load Explore" sub="Tap Trending to try again." />
            </div>
          ) : null}

          {!loading && activeTab === "trending" && !(error && trendingVideos.length === 0) ? (
            <div className="w-full flex flex-col flex-1 min-h-0 pt-0">
              {trendingVideos.length > 0 ? (
                <DiscoverSnapStack videos={trendingVideos} />
              ) : (
                <div className="px-3 pt-6">
                  <EmptyState
                    icon={<TrendingUp className="w-10 h-10" />}
                    text="No matching videos yet"
                    sub="Creators add tags like nsfw, sexy, or 18+ in the caption or hashtags to appear here."
                  />
                </div>
              )}
            </div>
          ) : null}

          {!loading && activeTab === "search" ? (
            <div className="px-3 pt-3">
              {searchResults.users.length > 0 ? (
                <div className="mb-5">
                  <div className="flex items-center gap-2 mb-2 px-1">
                    <Users className="w-4 h-4 text-[#F5F5F7]" />
                    <h2 className="text-[14px] font-bold text-gold-metallic">Users</h2>
                  </div>
                  <div className="space-y-1">
                    {searchResults.users.map((user) => (
                      <UserSearchResult key={user.userId} user={user} selfId={viewerId ?? undefined} />
                    ))}
                  </div>
                </div>
              ) : null}

              {searchResults.videos.length > 0 ? (
                <div>
                  <div className="flex items-center gap-2 mb-2 px-1">
                    <VideoIcon className="w-4 h-4 text-[#F5F5F7]" />
                    <h2 className="text-[14px] font-bold text-gold-metallic">Videos</h2>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {searchResults.videos.map((video) => (
                      <VideoThumbnail key={video.id} video={video} />
                    ))}
                  </div>
                </div>
              ) : null}

              {searchResults.videos.length === 0 && searchResults.users.length === 0 ? (
                <EmptyState icon={<Search className="w-10 h-10" />} text="No results found" sub="Try different keywords" />
              ) : null}
            </div>
          ) : null}

          {!loading && activeTab === "hashtags" ? (
            <div className="px-3 pt-2">
              {trendingHashtags.length > 0 ? (
                <div className="space-y-0.5">
                  {trendingHashtags.map((hashtag, i) => (
                    <HashtagItem key={hashtag.tag} hashtag={hashtag} index={i} />
                  ))}
                </div>
              ) : (
                <EmptyState icon={<Hash className="w-10 h-10" />} text="No hashtags yet" />
              )}
            </div>
          ) : null}

          {!loading && activeTab === "ranking" ? (
            <div className="px-3 pt-3">
              <div className="bg-gradient-to-br from-white/[0.06] to-white/[0.02] p-4 rounded-2xl mb-3 border border-white/10">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
                    <Trophy className="w-5 h-5 text-white/80" />
                  </div>
                  <div>
                    <h2 className="text-[15px] font-extrabold text-gold-metallic">Weekly Ranking</h2>
                    <p className="text-[11px] text-white/40">Top creators by coins this week</p>
                  </div>
                </div>
              </div>

              {rankings.length > 0 ? (
                <div className="space-y-1.5">
                  {rankings.map((creator) => (
                    <button
                      key={creator.userId}
                      type="button"
                      onClick={() => openCreatorProfile(creator.userId)}
                      className={`w-full flex items-center gap-3 p-2.5 rounded-xl transition text-left ${
                        creator.rank <= 3 ? "bg-white/5" : "hover:bg-white/5"
                      }`}
                    >
                      <div
                        className={`w-7 text-center font-extrabold text-[14px] shrink-0 ${
                          creator.rank <= 3 ? "text-white" : "text-white/25"
                        }`}
                      >
                        {creator.rank}
                      </div>
                      <div className="relative shrink-0">
                        <AvatarRing src={creator.avatarUrl || DEFAULT_AVATAR} alt={creator.username} size={40} />
                        {creator.rank === 1 ? <div className="absolute -top-1.5 -right-1 text-sm">👑</div> : null}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-[13px] truncate text-white">{creator.displayName || creator.username}</h3>
                        <p className="text-[11px] text-white/35 truncate">@{creator.username}</p>
                      </div>
                      <div className="flex items-center gap-1 bg-white/5 px-2.5 py-1 rounded-lg shrink-0">
                        <span className="text-[11px]">🪙</span>
                        <span className="font-bold text-[12px] text-white/80">{formatCompactNumber(creator.totalCoins)}</span>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <EmptyState icon={<Trophy className="w-10 h-10" />} text="No rankings yet this week" sub="Be the first to earn diamonds!" />
              )}
            </div>
          ) : null}

          <div className="h-4" />
        </div>
      </div>
    </div>
  );
}

function DiscoverSnapStack({ videos }: { videos: FeedVideo[] }) {
  if (videos.length === 0) return null;
  const slideH = "min(82dvh,calc(100vw*16/9))";
  return (
    <div
      className="w-full flex-1 min-h-0 overflow-y-auto snap-y snap-mandatory flex flex-col gap-0 pb-0 no-scrollbar"
      style={{
        overscrollBehavior: "contain",
        maxHeight: "min(86dvh, calc(100dvh - 9rem))",
      }}
    >
      {videos.map((video) => (
        <div
          key={video.id}
          className="snap-start shrink-0 w-full overflow-hidden bg-transparent"
          style={{ height: slideH, maxHeight: "min(86dvh, calc(100dvh - 9rem))" }}
        >
          <VideoThumbnail video={video} variant="feed" />
        </div>
      ))}
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap transition-opacity border border-transparent ${
        active ? "opacity-100" : "opacity-45"
      }`}
    >
      {icon}
      <span className="elix-silver-red-text">{label}</span>
    </button>
  );
}

function VideoThumbnail({ video, variant = "grid" }: { video: FeedVideo; variant?: "grid" | "feed" }) {
  const EXPLORE_FEED_VIDEO_DOWN_MM = 3;
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [likeBusy, setLikeBusy] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const feed = variant === "feed";

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !video.url) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) videoRef.current?.play().catch(() => undefined);
        else videoRef.current?.pause();
      },
      { threshold: 0.3 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [video.url]);

  const openVideo = useCallback(() => {
    navigate(`/video/${video.id}`, { state: containerReturnState(DISCOVER_HOME) });
  }, [navigate, video.id]);

  const handleLike = useCallback(
    async (e: MouseEvent) => {
      e.stopPropagation();
      if (likeBusy) return;
      setLikeBusy(true);
      const res = await apiLikeVideo(video.id);
      if (!res.ok) showToast("Could not like video");
      else showToast("Liked");
      setLikeBusy(false);
    },
    [likeBusy, video.id],
  );

  const handleSave = useCallback(
    async (e: MouseEvent) => {
      e.stopPropagation();
      if (saveBusy) return;
      setSaveBusy(true);
      const res = await apiSaveVideo(video.id);
      if (!res.ok) showToast("Could not save video");
      else showToast("Saved");
      setSaveBusy(false);
    },
    [saveBusy, video.id],
  );

  const handleShare = useCallback(
    async (e: MouseEvent) => {
      e.stopPropagation();
      const url = `${getPublicWebOrigin()}/video/${video.id}`;
      const ok = await nativeShareUrl({ title: "Elix Star Live", text: video.description || "Watch on Elix Star", url });
      if (ok) showToast("Shared");
    },
    [video.id, video.description],
  );

  const openVideoMore = useCallback(
    (e: MouseEvent) => {
      e.stopPropagation();
      navigate(`/video/${video.id}`, { state: containerReturnState(DISCOVER_HOME) });
    },
    [navigate, video.id],
  );

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden w-full ${
        feed ? "h-full min-h-0 rounded-none border-0 bg-transparent" : "aspect-[9/16] rounded-xl bg-transparent border border-white/10"
      }`}
    >
      <div className="absolute inset-0 cursor-pointer" style={feed ? { top: `${EXPLORE_FEED_VIDEO_DOWN_MM}mm` } : undefined} onClick={openVideo}>
        {video.url ? (
          <video
            ref={videoRef}
            src={video.url}
            poster={video.thumbnail || undefined}
            muted
            loop
            playsInline
            preload="metadata"
            className="video-media-fill absolute inset-0 size-full"
          />
        ) : (
          <img src={video.thumbnail || DEFAULT_AVATAR} alt="Video" className="absolute inset-0 size-full object-cover" />
        )}
      </div>

      <button type="button" onClick={openVideoMore} className="absolute top-1.5 right-1.5 z-10" title="More">
        <RoyceIcon icon={MoreHorizontal} size={22} tile />
      </button>

      <div className="absolute right-1 bottom-10 flex flex-col items-center gap-2 z-10">
        <button type="button" onClick={handleLike} title="Like" disabled={likeBusy}>
          <RoyceIcon icon={Heart} size={24} tile />
        </button>
        <button type="button" onClick={openVideoMore} title="Comment">
          <RoyceIcon icon={MessageCircle} size={24} tile />
        </button>
        <button type="button" onClick={handleSave} title="Save" disabled={saveBusy}>
          <RoyceIcon icon={Bookmark} size={24} tile />
        </button>
        <button type="button" onClick={handleShare} title="Share">
          <RoyceIcon icon={Share2} size={24} tile />
        </button>
      </div>

      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent pointer-events-none" />
      <div className="absolute bottom-2 left-2 right-10">
        {video.user.username ? (
          <div className="flex items-center gap-1.5 mb-1">
            {video.user.avatar ? (
              <div className="w-5 h-5 rounded-full overflow-hidden shrink-0">
                <img src={video.user.avatar} alt="" className="w-full h-full object-cover object-center" />
              </div>
            ) : null}
            <span className="text-white text-[10px] font-bold drop-shadow-md">@{video.user.username}</span>
          </div>
        ) : null}
        {video.description ? <p className="text-white/80 text-[9px] line-clamp-2 drop-shadow-md">{video.description}</p> : null}
      </div>
    </div>
  );
}

function UserSearchResult({ user, selfId }: { user: DiscoverSearchUser; selfId?: string }) {
  const navigate = useNavigate();
  const [followed, setFollowed] = useState(user.isFollowing);
  const [busy, setBusy] = useState(false);
  const isSelf = Boolean(selfId && selfId === user.userId);

  const openUserProfile = useCallback(() => {
    navigate(`/profile/${user.userId}`, { state: containerReturnState(DISCOVER_HOME) });
  }, [navigate, user.userId]);

  const handleFollow = useCallback(
    async (e: MouseEvent) => {
      e.stopPropagation();
      if (followed || busy || isSelf) return;
      setBusy(true);
      const res = await apiFollow(user.userId);
      setBusy(false);
      if (res.ok) setFollowed(true);
      else showToast(res.error || "Could not follow");
    },
    [busy, followed, isSelf, user.userId],
  );

  return (
    <button type="button" onClick={openUserProfile} className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/5 transition text-left">
      <div className="w-11 h-11 rounded-full overflow-hidden shrink-0">
        <img src={user.avatarUrl || DEFAULT_AVATAR} alt={user.username} className="w-full h-full object-cover object-center" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-bold text-[13px] truncate">{user.username}</p>
        <p className="text-[11px] text-white/40">{formatCompactNumber(user.followerCount || 0)} followers</p>
      </div>
      {!isSelf ? (
        <span
          onClick={handleFollow}
          className={`px-3.5 py-1.5 rounded-lg font-bold text-[11px] ${followed ? "bg-white/10 text-white/60" : "bg-[#E6E9EE] text-white elix-solid-accent"}`}
        >
          {followed ? "Following" : "Follow"}
        </span>
      ) : null}
    </button>
  );
}

function HashtagItem({ hashtag, index }: { hashtag: DiscoverHashtag; index: number }) {
  const navigate = useNavigate();
  const openHashtag = useCallback(() => {
    navigate(`/hashtag/${encodeURIComponent(hashtag.tag)}`, { state: containerReturnState(DISCOVER_HOME) });
  }, [navigate, hashtag.tag]);

  return (
    <button type="button" onClick={openHashtag} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition text-left">
      <div className="w-9 h-9 bg-white/5 rounded-xl flex items-center justify-center shrink-0">
        <Hash className="w-4 h-4 text-[#F5F5F7]" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-bold text-[13px] truncate">#{hashtag.tag}</p>
        <p className="text-[11px] text-white/35">{formatCompactNumber(hashtag.useCount)} videos</p>
      </div>
      <div className="flex items-center gap-1 text-white">
        <TrendingUp className="w-3.5 h-3.5" />
        <span className="text-[10px] font-bold">#{index + 1}</span>
      </div>
    </button>
  );
}

function EmptyState({ icon, text, sub }: { icon: ReactNode; text: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <div className="text-white/10">{icon}</div>
      <p className="text-white/30 text-[13px] font-medium">{text}</p>
      {sub ? <p className="text-white/20 text-[11px]">{sub}</p> : null}
    </div>
  );
}
