import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { X } from "lucide-react";
import { apiFetchProfile, apiLiveStreams } from "@/features/feed/feedApi";
import { AvatarRing } from "@/components/AvatarRing";
import { LevelBadge } from "@/components/LevelBadge";
import { formatCompactNumber } from "@/lib/formatCompactNumber";
import { useAuthStore } from "@/store/useAuthStore";
import { PROFILE_PAGE_AVATAR_PX } from "@/lib/profileFrame";
import { showToast } from "@/lib/toast";
import type { UserPublic } from "@shared/contracts";

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
  const selfId = useAuthStore((state) => state.user?.id) ?? null;
  const [profile, setProfile] = useState<UserPublic | null>(null);
  const [watchId, setWatchId] = useState<string | null>(null);
  const own = selfId === userId;

  useEffect(() => {
    if (!open) {
      document.body.removeAttribute("data-user-profile-open");
      return;
    }
    document.body.setAttribute("data-user-profile-open", "");
    setProfile(null);
    setWatchId(null);
    void apiFetchProfile(userId).then((res) => {
      if (res.error || !res.profile) {
        showToast(res.error || "Profile not found");
        return;
      }
      setProfile(res.profile);
    });
    void apiLiveStreams().then((res) => {
      if (res.error) return;
      const live = res.streams.find((row) => row.hostId === userId);
      setWatchId(live ? live.streamId || live.roomId : null);
    });
    return () => {
      document.body.removeAttribute("data-user-profile-open");
    };
  }, [open, userId]);

  if (!open) return null;

  const liveNow = !own && Boolean(watchId || profile?.isLive);
  const following = profile?.isFollowing ?? isFollowing;

  return (
    <div className="fixed inset-0 z-[1000] flex items-end justify-center">
      <button type="button" className="absolute inset-0 bg-black/70" aria-label="Close profile" onClick={onClose} />
      <div className="relative z-10 w-full max-w-[480px] rounded-t-2xl bg-[#1A1C21] border border-white/10 px-4 pt-2 pb-6">
        <div className="flex justify-center pb-2">
          <div className="w-10 h-1 rounded-full bg-white/25" />
        </div>
        <button type="button" className="absolute top-3 right-3 p-1" aria-label="Close" onClick={onClose}>
          <X size={18} className="text-[#E6E9EE]" />
        </button>
        <div className="flex flex-col items-center pt-4">
          <AvatarRing
            src={profile?.avatarUrl}
            alt={profile?.displayName || profile?.username || "User"}
            size={PROFILE_PAGE_AVATAR_PX}
            ringColor={!own && (Boolean(watchId) || (!profile && isLive) || Boolean(profile?.isLive)) ? "#FF2D55" : "#D8D9DD"}
          />
          <div className="flex items-center gap-2 mt-3">
            <LevelBadge level={1} circleSize={26} size={16} />
            <h2 className="elix-silver-red-text font-bold text-base">{profile?.displayName || profile?.username || ""}</h2>
          </div>
          <p className="text-white/50 text-xs mt-0.5">@{profile?.username || ""}</p>
          <div className="flex gap-6 mt-3 text-center">
            <div>
              <p className="text-white font-bold text-sm">{formatCompactNumber(profile?.followerCount ?? 0)}</p>
              <p className="text-white/50 text-[10px]">Followers</p>
            </div>
            <div>
              <p className="text-white font-bold text-sm">{formatCompactNumber(profile?.followingCount ?? 0)}</p>
              <p className="text-white/50 text-[10px]">Following</p>
            </div>
          </div>
          {liveNow && watchId ? (
            <button
              type="button"
              className="mt-4 w-full border border-[#FF2D55]/50 rounded-xl py-2 text-sm font-bold text-[#FF2D55]"
              onClick={() => {
                onClose();
                navigate(`/watch/${encodeURIComponent(watchId)}`);
              }}
            >
              Watch Live
            </button>
          ) : null}
          {!own ? (
            <button
              type="button"
              className="mt-2 w-full border border-[#D8D9DD]/40 rounded-xl py-2 text-sm font-bold"
              onClick={onFollow}
            >
              {following ? "Unfollow" : "Follow"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
