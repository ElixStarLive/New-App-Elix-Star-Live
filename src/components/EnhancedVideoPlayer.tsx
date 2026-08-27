import { useCallback, useEffect, useRef, useState } from 'react';
import { Heart, MessageCircle, Share2, Bookmark, MoreHorizontal, Play, Volume2, VolumeX } from 'lucide-react';
import { likeVideo, unlikeVideo, saveVideo, unsaveVideo, type FeedVideo } from '../features/feed/feedApi';
import { formatCompactNumber } from '../lib/formatCompactNumber';

interface EnhancedVideoPlayerProps {
  video: FeedVideo;
  isActive: boolean;
  onVideoEnd?: () => void;
}

export default function EnhancedVideoPlayer({ video, isActive, onVideoEnd }: EnhancedVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
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
      const p = el.play().catch(() => {});
      void p;
      setPlaying(true);
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

  const toggleMute = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    el.muted = !el.muted;
    setMuted(el.muted);
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
      try {
        await navigator.share({ title: 'Elix Star Live', url });
      } catch {
        /* ignore */
      }
    } else if (navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        /* ignore */
      }
    }
  }, [video.id]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      <video
        ref={videoRef}
        src={video.url}
        poster={video.thumbnail}
        className="h-full w-full object-cover"
        playsInline
        muted={muted}
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

      <button
        type="button"
        onClick={toggleMute}
        className="absolute right-3 top-3 z-20 rounded-full bg-black/40 p-2 text-white"
        aria-label={muted ? 'Unmute' : 'Mute'}
      >
        {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
      </button>

      <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/70 to-transparent p-4 pb-20">
        <div className="flex items-center gap-2">
          <img src={video.user.avatarUrl} alt="" className="h-9 w-9 rounded-full border border-white/30 object-cover" />
          <div>
            <p className="text-sm font-semibold text-white">{video.user.displayName}</p>
            <p className="text-[10px] text-white/70">
              {formatCompactNumber(video.stats.views)} views · {formatCompactNumber(video.stats.comments)} comments
            </p>
          </div>
        </div>
        <p className="mt-2 text-sm text-white/90" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{video.description}</p>
        {video.hashtags.length > 0 && (
          <p className="mt-1 text-xs text-white/70">{video.hashtags.map((tag) => `#${tag}`).join(' ')}</p>
        )}
      </div>

      <div className="absolute right-3 bottom-24 z-10 flex flex-col gap-4">
        <button
          type="button"
          onClick={() => handleLike()}
          disabled={toggling}
          className="flex flex-col items-center gap-0.5 text-white"
        >
          <Heart
            className="h-7 w-7"
            fill={liked ? 'currentColor' : 'none'}
            style={{ color: liked ? '#f43f5e' : 'white' }}
          />
          <span className="text-[10px] font-semibold">{formatCompactNumber(likes)}</span>
        </button>

        <button type="button" className="flex flex-col items-center gap-0.5 text-white">
          <MessageCircle className="h-7 w-7" />
          <span className="text-[10px] font-semibold">{formatCompactNumber(video.stats.comments)}</span>
        </button>

        <button type="button" onClick={handleSave} disabled={toggling} className="flex flex-col items-center gap-0.5 text-white">
          <Bookmark className="h-7 w-7" fill={saved ? 'currentColor' : 'none'} />
          <span className="text-[10px] font-semibold">{saved ? 'Saved' : 'Save'}</span>
        </button>

        <button type="button" onClick={handleShare} className="flex flex-col items-center gap-0.5 text-white">
          <Share2 className="h-7 w-7" />
          <span className="text-[10px] font-semibold">Share</span>
        </button>

        <button type="button" className="flex flex-col items-center gap-0.5 text-white">
          <MoreHorizontal className="h-7 w-7" />
        </button>
      </div>

      <style>{`@keyframes burst{0%{transform:scale(0.5);opacity:0}30%{transform:scale(1.2);opacity:1}100%{transform:scale(1.5);opacity:0}}`}</style>
    </div>
  );
}
