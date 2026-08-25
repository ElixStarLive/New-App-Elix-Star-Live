import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, Plus, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { apiFetchStories, apiFollowList, apiFetchProfiles, apiLiveStreams } from "@/features/feed/feedApi";
import { StoryGoldRingAvatar } from "@/components/StoryGoldRingAvatar";
import { usePullRevealStrip } from "@/hooks/usePullRevealStrip";
import { FEED_HOME, containerReturnState } from "@/lib/settingsNav";
import { wsClient } from "@/lib/wsClient";
import { useAuthStore } from "@/store/useAuthStore";

const DEFAULT_AVATAR = "/royce/default-avatar.svg";
const STORY_IMAGE_MS = 5000;

type StoryGroup = {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  stories: Array<{ id: string; mediaUrl: string; thumbnailUrl: string | null }>;
};

type SuggestedUser = {
  id: string;
  username: string;
  name: string;
  avatar_url: string;
  is_live: boolean;
};

export function FollowingFeedOverlay({
  pageRef,
  onStoryOpenChange,
  title = "Following",
  returnPath = "/following",
  followingFirst = true,
  layout = "overlay",
  showPageChrome = true,
  sitBelowTopNav = false,
  liveByHost: liveByHostProp,
  onSearch,
  onBack,
}: {
  pageRef: { current: HTMLElement | null };
  onStoryOpenChange?: (open: boolean) => void;
  title?: string;
  returnPath?: string;
  followingFirst?: boolean;
  layout?: "overlay" | "inline";
  showPageChrome?: boolean;
  sitBelowTopNav?: boolean;
  liveByHost?: Map<string, string>;
  onSearch?: () => void;
  onBack?: () => void;
}) {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [groups, setGroups] = useState<StoryGroup[]>([]);
  const [followedIds, setFollowedIds] = useState<Set<string>>(() => new Set());
  const [suggestedUsers, setSuggestedUsers] = useState<SuggestedUser[]>([]);
  const [fetchedLiveByHost, setFetchedLiveByHost] = useState<Map<string, string>>(() => new Map());
  const liveByHost = liveByHostProp ?? fetchedLiveByHost;
  const [storyViewer, setStoryViewer] = useState<{ group: StoryGroup; itemIndex: number } | null>(null);
  const { visible } = usePullRevealStrip(pageRef, {
    disabled: Boolean(storyViewer),
    initiallyVisible: true,
  });

  const reloadStories = useCallback(() => {
    void apiFetchStories().then((res) => {
      if (res.error) return;
      setGroups(res.users);
    });
  }, []);

  const reloadFollowedIds = useCallback(() => {
    if (!followingFirst || !user?.id) {
      setFollowedIds(new Set());
      return;
    }
    void apiFollowList(user.id, "following").then((res) => {
      if (res.error) return;
      setFollowedIds(new Set(res.users.map((row) => row.id)));
    });
  }, [followingFirst, user?.id]);

  const reloadLive = useCallback(() => {
    if (liveByHostProp) return;
    void apiLiveStreams().then((res) => {
      if (res.error) return;
      const next = new Map<string, string>();
      for (const stream of res.streams) {
        const roomId = stream.roomId || stream.streamId;
        if (stream.hostId && roomId) next.set(stream.hostId, roomId);
      }
      setFetchedLiveByHost(next);
    });
  }, [liveByHostProp]);

  const reloadSuggested = useCallback(() => {
    void Promise.all([apiFetchProfiles(), apiLiveStreams()]).then(([profilesResult, liveResult]) => {
      if (profilesResult.error || liveResult.error) return;
      const liveHosts = new Set(
        liveResult.streams.map((stream) => stream.hostId).filter((id): id is string => Boolean(id)),
      );
      const mapped: SuggestedUser[] = profilesResult.profiles
        .map((p) => ({
          id: p.id,
          username: p.username || "user",
          name: p.displayName || p.username || "User",
          avatar_url: p.avatarUrl || "",
          is_live: liveHosts.has(p.id),
        }))
        .filter((p) => Boolean(p.id) && p.id !== user?.id);
      setSuggestedUsers(mapped);
    });
  }, [user?.id]);

  useEffect(() => {
    reloadStories();
    reloadFollowedIds();
    reloadLive();
    reloadSuggested();
    const onFocus = () => {
      reloadStories();
      reloadFollowedIds();
      reloadLive();
      reloadSuggested();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [reloadFollowedIds, reloadLive, reloadStories, reloadSuggested]);

  useEffect(() => {
    if (liveByHostProp) return;
    const onStarted = () => {
      reloadLive();
      reloadSuggested();
    };
    const onEnded = () => {
      reloadLive();
      reloadSuggested();
    };
    wsClient.on("stream_started", onStarted);
    wsClient.on("stream_ended", onEnded);
    return () => {
      wsClient.off("stream_started", onStarted);
      wsClient.off("stream_ended", onEnded);
    };
  }, [liveByHostProp, reloadLive, reloadSuggested]);

  useEffect(() => {
    onStoryOpenChange?.(Boolean(storyViewer));
  }, [onStoryOpenChange, storyViewer]);

  const ownStory = user?.id ? groups.find((g) => g.userId === user.id) : undefined;
  const storyCircles = useMemo(() => {
    const others = groups.filter((g) => g.userId !== user?.id && g.stories.length > 0);
    return [...others].sort((a, b) => {
      if (followingFirst) {
        const aF = followedIds.has(a.userId) ? 0 : 1;
        const bF = followedIds.has(b.userId) ? 0 : 1;
        if (aF !== bF) return aF - bF;
      }
      const aLive = liveByHost.has(a.userId) ? 0 : 1;
      const bLive = liveByHost.has(b.userId) ? 0 : 1;
      return aLive - bLive;
    });
  }, [followedIds, followingFirst, groups, liveByHost, user?.id]);
  const suggestedStrip = useMemo(() => {
    const storyIds = new Set(storyCircles.map((g) => g.userId));
    return [...suggestedUsers]
      .filter((u) => !storyIds.has(u.id))
      .sort((a, b) => {
        if (followingFirst) {
          const aF = followedIds.has(a.id) ? 0 : 1;
          const bF = followedIds.has(b.id) ? 0 : 1;
          if (aF !== bF) return aF - bF;
        }
        if (a.is_live === b.is_live) return 0;
        return a.is_live ? -1 : 1;
      });
  }, [followedIds, followingFirst, storyCircles, suggestedUsers]);
  const stripShown = visible && !storyViewer;
  const storyItem = storyViewer ? storyViewer.group.stories[storyViewer.itemIndex] : null;

  const goSearch = useCallback(() => {
    if (onSearch) {
      onSearch();
      return;
    }
    navigate("/search", { state: containerReturnState(returnPath) });
  }, [navigate, onSearch, returnPath]);

  const goBack = useCallback(() => {
    if (onBack) {
      onBack();
      return;
    }
    navigate(FEED_HOME, { replace: true });
  }, [navigate, onBack]);

  const goUploadStory = useCallback(() => {
    navigate("/upload?type=story");
  }, [navigate]);

  const advanceStory = useCallback(() => {
    setStoryViewer((prev) => {
      if (!prev) return null;
      const next = prev.itemIndex + 1;
      if (next >= prev.group.stories.length) return null;
      return { group: prev.group, itemIndex: next };
    });
  }, []);

  useEffect(() => {
    if (!storyViewer || !storyItem?.mediaUrl) return;
    if (!/\.(png|jpe?g|gif|webp)(\?|$)/i.test(storyItem.mediaUrl)) return;
    const timer = window.setTimeout(() => advanceStory(), STORY_IMAGE_MS);
    return () => window.clearTimeout(timer);
  }, [advanceStory, storyViewer, storyItem?.mediaUrl, storyItem?.id]);

  const stripBody = (
        <div
          className={`${layout === "overlay" ? "feed-column-width" : ""} w-full feed-story-strip ${stripShown ? "overflow-visible" : "overflow-hidden"}`}
          style={layout === "overlay" && !sitBelowTopNav ? { paddingTop: "var(--safe-top)" } : undefined}
        >
          {showPageChrome ? (
          <div
            className="w-full px-3 flex items-center justify-between pointer-events-auto"
            style={{ minHeight: "var(--topnav-bar-height)" }}
          >
            <button type="button" onClick={goSearch} className="p-1" aria-label="Search">
              <Search size={18} className="text-white" />
            </button>
            <h1 className="elix-silver-red-text text-sm font-bold drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">{title}</h1>
            <button type="button" onClick={goBack} className="p-1" title="Back" aria-label="Back">
              <span className="royce-glow-disc" aria-hidden>
                <ChevronLeft size={18} strokeWidth={2.35} className="royce-icon-gold block" />
              </span>
            </button>
          </div>
          ) : null}
          <div className="px-4 pt-0 pb-1 overflow-visible pointer-events-auto">
            <div
              className="w-full flex gap-3 overflow-x-auto overflow-y-visible no-scrollbar min-h-[78px]"
              style={{ WebkitOverflowScrolling: "touch" }}
            >
              <button
                type="button"
                onClick={() => {
                  if (ownStory?.stories.length) setStoryViewer({ group: ownStory, itemIndex: 0 });
                  else goUploadStory();
                }}
                className="flex-shrink-0 flex flex-col items-center gap-0.5"
                style={{ width: 80, minWidth: 80 }}
                title="Add story"
              >
                <div className="relative overflow-visible" style={{ width: 58, height: 58 }}>
                  <StoryGoldRingAvatar size={58} src={user?.avatarUrl || DEFAULT_AVATAR} alt={user?.username || "You"} />
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      goUploadStory();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.stopPropagation();
                        goUploadStory();
                      }
                    }}
                    className="absolute bottom-0 right-0 w-4 h-4 rounded-full bg-[#E6E9EE] border-2 border-black flex items-center justify-center z-10"
                  >
                    <Plus size={9} className="text-black" strokeWidth={3} />
                  </span>
                </div>
                <div className="elix-silver-red-text text-[10px] truncate w-full text-center leading-tight">
                  {ownStory?.stories.length ? "Your story" : "Add story"}
                </div>
              </button>
              {storyCircles.map((g) => {
                const roomId = liveByHost.get(g.userId);
                return (
                  <button
                    key={`story-${g.userId}`}
                    type="button"
                    onClick={() => {
                      if (roomId) navigate(`/watch/${encodeURIComponent(roomId)}`);
                      else setStoryViewer({ group: g, itemIndex: 0 });
                    }}
                    className="flex-shrink-0 flex flex-col items-center gap-0.5"
                    style={{ width: 80, minWidth: 80 }}
                    title={g.displayName || g.username}
                  >
                    <StoryGoldRingAvatar
                      size={58}
                      live={Boolean(roomId)}
                      data-avatar-circle={roomId ? "live" : undefined}
                      src={g.avatarUrl || DEFAULT_AVATAR}
                      alt={g.displayName || g.username}
                    />
                    <div className="elix-silver-red-text text-[10px] truncate w-full text-center leading-tight">
                      {g.displayName || g.username}
                    </div>
                  </button>
                );
              })}
              {suggestedStrip.map((u) => {
                const roomId = liveByHost.get(u.id);
                const isLive = u.is_live || Boolean(roomId);
                return (
                  <button
                    key={`suggest-${u.id}`}
                    type="button"
                    onClick={() => {
                      if (isLive && roomId) navigate(`/watch/${encodeURIComponent(roomId)}`);
                      else navigate(`/profile/${u.id}`, { state: containerReturnState(returnPath) });
                    }}
                    className="flex-shrink-0 flex flex-col items-center gap-0.5"
                    style={{ width: 80, minWidth: 80 }}
                    title={u.name || u.username}
                  >
                    <StoryGoldRingAvatar
                      size={58}
                      live={isLive}
                      data-avatar-circle={isLive ? "live" : undefined}
                      src={u.avatar_url || DEFAULT_AVATAR}
                      alt={u.name || u.username}
                    />
                    <div className="elix-silver-red-text text-[10px] truncate w-full text-center leading-tight">
                      {u.name || u.username}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
  );

  return (
    <>
      {layout === "inline" ? (
        <div
          className={`w-full shrink-0 overflow-hidden transition-[max-height,opacity] duration-300 ease-out feed-story-strip ${
            stripShown ? "max-h-[160px] opacity-100" : "max-h-0 opacity-0 pointer-events-none"
          }`}
          aria-hidden={!stripShown}
        >
          {stripBody}
        </div>
      ) : (
        <div
          className={`fixed inset-x-0 z-[20] flex justify-center pointer-events-none transition-[transform,opacity] duration-300 ease-out ${
            sitBelowTopNav ? "" : "top-0"
          } ${
            stripShown ? "translate-y-0 opacity-100" : "-translate-y-[120%] opacity-0 invisible pointer-events-none"
          }`}
          style={sitBelowTopNav ? { top: "calc(var(--safe-top) + var(--topnav-bar-height))" } : undefined}
          aria-hidden={!stripShown}
        >
          {stripBody}
        </div>
      )}

      {storyViewer && storyItem?.mediaUrl ? (
        <div className="absolute inset-0 z-[40] bg-black" data-story-container="feed-overlay">
          {/\.(png|jpe?g|gif|webp)(\?|$)/i.test(storyItem.mediaUrl) ? (
            <img src={storyItem.mediaUrl} alt="" className="absolute inset-0 w-full h-full object-cover" draggable={false} />
          ) : (
            <video
              key={storyItem.id}
              src={storyItem.mediaUrl}
              className="absolute inset-0 w-full h-full object-cover elix-no-media-chrome"
              autoPlay
              playsInline
              muted
              controls={false}
              loop={false}
              onEnded={advanceStory}
            />
          )}
          <div className="absolute top-2 left-3 right-12 z-20 flex gap-1 pointer-events-none">
            {(storyViewer.group.stories || []).map((it, i) => (
              <div key={it.id || i} className="h-0.5 flex-1 rounded-full overflow-hidden bg-white/25">
                <div
                  className="h-full bg-[#E6E9EE] elix-progress-fill rounded-full"
                  style={{
                    width: i <= storyViewer.itemIndex ? "100%" : "0%",
                    opacity: i <= storyViewer.itemIndex ? 1 : 0.35,
                  }}
                />
              </div>
            ))}
          </div>
          <div className="absolute top-3 left-3 right-12 z-10 flex items-center gap-2 pointer-events-none">
            <StoryGoldRingAvatar
              size={36}
              src={storyViewer.group.avatarUrl || DEFAULT_AVATAR}
              alt={storyViewer.group.displayName}
            />
            <div className="min-w-0">
              <p className="text-white text-sm font-semibold truncate drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
                {storyViewer.group.displayName || storyViewer.group.username}
              </p>
              <p className="text-[10px] text-white/70 font-medium">Story</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setStoryViewer(null)}
            className="absolute top-3 right-3 z-20 flex items-center justify-center"
            aria-label="Close story"
          >
            <span className="royce-glow-disc" aria-hidden>
              <ChevronLeft size={18} strokeWidth={2.35} className="royce-icon-gold block" />
            </span>
          </button>
          <button
            type="button"
            className="absolute left-0 top-0 bottom-0 w-1/3 z-[15] bg-transparent"
            aria-label="Previous story"
            onClick={() => {
              setStoryViewer((prev) => {
                if (!prev || prev.itemIndex <= 0) return null;
                return { group: prev.group, itemIndex: prev.itemIndex - 1 };
              });
            }}
          />
          <button
            type="button"
            className="absolute right-0 top-0 bottom-0 w-1/3 z-[15] bg-transparent"
            aria-label="Next story"
            onClick={advanceStory}
          />
        </div>
      ) : null}
    </>
  );
}
