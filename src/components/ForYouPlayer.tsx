import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bookmark,
  Copy,
  Download,
  Flag,
  Heart,
  MessageCircle,
  MoreHorizontal,
  Music,
  Play,
  QrCode,
  Share2,
  TrendingUp,
  User,
  UserPlus,
  Users2,
} from "lucide-react";
import type { FeedVideo } from "@shared/contracts";
import { StoryGoldRingAvatar } from "@/components/StoryGoldRingAvatar";
import { LevelBadge } from "@/components/LevelBadge";
import { RoyceIcon } from "@/components/royce";
import EnhancedCommentsModal from "@/components/EnhancedCommentsModal";
import { ForYouProfileSheet } from "@/components/ForYouProfileSheet";
import ReportModal from "@/components/ReportModal";
import ShareModal from "@/components/ShareModal";
import { PromotePanel } from "@/components/PromotePanel";
import {
  apiFollow,
  apiDownloadVoiceOnlyVideo,
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
import { LEVEL_BADGE_PILL_PX, LEVEL_BADGE_RING_PX, profileRingOuterAddMm } from "@/lib/profileFrame";
import { platform } from "@/lib/platform";
import { showToast } from "@/lib/toast";
import { useAuthStore } from "@/store/useAuthStore";
import { useSettingsStore } from "@/store/useSettingsStore";

const VIDEO_SIDEBAR_AVATAR = 38;
const VIDEO_DESC_AVATAR_PX = profileRingOuterAddMm(LEVEL_BADGE_RING_PX, 2);
const GOLD_COUNT = "text-[10px] font-semibold leading-none text-gold-light";
const navStackExpr = "var(--bottom-nav-top)";
const MORE_DISC_PX = 40;
const MORE_ICON_PX = 22;

function hashtagsFrom(item: FeedVideo): string[] {
  const fromField = item.hashtags ?? [];
  const fromCaption = (item.description || "").match(/#([A-Za-z0-9_]+)/g)?.map((tag) => tag.slice(1)) ?? [];
  return [...new Set([...fromField, ...fromCaption].map((tag) => tag.replace(/^#/, "")).filter(Boolean))];
}

export function ForYouPlayer({
  item,
  isActive,
  onPatch,
  onFollowSettled,
  creatorLive = false,
}: {
  item: FeedVideo;
  isActive: boolean;
  onPatch: (patch: Partial<FeedVideo>) => void;
  onFollowSettled?: (userId: string, isFollowing: boolean) => void;
  creatorLive?: boolean;
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
  const [shareOpen, setShareOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [heartBurst, setHeartBurst] = useState(false);
  const [progress, setProgress] = useState(0);
  const [scrubbing, setScrubbing] = useState(false);
  const [musicUrl, setMusicUrl] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [appForeground, setAppForeground] = useState(
    typeof document === "undefined" ? true : document.visibilityState === "visible",
  );

  const overlayOpen = commentsOpen || profileOpen || shareOpen || moreOpen || promoteOpen || reportOpen;
  const shouldPlay = isActive && !overlayOpen && appForeground;

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
    if (!isActive || !item.music?.id) {
      setMusicUrl(null);
      return;
    }
    let cancelled = false;
    void apiMusicPreview(item.music.id).then((res) => {
      if (cancelled || res.error || !res.url) return;
      setMusicUrl(res.url);
    });
    return () => {
      cancelled = true;
    };
  }, [isActive, item.music?.id]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (musicUrl) audio.src = musicUrl;
    else audio.removeAttribute("src");
  }, [musicUrl]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (!shouldPlay) {
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
    if (audioRef.current && musicUrl && !muted && !muteAllSounds) {
      void audioRef.current.play().catch(() => undefined);
    }
  }, [shouldPlay, item.url, musicUrl, muted, muteAllSounds]);

  useEffect(() => {
    const onVis = () => setAppForeground(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVis);
    let removeCap: (() => void) | undefined;
    if (platform.isNative) {
      void import("@capacitor/app").then(({ App }) => {
        void App.addListener("appStateChange", ({ isActive: foreground }) => {
          setAppForeground(foreground);
        }).then((handle) => {
          removeCap = () => {
            void handle.remove();
          };
        });
      });
    }
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      removeCap?.();
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    const audio = audioRef.current;
    return () => {
      video?.pause();
      audio?.pause();
      if (viewTimer.current) clearTimeout(viewTimer.current);
      if (singleTapTimer.current) clearTimeout(singleTapTimer.current);
    };
  }, [item.url]);

  useEffect(() => {
    if (!isActive || !playing || overlayOpen || !appForeground) return;
    if (hasQualifiedViewAttempt(item.id)) return;
    viewTimer.current = setTimeout(() => {
      if (hasQualifiedViewAttempt(item.id)) return;
      markQualifiedViewAttempt(item.id);
      void apiTrackView(item.id, { watchTime: QUALIFIED_WATCH_SECONDS }).then((res) => {
        if ("counted" in res && res.counted) {
          const current = itemRef.current;
          onPatchRef.current({ stats: { ...current.stats, views: current.stats.views + 1 } });
        }
      });
    }, QUALIFIED_WATCH_MS);
    return () => {
      if (viewTimer.current) clearTimeout(viewTimer.current);
    };
  }, [isActive, playing, overlayOpen, appForeground, item.id]);

  const toggleLike = useCallback(async () => {
    if (likeLock.current) return;
    likeLock.current = true;
    const current = itemRef.current;
    const wasLiked = Boolean(current.isLiked);
    const prevCount = current.stats.likes;
    onPatch({ isLiked: !wasLiked, stats: { ...current.stats, likes: Math.max(0, prevCount + (wasLiked ? -1 : 1)) } });
    try {
      const res = await (wasLiked ? apiUnlikeVideo(current.id) : apiLikeVideo(current.id));
      if (!res.ok) {
        onPatch({ isLiked: wasLiked, stats: { ...current.stats, likes: prevCount } });
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
    const wasSaved = Boolean(current.isSaved);
    const prevCount = current.stats.saves;
    onPatch({ isSaved: !wasSaved, stats: { ...current.stats, saves: Math.max(0, prevCount + (wasSaved ? -1 : 1)) } });
    try {
      const res = await (wasSaved ? apiUnsaveVideo(current.id) : apiSaveVideo(current.id));
      if (!res.ok) {
        onPatch({ isSaved: wasSaved, stats: { ...current.stats, saves: prevCount } });
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
    if (!current.user.id || current.user.id === selfId || followLock.current) return;
    followLock.current = true;
    const was = Boolean(current.isFollowing);
    onPatch({ isFollowing: !was });
    try {
      const res = await (was ? apiUnfollow(current.user.id) : apiFollow(current.user.id));
      if (!res.ok) {
        onPatch({ isFollowing: was });
        showToast(res.error);
      } else {
        onFollowSettled?.(current.user.id, !was);
      }
    } finally {
      followLock.current = false;
    }
  }, [onFollowSettled, onPatch, selfId]);

  const copyLink = useCallback(async () => {
    const url = `${getPublicWebOrigin()}/video/${item.id}`;
    try {
      await navigator.clipboard.writeText(url);
      showToast("Link copied");
    } catch {
      showToast("Could not copy link");
    }
  }, [item.id]);

  const downloadClip = useCallback(async () => {
    const result = await apiDownloadVoiceOnlyVideo(item.id);
    if (!result.ok) {
      showToast(result.error || "Download failed");
      return;
    }
    showToast("Download started (voice only — app music not included)");
    const href = URL.createObjectURL(result.blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = result.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(href), 60_000);
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

  return (
    <div className="relative w-full h-full overflow-hidden flex justify-center">
      <div className="absolute inset-0 flex items-center justify-center elix-feed-video-stage">
        <audio ref={audioRef} preload="auto" className="hidden" data-elix-feed-music="1" />
        <video
          ref={videoRef}
          src={item.url}
          className="w-full h-full object-cover elix-no-media-chrome"
          loop
          playsInline
          muted
          controls={false}
          preload={isActive ? "auto" : "metadata"}
          poster={item.thumbnail || undefined}
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
          className="relative mb-1 overflow-visible rounded-full active:scale-95 transition-transform"
          style={{ width: VIDEO_SIDEBAR_AVATAR, height: VIDEO_SIDEBAR_AVATAR }}
          title={item.user.username}
        >
          <StoryGoldRingAvatar
            size={VIDEO_SIDEBAR_AVATAR}
            src={item.user.avatar || ""}
            alt={item.user.username || ""}
            live={creatorLive}
          />
        </button>
        <button type="button" onClick={() => void toggleLike()} className="flex flex-col items-center gap-0.5 active:scale-95 transition-transform" title="Like">
          {item.isLiked ? (
            <Heart size={24} strokeWidth={2.25} className="fill-red-500 text-red-500" />
          ) : (
            <RoyceIcon icon={Heart} size={24} tile />
          )}
          <span className={GOLD_COUNT}>{formatCompactNumber(item.stats.likes)}</span>
        </button>
        <button type="button" onClick={() => setCommentsOpen(true)} className="flex flex-col items-center gap-0.5 active:scale-95 transition-transform" title="Comments">
          <RoyceIcon icon={MessageCircle} size={24} tile />
          <span className={GOLD_COUNT}>{formatCompactNumber(item.stats.comments)}</span>
        </button>
        <button type="button" onClick={() => void toggleSave()} className="flex flex-col items-center gap-0.5 active:scale-95 transition-transform" title={item.isSaved ? "Saved" : "Save"}>
          <span className="royce-tile" style={{ width: 34, height: 34 }}>
            <Bookmark size={24} strokeWidth={2.25} className={item.isSaved ? "fill-silver-full" : "royce-icon-gold"} />
          </span>
          <span className={GOLD_COUNT}>{formatCompactNumber(item.stats.saves)}</span>
        </button>
        <button type="button" onClick={() => setShareOpen(true)} className="flex flex-col items-center gap-0.5 active:scale-95 transition-transform" title="Share">
          <RoyceIcon icon={Share2} size={22} tile />
        </button>
        <button
          type="button"
          onClick={() => {
            const soundId = item.music?.id?.trim();
            if (!soundId || soundId === "original") return;
            navigate(`/music/${encodeURIComponent(soundId)}`);
          }}
          className="flex flex-col items-center gap-0.5 active:scale-95 transition-transform max-w-[52px]"
          title="Original Sound"
        >
          <span className="royce-tile relative overflow-hidden" style={{ width: 32, height: 32 }}>
            <Music size={18} strokeWidth={2.25} className="royce-icon-gold" aria-hidden />
            {item.thumbnail ? (
              <img
                src={item.thumbnail}
                alt=""
                className="absolute inset-0 w-full h-full object-cover rounded-full"
                draggable={false}
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            ) : null}
          </span>
        </button>
        <button type="button" onClick={() => setMoreOpen(true)} className="flex flex-col items-center gap-0.5 active:scale-95 transition-transform" title="More" aria-label="More options">
          <span className="royce-glow-disc" style={{ width: 34, height: 34 }} aria-hidden>
            <MoreHorizontal size={22} strokeWidth={2.35} className="royce-icon-gold fill-gold-bright" />
          </span>
        </button>
      </div>

      <div className="absolute z-[10] pointer-events-none flex flex-col items-stretch gap-0.5" style={{ left: "3mm", right: "72px", bottom: chromeBottom }}>
        <div className="flex items-center gap-2 w-full min-w-0 justify-start">
          <LevelBadge
            level={item.user.level}
            avatar={item.user.avatar}
            name={item.user.name || item.user.username}
            circleSize={VIDEO_DESC_AVATAR_PX}
            size={LEVEL_BADGE_PILL_PX}
          />
          <h3 className="elix-silver-red-text font-bold text-shadow-md truncate">{item.user.name || item.user.username}</h3>
        </div>
        <div className="w-full min-w-0 text-left">
          <span className="elix-silver-red-text text-xs font-medium animate-marquee whitespace-nowrap overflow-hidden block max-w-full">
            Original Sound - {item.user.username}
          </span>
        </div>
        <div className="flex items-center gap-2 elix-silver-red-text text-xs w-full justify-start opacity-80">
          <span>{formatCompactNumber(item.stats.views)} views</span>
          {item.createdAt ? <span>{new Date(item.createdAt).toLocaleDateString()}</span> : null}
        </div>
        <p className="elix-silver-red-text text-sm mb-0 text-shadow-md line-clamp-2 w-full text-left">{item.description || ""}</p>
        <div className="flex flex-wrap gap-1 mb-0 w-full justify-start">
          {tags.map((tag) => (
            <button
              key={tag}
              type="button"
              className="elix-silver-red-text text-xs font-medium hover:underline pointer-events-auto"
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
        onPosted={() => onPatch({ stats: { ...item.stats, comments: item.stats.comments + 1 } })}
      />
      <ShareModal
        isOpen={shareOpen}
        onClose={() => setShareOpen(false)}
        videoId={item.id}
        caption={item.description || ""}
        onReport={() => {
          setShareOpen(false);
          setReportOpen(true);
        }}
        onPromote={() => {
          setShareOpen(false);
          setPromoteOpen(true);
        }}
        onDownload={() => void downloadClip()}
      />
      <ForYouProfileSheet
        open={profileOpen}
        userId={item.user.id}
        isFollowing={Boolean(item.isFollowing)}
        isLive={creatorLive}
        onClose={() => setProfileOpen(false)}
        onFollow={() => void toggleFollow()}
      />
      {moreOpen ? (
        <div className="fixed inset-0 z-modals flex items-end justify-center">
          <button
            type="button"
            className="absolute inset-0 pointer-events-auto"
            aria-label="Close more"
            onClick={() => {
              setMoreOpen(false);
              setShowQr(false);
            }}
          />
          <div
            className="elix-more-options-sheet rounded-t-2xl max-h-[40dvh] flex flex-col pointer-events-auto w-full max-w-[480px] relative z-10 bottom-sheet-above-nav overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col px-4 pt-2 pb-3 border-b border-white/10">
              <div className="flex justify-center pb-2">
                <div className="w-10 h-1 rounded-full bg-white/25" />
              </div>
              <span className="text-[#F5F5F7] font-bold text-sm text-center">More Options</span>
            </div>
            <div className="p-4 overflow-y-auto overflow-x-hidden min-h-0 flex-1">
              {showQr ? (
                <div className="mb-3 p-3 rounded-xl bg-white/5 border border-white/10 flex flex-col items-center gap-2">
                  <span className="text-white/80 text-sm font-medium">Scan to open video</span>
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=112x112&data=${encodeURIComponent(`${getPublicWebOrigin()}/video/${item.id}`)}`}
                    alt="QR code"
                    className="w-28 h-28 rounded-lg bg-white p-1.5"
                  />
                  <button type="button" onClick={() => setShowQr(false)} className="text-[#F5F5F7] text-xs font-semibold">
                    Close
                  </button>
                </div>
              ) : null}
              <div className="grid grid-cols-4 gap-y-4 gap-x-2">
                {(
                  [
                    { label: "Copy Link", Icon: Copy, run: () => void copyLink(), close: true },
                    { label: "Download", Icon: Download, run: () => void downloadClip(), close: true },
                    { label: "Duet", Icon: Users2, run: () => navigate("/create"), close: true },
                    { label: "QR Code", Icon: QrCode, run: () => setShowQr((open) => !open), close: false },
                    { label: "Share", Icon: Share2, run: () => setShareOpen(true), close: true },
                    {
                      label: item.isSaved ? "Unsave" : "Save",
                      Icon: Bookmark,
                      run: () => void toggleSave(),
                      close: true,
                      filled: Boolean(item.isSaved),
                    },
                    {
                      label: item.isFollowing ? "Unfollow" : "Follow",
                      Icon: item.isFollowing ? User : UserPlus,
                      run: () => void toggleFollow(),
                      close: true,
                    },
                    {
                      label: "Promote",
                      Icon: TrendingUp,
                      run: () => setPromoteOpen(true),
                      close: true,
                    },
                    {
                      label: "Report",
                      Icon: Flag,
                      run: () => setReportOpen(true),
                      close: true,
                    },
                  ] as const
                ).map((row) => (
                  <button
                    key={row.label}
                    type="button"
                    className="flex flex-col items-center gap-1.5 active:scale-95"
                    onClick={() => {
                      if (row.close) {
                        setMoreOpen(false);
                        setShowQr(false);
                      }
                      row.run();
                    }}
                  >
                    <span
                      className="royce-glow-disc flex items-center justify-center"
                      style={{ width: MORE_DISC_PX, height: MORE_DISC_PX }}
                    >
                      <row.Icon
                        size={MORE_ICON_PX}
                        className={"filled" in row && row.filled ? "fill-[#E6E9EE] royce-icon-gold" : "royce-icon-gold"}
                        strokeWidth={2}
                      />
                    </span>
                    <span className="text-[10px] font-semibold text-[#F5F5F7]">{row.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <ReportModal
        isOpen={reportOpen}
        onClose={() => setReportOpen(false)}
        videoId={item.id}
        contentType="video"
      />
      <PromotePanel
        open={promoteOpen}
        onClose={() => setPromoteOpen(false)}
        contentType="video"
        content={{
          id: item.id,
          title: item.description,
          description: item.user.name,
          thumbnail: item.thumbnail,
          username: item.user.username,
          postedAt: item.createdAt,
        }}
      />
    </div>
  );
}
