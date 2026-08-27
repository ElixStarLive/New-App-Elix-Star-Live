import { useCallback, useEffect, useRef, useState } from 'react';
import { Heart, MessageCircle, Share2, Bookmark, MoreHorizontal, Play, Music, type LucideIcon } from 'lucide-react';
import { likeVideo, unlikeVideo, saveVideo, unsaveVideo, type FeedVideo } from '../features/feed/feedApi';
import { formatCompactNumber } from '../lib/formatCompactNumber';

interface EnhancedVideoPlayerProps {
  video: FeedVideo;
  isActive: boolean;
  onVideoEnd?: () => void;
}

const GOLD_COUNT = 'text-[10px] font-semibold leading-none text-[#E6E9EE]';

function ActionButton({
  icon: Icon,
  count,
  label,
  active,
  onClick,
}: {
  icon: LucideIcon;
  count?: number | string;
  label?: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-0.5 active:scale-95 transition-transform"
      aria-label={label}
      title={label}
    >
      <span className="royce-glow-disc">
        <Icon
          size={18}
          strokeWidth={2.25}
          className={active ? 'royce-icon-gold fill-silver-full' : 'royce-icon-gold'}
        />
      </span>
      {count !== undefined && <span className={GOLD_COUNT}>{count}</span>}
    </button>
  );
}

export default function EnhancedVideoPlayer({ video, isActive, onVideoEnd }: EnhancedVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [liked, setLiked] = useState(video.likedByMe);
  const [saved, setSaved] = useState(video.savedByMe);
  const [likes, setLikes] = useState(video.stats.likes);
  const [heartBurst, setHeartBurst] = useState(false);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (isActive) {
      el.currentTime = 0;
      void el.play().then(() => setPlaying(true)).catch(() => {});
    } else {
      el.pause();
      setPlaying(false);
    }
  }, [isActive]);

  useEffect(() => {
    setLiked(video.likedByMe);
    setSaved(video.savedByMe);
    setLikes(video.stats.likes);
  }, [video]);

  const togglePlay = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) {
      void el.play().then(() => setPlaying(true)).catch(() => {});
    } else {
      el.pause();
      setPlaying(false);
    }
  }, []);

  const handleLike = useCallback(
    async (burst = false) => {
      if (toggling) return;
      setToggling(true);
      const next = !liked;
      if (next) {
        const { data } = await likeVideo(video.id);
        if (data) {
          setLiked(true);
          setLikes(data.success ? likes + 1 : likes);
        }
      } else {
        const { data } = await unlikeVideo(video.id);
        if (data) {
          setLiked(false);
          setLikes(data.success ? Math.max(likes - 1, 0) : likes);
        }
      }
      setToggling(false);
      if (burst) {
        setHeartBurst(true);
        setTimeout(() => setHeartBurst(false), 800);
      }
    },
    [liked, likes, toggling, video.id],
  );

  const handleDoubleTap = useCallback(() => {
    if (!liked) void handleLike(true);
  }, [liked, handleLike]);

  const handleSave = useCallback(async () => {
    if (toggling) return;
    setToggling(true);
    const next = !saved;
    if (next) {
      const { data } = await saveVideo(video.id);
      if (data?.success) setSaved(true);
    } else {
      const { data } = await unsaveVideo(video.id);
      if (data?.success) setSaved(false);
    }
    setToggling(false);
  }, [saved, toggling, video.id]);

  const handleShare = useCallback(async () => {
    const url = `${window.location.origin}/video/${video.id}`;
    if (navigator.share) {
      try { await navigator.share({ title: 'Elix Star Live', url }); } catch { /* ignore */ }
    } else if (navigator.clipboard) {
      try { await navigator.clipboard.writeText(url); } catch { /* ignore */ }
    }
  }, [video.id]);

  const handleMusicClick = useCallback(() => {
    // Music page route is not yet available; no-op to avoid patch
  }, []);

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      <video
        ref={videoRef}
        src={video.url}
        poster={video.thumbnail}
        className="h-full w-full object-cover"
        playsInline
        muted
        onEnded={onVideoEnd}
        onClick={togglePlay}
        onDoubleClick={handleDoubleTap}
      />

      {!playing && isActive && (
        <button
          type="button"
          onClick={togglePlay}
          className="absolute inset-0 z-10 flex items-center justify-center bg-black/20"
          aria-label="Play"
        >
          <Play className="h-16 w-16 text-white/80" fill="currentColor" />
        </button>
      )}

      {heartBurst && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          <Heart className="h-24 w-24 text-rose-500" fill="currentColor" style={{ animation: 'burst 0.8s ease-out' }} />
        </div>
      )}

      <div
        className="absolute z-10 pointer-events-none flex flex-col gap-0.5"
        style={{ left: '3mm', right: '72px', bottom: 'calc(var(--safe-bottom) + 80px)' }}
      >
        <div className="flex items-center gap-2 w-full min-w-0 justify-start">
          <img
            src={video.user.avatarUrl}
            alt=""
            className="h-10 w-10 rounded-full border border-[#D8D9DD] object-cover"
          />
          <h3 className="elix-silver-red-text font-bold text-shadow-md truncate text-base">
            {video.user.displayName}
          </h3>
        </div>

        <p
          className="elix-silver-red-text text-shadow-md text-sm mb-0 text-left"
          style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
        >
          {video.description}
        </p>

        <div className="flex flex-wrap gap-1 mb-0 w-full justify-start">
          {video.hashtags.map((hashtag) => (
            <span key={hashtag} className="elix-silver-red-text text-xs font-medium text-left">
              #{hashtag}
            </span>
          ))}
        </div>

        <div className="flex items-center gap-2 text-xs w-full justify-start opacity-80 mt-1">
          <span className="elix-silver-red-text">
            {formatCompactNumber(video.stats.views)} views
          </span>
          <span className="elix-silver-red-text">
            {new Date(video.createdAt).toLocaleDateString()}
          </span>
        </div>
      </div>

      <div className="absolute right-3 z-10 flex flex-col gap-4" style={{ bottom: 'calc(var(--safe-bottom) + 88px)' }}>
        <ActionButton
          icon={Heart}
          count={formatCompactNumber(likes)}
          label="Like"
          active={liked}
          onClick={() => handleLike()}
        />

        <ActionButton
          icon={MessageCircle}
          count={formatCompactNumber(video.stats.comments)}
          label="Comments"
        />

        <ActionButton
          icon={Bookmark}
          count={saved ? 'Saved' : 'Save'}
          label="Save"
          active={saved}
          onClick={handleSave}
        />

        <ActionButton
          icon={Share2}
          label="Share"
          onClick={handleShare}
        />

        <button
          type="button"
          onClick={handleMusicClick}
          className="flex flex-col items-center gap-0.5 active:scale-95 transition-transform"
          aria-label="Original Sound"
          title="Original Sound"
        >
          <span className="royce-glow-disc relative overflow-hidden">
            <Music size={18} strokeWidth={2.25} className="royce-icon-gold" />
          </span>
        </button>

        <ActionButton
          icon={MoreHorizontal}
          label="More"
        />
      </div>

      <style>{`@keyframes burst{0%{transform:scale(0.5);opacity:0}30%{transform:scale(1.2);opacity:1}100%{transform:scale(1.5);opacity:0}}`}</style>
    </div>
  );
}
