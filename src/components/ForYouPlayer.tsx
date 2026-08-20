import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bookmark, Heart, MessageCircle, MoreHorizontal, Music, Play, Share2 } from "lucide-react";
import type { FeedItem } from "@shared/contracts";
import { AvatarRing } from "@/components/AvatarRing";
import { LevelBadge } from "@/components/LevelBadge";
import EnhancedCommentsModal from "@/components/EnhancedCommentsModal";
import { ForYouProfileSheet } from "@/components/ForYouProfileSheet";
import {
  apiFollow,
  apiLikeVideo,
  apiMusicPreview,
  apiSaveVideo,
  apiTrackInteraction,
  apiTrackView,
  apiUnfollow,
  apiUnlikeVideo,
  apiUnsaveVideo,
} from "@/features/feed/feedApi";
import { QUALIFIED_WATCH_MS, QUALIFIED_WATCH_SECONDS, hasQualifiedViewAttempt, markQualifiedViewAttempt } from "@/features/feed/feedViewGuard";
import { formatCompactNumber } from "@/lib/formatCompactNumber";
import { getPublicWebOrigin } from "@/lib/api";
import { nativeShareUrl } from "@/lib/platform";
import { showToast } from "@/lib/toast";
import { useAuthStore } from "@/store/useAuthStore";
import { useSettingsStore } from "@/store/useSettingsStore";

const VIDEO_SIDEBAR_AVATAR = 38;
const GOLD_COUNT = "text-[10px] font-semibold leading-none text-[#E6E9EE]";
const navStackExpr = "var(--nav-height) + var(--safe-bottom)";

function hashtagsFrom(item: FeedItem): string[] {
  const fromField = item.hashtags ?? [];
  const fromCaption = (item.caption || "").match(/#([A-Za-z0-9_]+)/g)?.map((tag) => tag.slice(1)) ?? [];
  return [...new Set([...fromField, ...fromCaption].map((tag) => tag.replace(/^#/, "")).filter(Boolean))];
}

export function ForYouPlayer({
  item,
  isActive,
  onPatch,
}: {
  item: FeedItem;
  isActive: boolean;
  onPatch: (patch: Partial<FeedItem>) => void;
}) {
  const navigate = useNavigate();
  const selfId = useAuthStore((state) => state.user?.id) ?? null;
  const muteAllSounds = useSettingsStore((state) => state.muteAllSounds);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const progressTrackRef = useRef<HTMLDivElement>(null);
  const likeLock = useRef(false);
  const saveLock = useRef(false);
  const followLock = useRef(false);
  const viewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const singleTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const itemRef = useRef(item);
  itemRef.current = item;
  const onPatchRef = useRef(onPatch);
  onPatchRef.current = onPatch;
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [buffering, setBuffering] = useState(false);
  const [mediaError, setMediaError] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [heartBurst, setHeartBurst] = useState(false);
  const [progress, setProgress] = useState(0);
  const [scrubbing, setScrubbing] = useState(false);
  const [musicUrl, setMusicUrl] = useState<string | null>(null);

  const playLineH = scrubbing ? "14px" : "3px";
  const playBarBottom = `calc(${navStackExpr} + 5mm)`;
  const chromeBottom = `calc(${navStackExpr} + 5mm + ${playLineH} + 2mm)`;
  const likeBarBottom = `calc(${navStackExpr} + 5mm + ${playLineH} - 1mm + 7mm)`;

  const applyMute = useCallback(
    (nextMuted: boolean) => {
      const el = videoRef.current;
      const silent = nextMuted || muteAllSounds;
      if (el) {
        el.muted = silent || Boolean(musicUrl);
        el.volume = silent || musicUrl ? 0 : 1;
      }
      const audio = audioRef.current;
      if (audio) {
        audio.muted = silent;
        audio.volume = silent ? 0 : 1;
      }
    },
    [muteAllSounds, musicUrl],
  );

  useEffect(() => {
    applyMute(muted);
  }, [applyMute, muted]);

  useEffect(() => {
    if (!isActive || !item.soundId) {
      setMusicUrl(null);
      return;
    }
    let cancelled = false;
    void apiMusicPreview(item.soundId).then((res) => {
      if (cancelled || res.error || !res.url) return;
      setMusicUrl(res.url);
    });
    return () => {
      cancelled = true;
    };
  }, [isActive, item.soundId]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (musicUrl) audio.src = musicUrl;
    else audio.removeAttribute("src");
  }, [musicUrl]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (!isActive) {
      el.pause();
      audioRef.current?.pause();
      setPlaying(false);
      if (viewTimer.current) {
        clearTimeout(viewTimer.current);
        viewTimer.current = null;
      }
      return;
    }
    void el.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  }, [isActive, item.mediaUrl]);

  useEffect(() => {
    const onVis = () => {
      const el = videoRef.current;
      if (!el || !isActive) return;
      if (document.visibilityState !== "visible") {
        el.pause();
        audioRef.current?.pause();
        setPlaying(false);
      } else {
        void el.play().then(() => setPlaying(true)).catch(() => undefined);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [isActive]);

  useEffect(() => {
    const video = videoRef.current;
    const audio = audioRef.current;
    return () => {
      video?.pause();
      audio?.pause();
      if (viewTimer.current) clearTimeout(viewTimer.current);
      if (singleTapTimer.current) clearTimeout(singleTapTimer.current);
    };
  }, [item.mediaUrl]);

  useEffect(() => {
    if (!isActive || !playing) return;
    if (hasQualifiedViewAttempt(item.id)) return;
    viewTimer.current = setTimeout(() => {
      if (hasQualifiedViewAttempt(item.id)) return;
      markQualifiedViewAttempt(item.id);
      void apiTrackView(item.id, { watchTime: QUALIFIED_WATCH_SECONDS }).then((res) => {
        if ("counted" in res && res.counted) {
          const current = itemRef.current;
          onPatchRef.current({ viewCount: (current.viewCount ?? 0) + 1 });
        }
      });
    }, QUALIFIED_WATCH_MS);
    return () => {
      if (viewTimer.current) clearTimeout(viewTimer.current);
    };
  }, [isActive, playing, item.id]);

  const toggleLike = useCallback(async () => {
    if (likeLock.current) return;
    likeLock.current = true;
    const current = itemRef.current;
    const wasLiked = Boolean(current.liked);
    const prevCount = current.likeCount ?? 0;
    onPatch({ liked: !wasLiked, likeCount: Math.max(0, prevCount + (wasLiked ? -1 : 1)) });
    try {
      const res = await (wasLiked ? apiUnlikeVideo(current.id) : apiLikeVideo(current.id));
      if (!res.ok) {
        onPatch({ liked: wasLiked, likeCount: prevCount });
        showToast(res.error);
      } else if (!wasLiked) {
        void apiTrackInteraction(current.id, "like");
      }
    } finally {
      likeLock.current = false;
    }
  }, [onPatch]);

  const toggleSave = useCallback(async () => {
    if (saveLock.current) return;
    saveLock.current = true;
    const current = itemRef.current;
    const wasSaved = Boolean(current.saved);
    const prevCount = current.saveCount ?? 0;
    onPatch({ saved: !wasSaved, saveCount: Math.max(0, prevCount + (wasSaved ? -1 : 1)) });
    try {
      const res = await (wasSaved ? apiUnsaveVideo(current.id) : apiSaveVideo(current.id));
      if (!res.ok) {
        onPatch({ saved: wasSaved, saveCount: prevCount });
        showToast(res.error);
      } else {
        void apiTrackInteraction(current.id, "save");
      }
    } finally {
      saveLock.current = false;
    }
  }, [onPatch]);

  const toggleFollow = useCallback(async () => {
    const current = itemRef.current;
    if (!current.userId || current.userId === selfId || followLock.current) return;
    followLock.current = true;
    const was = Boolean(current.isFollowing);
    onPatch({ isFollowing: !was });
    try {
      const res = await (was ? apiUnfollow(current.userId) : apiFollow(current.userId));
      if (!res.ok) {
        onPatch({ isFollowing: was });
        showToast(res.error);
      }
    } finally {
      followLock.current = false;
    }
  }, [onPatch, selfId]);

  const share = useCallback(async () => {
    const url = `${getPublicWebOrigin()}/video/${item.id}`;
    const ok = await nativeShareUrl({ title: "Elix Star Live", url });
    if (ok) void apiTrackInteraction(item.id, "share");
  }, [item.id]);

  const seekFromClientX = (clientX: number) => {
    const el = videoRef.current;
    const track = progressTrackRef.current;
    if (!el || !track || !el.duration) return;
    const rect = track.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    el.currentTime = ratio * el.duration;
    setProgress(ratio * 100);
  };

  const onSurfaceTap = () => {
    if (singleTapTimer.current) {
      clearTimeout(singleTapTimer.current);
      singleTapTimer.current = null;
      setHeartBurst(true);
      window.setTimeout(() => setHeartBurst(false), 700);
      void toggleLike();
      return;
    }
    singleTapTimer.current = setTimeout(() => {
      singleTapTimer.current = null;
      const el = videoRef.current;
      if (!el) return;
      if (muted && !muteAllSounds) {
        setMuted(false);
        applyMute(false);
        if (el.paused) void el.play().then(() => setPlaying(true)).catch(() => undefined);
        if (audioRef.current && musicUrl) void audioRef.current.play().catch(() => undefined);
        return;
      }
      if (el.paused) {
        void el.play().then(() => setPlaying(true)).catch(() => undefined);
        if (audioRef.current && musicUrl) void audioRef.current.play().catch(() => undefined);
      } else {
        el.pause();
        audioRef.current?.pause();
        setPlaying(false);
      }
    }, 280);
  };

  const tags = hashtagsFrom(item);
  const own = selfId === item.userId;

  return (
    <div className="relative w-full h-full overflow-hidden flex justify-center">
      <div className="absolute inset-0 flex items-center justify-center elix-feed-video-stage">
        <audio ref={audioRef} preload="auto" className="hidden" data-elix-feed-music="1" />
        <video
          ref={videoRef}
          src={item.mediaUrl}
          className="w-full h-full object-cover elix-no-media-chrome"
          loop
          playsInline
          muted
          controls={false}
          preload={isActive ? "auto" : "metadata"}
          poster={item.thumbnailUrl ?? undefined}
          onClick={onSurfaceTap}
          onError={() => setMediaError(true)}
          onWaiting={() => setBuffering(true)}
          onPlaying={() => {
            setBuffering(false);
            setPlaying(true);
            if (audioRef.current && musicUrl && !muted && !muteAllSounds) {
              void audioRef.current.play().catch(() => undefined);
            }
          }}
          onPause={() => setPlaying(false)}
          onTimeUpdate={() => {
            const el = videoRef.current;
            if (!el || !el.duration) return;
            setProgress(Math.min(100, (el.currentTime / el.duration) * 100));
          }}
        />
        {mediaError ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[rgba(0,0,0,0.35)] z-10 gap-3">
            <span className="text-white/50 text-sm">Video processing...</span>
            <button
              type="button"
              onClick={() => {
                setMediaError(false);
                void videoRef.current?.play().catch(() => undefined);
              }}
              className="px-4 py-1.5 bg-[#E6E9EE] text-white rounded-lg text-xs font-medium elix-solid-accent"
            >
              Tap to retry
            </button>
          </div>
        ) : null}
        {!mediaError && buffering && playing ? (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[6]">
            <div className="w-8 h-8 border-2 border-[#E6E9EE]/25 border-t-[#E6E9EE] rounded-full animate-spin elix-loader" />
          </div>
        ) : null}
        {!mediaError && !playing ? (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[5]">
            <div className="w-16 h-16 rounded-full bg-black/40 flex items-center justify-center backdrop-blur-sm">
              <Play className="w-8 h-8 text-white" fill="white" strokeWidth={2} />
            </div>
          </div>
        ) : null}
        <div
          ref={progressTrackRef}
          className="absolute left-3 right-3 z-[16] pointer-events-auto flex flex-col justify-end"
          style={{ bottom: playBarBottom, minHeight: scrubbing ? 44 : 22, touchAction: "none" }}
          onPointerDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
            setScrubbing(true);
            seekFromClientX(e.clientX);
          }}
          onPointerMove={(e) => {
            if (!scrubbing) return;
            seekFromClientX(e.clientX);
          }}
          onPointerUp={() => setScrubbing(false)}
          onPointerCancel={() => setScrubbing(false)}
        >
          <div className={`w-full rounded-full bg-white/10 overflow-hidden ${scrubbing ? "h-3.5" : "h-[3px]"}`}>
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#D8D9DD] via-[#00c2be] to-[#D8D9DD]"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
        {heartBurst ? (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-50">
            <Heart className="w-24 h-24 text-white fill-current animate-ping" />
          </div>
        ) : null}
      </div>

      <div className="absolute z-[10] flex flex-col items-center gap-2 pointer-events-auto" style={{ right: "calc(12px - 3mm)", bottom: likeBarBottom }}>
        <button
          type="button"
          onClick={() => setProfileOpen(true)}
          className="relative mb-1 overflow-visible rounded-full active:scale-95"
          style={{ width: VIDEO_SIDEBAR_AVATAR, height: VIDEO_SIDEBAR_AVATAR }}
          title={item.username}
        >
          <AvatarRing src={item.avatarUrl} alt={item.displayName || item.username} size={VIDEO_SIDEBAR_AVATAR} ringColor={item.isLive ? "#FF2D55" : "#D8D9DD"} />
        </button>
        <button type="button" onClick={() => void toggleLike()} className="flex flex-col items-center gap-0.5 active:scale-95" title="Like">
          {item.liked ? (
            <Heart size={24} strokeWidth={2.25} className="fill-red-500 text-red-500" />
          ) : (
            <span className="royce-tile" style={{ width: 34, height: 34 }}>
              <Heart size={24} className="royce-icon-gold" strokeWidth={2.25} />
            </span>
          )}
          <span className={GOLD_COUNT}>{formatCompactNumber(item.likeCount ?? 0)}</span>
        </button>
        <button type="button" onClick={() => setCommentsOpen(true)} className="flex flex-col items-center gap-0.5 active:scale-95" title="Comments">
          <span className="royce-tile" style={{ width: 34, height: 34 }}>
            <MessageCircle size={24} className="royce-icon-gold" />
          </span>
          <span className={GOLD_COUNT}>{formatCompactNumber(item.commentCount ?? 0)}</span>
        </button>
        <button type="button" onClick={() => void toggleSave()} className="flex flex-col items-center gap-0.5 active:scale-95" title={item.saved ? "Saved" : "Save"}>
          <span className="royce-tile" style={{ width: 34, height: 34 }}>
            <Bookmark size={24} strokeWidth={2.25} className={item.saved ? "fill-[#E6E9EE] royce-icon-gold" : "royce-icon-gold"} />
          </span>
          <span className={GOLD_COUNT}>{formatCompactNumber(item.saveCount ?? 0)}</span>
        </button>
        <button type="button" onClick={() => void share()} className="flex flex-col items-center gap-0.5 active:scale-95" title="Share">
          <span className="royce-tile" style={{ width: 34, height: 34 }}>
            <Share2 size={22} className="royce-icon-gold" />
          </span>
        </button>
        <button
          type="button"
          onClick={() => navigate(item.soundId ? `/music/${item.soundId}` : "/music")}
          className="flex flex-col items-center gap-0.5 active:scale-95"
          title="Original Sound"
        >
          <span className="royce-tile relative overflow-hidden" style={{ width: 32, height: 32 }}>
            <Music size={18} strokeWidth={2.25} className="royce-icon-gold" />
          </span>
        </button>
        <button type="button" onClick={() => setMoreOpen(true)} className="flex flex-col items-center gap-0.5 active:scale-95" title="More" aria-label="More options">
          <span className="royce-glow-disc" style={{ width: 34, height: 34 }}>
            <MoreHorizontal size={22} strokeWidth={2.35} className="royce-icon-gold" />
          </span>
        </button>
      </div>

      <div className="absolute z-[10] pointer-events-none flex flex-col items-stretch gap-0.5" style={{ left: "3mm", right: "72px", bottom: chromeBottom }}>
        <div className="flex items-center gap-2 w-full min-w-0 pointer-events-auto" onClick={() => setProfileOpen(true)}>
          <LevelBadge level={1} circleSize={26} size={16} />
          <h3 className="elix-silver-red-text font-bold truncate">{item.displayName || item.username}</h3>
        </div>
        <span className="elix-silver-red-text text-xs font-medium whitespace-nowrap overflow-hidden block max-w-full">
          Original Sound - {item.username}
        </span>
        <div className="flex items-center gap-2 elix-silver-red-text text-xs opacity-80">
          <span>{formatCompactNumber(item.viewCount ?? 0)} views</span>
          {item.createdAt ? <span>{new Date(item.createdAt).toLocaleDateString()}</span> : null}
        </div>
        <p className="elix-silver-red-text text-sm line-clamp-2 w-full text-left">{item.caption || ""}</p>
        <div className="flex flex-wrap gap-1 w-full">
          {tags.map((tag) => (
            <button
              key={tag}
              type="button"
              className="elix-silver-red-text text-xs font-medium pointer-events-auto"
              onClick={() => navigate(`/hashtag/${encodeURIComponent(tag)}`)}
            >
              #{tag}
            </button>
          ))}
        </div>
      </div>

      <EnhancedCommentsModal
        isOpen={commentsOpen}
        onClose={() => setCommentsOpen(false)}
        videoId={item.id}
        onPosted={() => onPatch({ commentCount: (item.commentCount ?? 0) + 1 })}
      />
      <ForYouProfileSheet
        open={profileOpen}
        userId={item.userId}
        isFollowing={Boolean(item.isFollowing)}
        isLive={Boolean(item.isLive)}
        onClose={() => setProfileOpen(false)}
        onFollow={() => void toggleFollow()}
      />
      {moreOpen ? (
        <div className="fixed inset-0 z-[1000] flex items-end justify-center">
          <button type="button" className="absolute inset-0" aria-label="Close more" onClick={() => setMoreOpen(false)} />
          <div className="relative z-10 w-full max-w-[480px] rounded-t-2xl bg-[#1A1C21] border border-white/10 overflow-hidden">
            <div className="flex flex-col px-4 pt-2 pb-3 border-b border-white/10">
              <div className="flex justify-center pb-2">
                <div className="w-10 h-1 rounded-full bg-white/25" />
              </div>
              <span className="text-[#F5F5F7] font-bold text-sm text-center">More Options</span>
            </div>
            {[
              {
                label: "Copy link",
                run: async () => {
                  await navigator.clipboard?.writeText(`${getPublicWebOrigin()}/video/${item.id}`);
                  showToast("Link copied");
                },
              },
              { label: "Share", run: () => void share() },
              { label: item.saved ? "Unsave" : "Save", run: () => void toggleSave() },
              ...(!own ? [{ label: item.isFollowing ? "Unfollow" : "Follow", run: () => void toggleFollow() }] : []),
              {
                label: "Report",
                run: () => navigate(`/report?targetId=${encodeURIComponent(item.id)}&targetKind=video`),
              },
            ].map((row) => (
              <button
                key={row.label}
                type="button"
                className="w-full text-left px-4 py-3 text-sm font-semibold border-t border-white/10"
                onClick={() => {
                  setMoreOpen(false);
                  void row.run();
                }}
              >
                {row.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
