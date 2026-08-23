import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Ban, Flag, MoreHorizontal, Play, Search, Video } from "lucide-react";
import { apiFetchProfile, apiFetchUserVideos, apiLiveStreams } from "@/features/feed/feedApi";
import { apiEnsureDmThread } from "@/features/chat/chatApi";
import { startOutgoingCall } from "@/features/calls/videoCallSession";
import { apiRequest } from "@/lib/apiClient";
import ReportModal from "@/components/ReportModal";
import { StoryGoldRingAvatar } from "@/components/StoryGoldRingAvatar";
import { LevelBadge } from "@/components/LevelBadge";
import { RoyceCloseIcon } from "@/components/royce";
import { formatCompactNumber } from "@/lib/formatCompactNumber";
import { containerReturnState, FEED_HOME } from "@/lib/settingsNav";
import { showToast } from "@/lib/toast";
import { useAuthStore } from "@/store/useAuthStore";
import type { FeedVideo, UserPublic } from "@shared/contracts";

export function ForYouProfileSheet({
  open,
  userId,
  isFollowing,
  isLive,
  onClose,
  onFollow,
}: {
  open: boolean;
  userId: string;
  isFollowing: boolean;
  isLive: boolean;
  onClose: () => void;
  onFollow: () => void;
}) {
  const navigate = useNavigate();
  const me = useAuthStore((state) => state.user);
  const selfId = me?.id ?? null;
  const [profile, setProfile] = useState<UserPublic | null>(null);
  const [videos, setVideos] = useState<FeedVideo[]>([]);
  const [watchId, setWatchId] = useState<string | null>(null);
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const own = selfId === userId;
  const following = profile?.isFollowing ?? isFollowing;

  useEffect(() => {
    if (!open) {
      document.body.removeAttribute("data-user-profile-open");
      return;
    }
    document.body.setAttribute("data-user-profile-open", "");
    setProfile(null);
    setVideos([]);
    setWatchId(null);
    setShowMoreOptions(false);
    setReportOpen(false);
    void apiFetchProfile(userId).then((res) => {
      if (res.error || !res.profile) {
        showToast(res.error || "Profile not found");
        return;
      }
      setProfile(res.profile);
    });
    void apiFetchUserVideos(userId, "public").then((res) => {
      if (res.error || !res.page) return;
      setVideos(res.page.videos);
    });
    void apiLiveStreams().then((res) => {
      if (res.error) return;
      const live = res.streams.find((row) => row.hostId === userId);
      setWatchId(live ? live.roomId || live.streamId : null);
    });
    return () => {
      document.body.removeAttribute("data-user-profile-open");
    };
  }, [open, userId]);

  if (!open) return null;

  const displayName = profile?.displayName || profile?.username || "";
  const liveNow = !own && Boolean(watchId);
  const emailLine = own ? me?.email ?? "" : "";

  return (
    <div className="elix-user-panel bg-transparent text-white">
      <div className="elix-user-panel__inner bg-transparent flex flex-col">
        <div className="flex justify-center pt-0.5 pb-1 flex-shrink-0" aria-hidden>
          <div className="w-10 h-1 rounded-full bg-white/25" />
        </div>
        <header className="flex items-center justify-between px-4 pt-page-header pb-2 relative z-20 flex-shrink-0">
          <button
            type="button"
            onClick={() => {
              onClose();
              navigate("/search");
            }}
            className="relative z-20 p-1"
            aria-label="Search"
            title="Search"
          >
            <Search size={20} className="text-gold-metallic" strokeWidth={2} />
          </button>
          <h3 className="pointer-events-none text-[12px] font-bold text-gold-metallic absolute left-1/2 -translate-x-1/2 truncate max-w-[50%]">
            User Profile
          </h3>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onClose();
            }}
            className="relative z-20 p-1"
            aria-label="Close profile"
            title="Close"
          >
            <RoyceCloseIcon />
          </button>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain px-5 pb-safe">
          <div className="flex flex-col items-center mb-4">
            <div className="mb-3 overflow-visible">
              <StoryGoldRingAvatar
                size={80}
                src={profile?.avatarUrl || ""}
                alt={displayName}
                live={!own && (Boolean(watchId) || (!profile && isLive))}
              />
            </div>
            <h2 className="text-lg font-bold text-white flex items-center gap-1.5 -translate-y-[2mm]">
              {displayName}
              {profile?.isVerified ? <span className="w-2 h-2 rounded-full bg-[#FFFFFF] flex-shrink-0" /> : null}
            </h2>
            <div className="mt-1 flex items-center gap-2">
              {emailLine ? <span className="text-sm text-white/80 font-medium">{emailLine}</span> : null}
              <LevelBadge level={1} circleSize={26} size={16} />
            </div>

            <div className="flex items-center gap-10 mt-4 w-full justify-center pb-4 border-b border-white/5">
              <div className="flex flex-col items-center">
                <span className="font-bold text-lg text-white">{formatCompactNumber(profile?.followingCount ?? 0)}</span>
                <span className="text-xs text-white/50">Following</span>
              </div>
              <div className="flex flex-col items-center">
                <span className="font-bold text-lg text-white">{formatCompactNumber(profile?.followerCount ?? 0)}</span>
                <span className="text-xs text-white/50">Followers</span>
              </div>
              <div className="flex flex-col items-center">
                <span className="font-bold text-lg text-white">{videos.length}</span>
                <span className="text-xs text-white/50">Videos</span>
              </div>
            </div>

            {!own ? (
              <div className="flex items-center gap-2 mt-4 mx-auto w-full max-w-[300px]">
                {liveNow && watchId ? (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      navigate(`/watch/${encodeURIComponent(watchId)}`);
                    }}
                    className="flex-1 h-9 flex items-center justify-center bg-white/10 text-white rounded-xl font-semibold text-xs"
                    aria-label="Watch Live"
                    title="Watch Live"
                  >
                    Watch Live
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    void apiEnsureDmThread(userId).then((res) => {
                      if (!res.threadId) {
                        showToast(res.error || "Call failed");
                        return;
                      }
                      const started = startOutgoingCall({
                        threadId: res.threadId,
                        calleeId: userId,
                        remoteUser: {
                          id: userId,
                          username: profile?.username || displayName,
                          avatar: profile?.avatarUrl ?? null,
                        },
                      });
                      if (!started.ok) {
                        showToast(started.error);
                        return;
                      }
                      onClose();
                      navigate("/call");
                    });
                  }}
                  className="h-9 w-9 flex items-center justify-center rounded-xl bg-white/10 text-white flex-shrink-0 active:scale-95"
                  aria-label="Video call"
                  title="Video call"
                >
                  <Video size={18} strokeWidth={2} className="text-[#F5F5F7]" />
                </button>
                <button
                  type="button"
                  onClick={onFollow}
                  className="flex-1 h-9 flex items-center justify-center bg-white/10 rounded-xl font-semibold text-xs"
                  style={
                    following
                      ? { color: "#D91F2D", WebkitTextFillColor: "#D91F2D", backgroundImage: "none" }
                      : undefined
                  }
                >
                  {following ? "Unfollow" : "Follow"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void apiEnsureDmThread(userId).then((res) => {
                      if (!res.threadId) {
                        showToast(res.error || "Could not open chat");
                        return;
                      }
                      onClose();
                      navigate(`/inbox/${res.threadId}`);
                    });
                  }}
                  className="flex-1 h-9 flex items-center justify-center bg-white/10 text-white rounded-xl font-semibold text-xs"
                >
                  Message
                </button>
                <button
                  type="button"
                  onClick={() => setShowMoreOptions((openMore) => !openMore)}
                  className="h-9 w-9 flex items-center justify-center rounded-xl bg-white/10 text-white relative flex-shrink-0"
                  aria-label="More options"
                >
                  <MoreHorizontal size={18} strokeWidth={2} />
                  {showMoreOptions ? (
                    <div className="absolute top-full right-0 mt-2 w-40 elix-glass rounded-xl shadow-xl border border-black z-50 overflow-hidden py-1">
                      <button
                        type="button"
                        onClick={() => {
                          setShowMoreOptions(false);
                          setReportOpen(true);
                        }}
                        className="w-full px-4 py-2.5 text-left text-xs hover:bg-white/5 flex items-center gap-2"
                        style={{ color: "#FFFFFF", WebkitTextFillColor: "#FFFFFF", backgroundImage: "none" }}
                      >
                        <Flag size={14} className="shrink-0" />
                        <span style={{ color: "#FFFFFF", WebkitTextFillColor: "#FFFFFF", backgroundImage: "none" }}>
                          Report
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void apiRequest(`/api/block/${encodeURIComponent(userId)}`, { method: "POST" }).then((res) => {
                            if (res.error) {
                              showToast(res.error.message);
                              return;
                            }
                            showToast("User blocked");
                            onClose();
                          });
                        }}
                        className="w-full px-4 py-2.5 text-left text-xs hover:bg-white/5 flex items-center gap-2 border-t border-white/5"
                        style={{ color: "#FFFFFF", WebkitTextFillColor: "#FFFFFF", backgroundImage: "none" }}
                      >
                        <Ban size={14} className="shrink-0" />
                        <span style={{ color: "#FFFFFF", WebkitTextFillColor: "#FFFFFF", backgroundImage: "none" }}>
                          Block
                        </span>
                      </button>
                    </div>
                  ) : null}
                </button>
              </div>
            ) : null}
          </div>

          <div className="mt-6 pt-4 border-t border-white/5">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-0.5 h-4 rounded-full bg-[#E6E9EE]/80" />
              <span className="text-sm font-semibold text-white/90">Videos</span>
            </div>
            {videos.length > 0 ? (
              <div className="grid grid-cols-2 gap-2">
                {videos.map((video) => {
                  const thumb = video.thumbnail || "";
                  return (
                    <button
                      key={video.id}
                      type="button"
                      className="aspect-[3/4] bg-black rounded-xl overflow-hidden relative"
                      onClick={() => {
                        onClose();
                        navigate(`/video/${encodeURIComponent(video.id)}`, { state: containerReturnState(FEED_HOME) });
                      }}
                    >
                      {video.url ? (
                        <video
                          src={`${video.url}#t=0.1`}
                          poster={thumb || undefined}
                          muted
                          playsInline
                          preload="metadata"
                          className="absolute inset-0 w-full h-full object-cover"
                          aria-hidden
                        />
                      ) : null}
                      {thumb ? (
                        <img src={thumb} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
                      ) : null}
                      <span className="absolute bottom-1.5 right-1.5 text-white">
                        <Play size={14} fill="white" />
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-white/50 text-sm text-center py-6">No videos yet.</p>
            )}
          </div>
        </div>
      </div>
      <ReportModal
        isOpen={reportOpen}
        onClose={() => setReportOpen(false)}
        videoId=""
        contentType="user"
        contentId={userId}
      />
    </div>
  );
}
