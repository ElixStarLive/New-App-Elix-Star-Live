import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import type { UserPublic } from "@shared/contracts";
import { Copy, Flag, Share2, Sparkles, X } from "lucide-react";
import { AvatarRing } from "@/components/AvatarRing";
import { LevelBadge } from "@/components/LevelBadge";
import ReportModal from "@/components/ReportModal";
import { apiEnsureDmThread } from "@/features/chat/chatApi";
import { apiFetchProfile, apiFollow, apiUnfollow } from "@/features/feed/feedApi";
import { loadLiveProfile, toggleLiveProfileFollow } from "@/features/live/useLiveProfileOverlay";
import { getPublicWebOrigin } from "@/lib/api";
import { PROFILE_PAGE_AVATAR_PX } from "@/lib/profileFrame";
import { formatCompactNumber } from "@/lib/formatCompactNumber";
import { isRecord } from "@/lib/isRecord";
import { watchSessionPathFromOverlay } from "@/lib/liveProfileNav";
import { nativeShareUrl, openExternalLink } from "@/lib/platform";
import { containerReturnState } from "@/lib/settingsNav";
import { showToast } from "@/lib/toast";
import { useAuthStore } from "@/store/useAuthStore";
import { wsClient } from "@/lib/wsClient";

export default function ProfileLiveOverlay() {
  const { streamId, userId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const me = useAuthStore((s) => s.user);
  const roomId = (streamId || "").trim();
  const selectedUserId = (userId || "").trim();
  const watchPath = watchSessionPathFromOverlay(location.pathname, location.search) || (roomId ? `/watch/${roomId}` : "/feed");

  const [phase, setPhase] = useState<"loading" | "ready" | "error">(selectedUserId ? "loading" : "error");
  const [error, setError] = useState<string | null>(selectedUserId ? null : "Missing user");
  const [profile, setProfile] = useState<UserPublic | null>(null);
  const [following, setFollowing] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const generationRef = useRef(0);
  const followLock = useRef(false);

  const closeToWatch = useCallback(() => {
    navigate(watchPath, { replace: true });
  }, [navigate, watchPath]);

  useEffect(() => {
    if (!selectedUserId) {
      setPhase("error");
      setError("Missing user");
      setProfile(null);
      return;
    }
    const generation = ++generationRef.current;
    setPhase("loading");
    setError(null);
    setProfile(null);
    setFollowing(false);
    setShowShare(false);
    setReportOpen(false);
    void loadLiveProfile({
      userId: selectedUserId,
      generation,
      isCurrent: (ticket) => ticket === generationRef.current,
      fetchProfile: apiFetchProfile,
    }).then((result) => {
      if (generation !== generationRef.current) return;
      if (!result.ok) {
        if (result.error === "stale") return;
        setPhase("error");
        setError(result.error);
        return;
      }
      setProfile(result.profile);
      setFollowing(Boolean(result.profile.isFollowing));
      setPhase("ready");
    });
  }, [selectedUserId]);

  useEffect(() => {
    const onEnd = (data: unknown) => {
      const endedRoom = isRecord(data) && typeof data.roomId === "string" ? data.roomId.trim() : "";
      if (endedRoom && roomId && endedRoom !== roomId) return;
      closeToWatch();
    };
    wsClient.on("stream_ended", onEnd);
    return () => wsClient.off("stream_ended", onEnd);
  }, [closeToWatch, roomId]);

  const isSelf = Boolean(me?.id && selectedUserId && me.id === selectedUserId);
  const profileUrl = profile ? `${getPublicWebOrigin()}/profile/${profile.id}` : "";
  const emailLine = isSelf ? me?.email ?? "" : "";

  const copyLink = () => {
    if (!profileUrl) {
      showToast("Could not copy link");
      return;
    }
    void navigator.clipboard.writeText(profileUrl).then(
      () => showToast("Profile link copied!"),
      () => showToast("Could not copy link"),
    );
  };

  const onFollow = () => {
    if (!profile || isSelf || followLock.current) return;
    followLock.current = true;
    const was = following;
    const next = !was;
    setFollowing(next);
    setProfile((prev) =>
      prev
        ? {
            ...prev,
            isFollowing: next,
            followerCount: Math.max(0, prev.followerCount + (next ? 1 : -1)),
          }
        : prev,
    );
    void toggleLiveProfileFollow({
      userId: profile.id,
      following: was,
      isSelf,
      follow: apiFollow,
      unfollow: apiUnfollow,
    })
      .then((result) => {
        if (!result.ok) {
          setFollowing(was);
          setProfile((prev) =>
            prev
              ? {
                  ...prev,
                  isFollowing: was,
                  followerCount: Math.max(0, prev.followerCount + (was ? 1 : -1)),
                }
              : prev,
          );
          showToast(result.error);
          return;
        }
        return apiFetchProfile(profile.id).then((fresh) => {
          if (!fresh.profile || fresh.profile.id !== profile.id) return;
          setProfile(fresh.profile);
          setFollowing(Boolean(fresh.profile.isFollowing));
        });
      })
      .finally(() => {
        followLock.current = false;
      });
  };

  return (
    <div className="fixed inset-0 z-[99999] bg-black" data-elix-live-profile="true">
      <div className="page-above-bottom-nav elix-page-glass text-white z-[1] h-full">
        <div className="page-above-bottom-nav__inner elix-settings-write flex flex-col min-h-0">
          <header className="flex items-center justify-between px-4 pb-2 relative z-20" style={{ paddingTop: "var(--page-header-top)" }}>
            <button type="button" onClick={() => setShowShare(true)} title="Share profile" className="relative z-20 p-1">
              <span className="royce-glow-disc" style={{ width: 34, height: 34 }} aria-hidden>
                <Share2 size={18} className="royce-icon-gold" strokeWidth={2} />
              </span>
            </button>
            <div className="pointer-events-none flex-1 flex items-center justify-center min-w-0 px-2">
              <div className="text-[16px] font-bold text-white truncate">Profile</div>
            </div>
            <button type="button" onClick={closeToWatch} title="Close" aria-label="Close" className="relative z-20 p-1">
              <X size={20} className="text-[#E6E9EE]" />
            </button>
          </header>

          {phase === "loading" ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="w-10 h-10 border-2 border-[#E6E9EE]/25 border-t-[#E6E9EE] rounded-full animate-spin elix-loader" />
            </div>
          ) : null}

          {phase === "error" ? (
            <div className="flex-1 flex flex-col items-center justify-center px-4">
              <p className="text-white/70 text-center">{error || "Profile not found."}</p>
              <button type="button" onClick={closeToWatch} className="mt-4 text-sm font-semibold text-[#E6E9EE]">
                Close
              </button>
            </div>
          ) : null}

          {phase === "ready" && profile ? (
            <div className="shrink-0">
              <div className="flex flex-col items-center mt-2 mb-3 overflow-visible">
                <div className="relative overflow-visible" style={{ width: PROFILE_PAGE_AVATAR_PX + 8, height: PROFILE_PAGE_AVATAR_PX + 8 }}>
                  <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full">
                    <AvatarRing src={profile.avatarUrl} alt={profile.displayName} size={PROFILE_PAGE_AVATAR_PX} />
                  </div>
                </div>
              </div>

              <div className="flex flex-col items-center px-4" style={{ marginTop: "-6px" }}>
                <div className="flex items-center gap-2">
                  <h1 className="text-[17px] font-extrabold text-gold-metallic tracking-tight">{profile.displayName}</h1>
                  {profile.isVerified ? (
                    <span className="w-4 h-4 rounded-full bg-[#FFFFFF] flex items-center justify-center">
                      <Sparkles size={10} className="text-black" />
                    </span>
                  ) : null}
                  <button type="button" title="Copy profile link" aria-label="Copy profile link" className="p-0.5 active:opacity-70" onClick={copyLink}>
                    <Copy size={14} className="royce-icon-gold" strokeWidth={2.25} />
                  </button>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  {emailLine ? <span className="text-[13px] text-[#C8CDD5] font-medium">{emailLine}</span> : null}
                  <LevelBadge level={1} circleSize={22} size={16} />
                </div>
              </div>

              <div className="mx-4 mt-4">
                <div className="flex items-center justify-center gap-6 px-4 py-3">
                  <div className="flex flex-col items-center min-w-[60px]">
                    <span className="text-[17px] font-extrabold text-white">{formatCompactNumber(profile.followingCount)}</span>
                    <span className="text-[11px] text-[#E6E9EE] font-medium">Following</span>
                  </div>
                  <div className="flex flex-col items-center min-w-[60px]">
                    <span className="text-[17px] font-extrabold text-white">{formatCompactNumber(profile.followerCount)}</span>
                    <span className="text-[11px] text-[#E6E9EE] font-medium">Followers</span>
                  </div>
                  <div className="flex flex-col items-center min-w-[60px]">
                    <span className="text-[17px] font-extrabold text-white">{formatCompactNumber(profile.likeCount ?? 0)}</span>
                    <span className="text-[11px] text-[#E6E9EE] font-medium">Likes</span>
                  </div>
                  <div className="flex flex-col items-center min-w-[60px]">
                    <span className="text-[17px] font-extrabold text-white">{formatCompactNumber(profile.viewCount ?? 0)}</span>
                    <span className="text-[11px] text-[#E6E9EE] font-medium">Views</span>
                  </div>
                </div>
              </div>

              {profile.bio ? <p className="text-center text-[13px] text-white/70 mt-3 px-8 leading-relaxed">{profile.bio}</p> : null}

              {!isSelf ? (
                <div className="flex items-center justify-center gap-2 mt-4 px-6">
                  <button
                    type="button"
                    onClick={onFollow}
                    className={`flex-1 max-w-[120px] py-2.5 rounded-md text-sm font-bold transition ${
                      following ? "bg-white/10 text-white border border-white/10" : "elix-solid-red"
                    }`}
                  >
                    {following ? "Following" : "Follow"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void apiEnsureDmThread(profile.id).then((r) => {
                        if (!r.threadId) showToast(r.error || "Could not open chat");
                        else navigate(`/inbox/${r.threadId}`, { state: containerReturnState(watchPath) });
                      });
                    }}
                    className="flex-1 max-w-[120px] py-2.5 bg-white/10 border border-white/10 rounded-md text-sm font-bold text-white"
                  >
                    Message
                  </button>
                  <button type="button" onClick={() => setShowShare(true)} className="w-10 h-10 bg-white/10 border border-white/10 rounded-md flex items-center justify-center" title="Share profile">
                    <span className="royce-glow-disc" style={{ width: 32, height: 32 }} aria-hidden>
                      <Share2 size={16} className="royce-icon-gold" strokeWidth={2} />
                    </span>
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

          {showShare && profile ? (
            <div className="fixed inset-x-0 top-0 z-[80] elix-page-glass flex flex-col max-w-[480px] mx-auto fixed-above-bottom-nav">
              <header className="flex items-center justify-between px-4 pb-2" style={{ paddingTop: "var(--page-header-top)" }}>
                <span className="w-10" />
                <h2 className="text-[16px] font-bold">Share to</h2>
                <button type="button" onClick={() => setShowShare(false)} aria-label="Close" className="p-1">
                  <X size={18} />
                </button>
              </header>
              <div className="grid grid-cols-5 gap-y-3 gap-x-1.5 px-4 pt-4">
                {[
                  {
                    name: "WhatsApp",
                    action: () => openExternalLink(`https://wa.me/?text=${encodeURIComponent(`Check out ${profile.displayName}'s profile on Elix! ${profileUrl}`)}`),
                  },
                  {
                    name: "Facebook",
                    action: () => openExternalLink(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(profileUrl)}`),
                  },
                  {
                    name: "Twitter",
                    action: () => openExternalLink(`https://twitter.com/intent/tweet?text=${encodeURIComponent(`Check out ${profile.displayName} on Elix!`)}&url=${encodeURIComponent(profileUrl)}`),
                  },
                  { name: "Copy Link", action: copyLink },
                  {
                    name: "Share",
                    action: () => void nativeShareUrl({ title: profile.displayName, url: profileUrl }),
                  },
                  {
                    name: "Report",
                    action: () => {
                      setShowShare(false);
                      setReportOpen(true);
                    },
                  },
                ].map((item) => (
                  <button key={item.name} type="button" onClick={item.action} className="flex flex-col items-center gap-1 active:scale-95">
                    <span className="royce-glow-disc" style={{ width: 44, height: 44 }} aria-hidden>
                      {item.name === "Report" ? <Flag size={18} className="royce-icon-gold" /> : <Share2 size={18} className="royce-icon-gold" />}
                    </span>
                    <span className="text-[8px] font-semibold truncate w-full text-center text-[#C8CDD5]">{item.name}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <ReportModal
            isOpen={reportOpen}
            onClose={() => setReportOpen(false)}
            videoId=""
            contentType="user"
            contentId={selectedUserId}
          />
        </div>
      </div>
    </div>
  );
}
