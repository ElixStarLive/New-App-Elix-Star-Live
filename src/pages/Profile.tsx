import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { FeedItem, UserPublic } from "@shared/contracts";
import {
  Bookmark,
  Copy,
  Flag,
  Grid3X3,
  Heart,
  Lock,
  Play,
  Repeat2,
  Settings,
  Share2,
  ShoppingBag,
  Sparkles,
  X,
} from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import {
  apiFetchLikedFeed,
  apiFetchProfile,
  apiFetchReposts,
  apiFetchSavedFeed,
  apiFetchUserVideos,
  apiFollow,
  apiUnfollow,
  apiUploadAvatar,
} from "@/features/feed/feedApi";
import { apiListShopItems, type ShopItem } from "@/features/shop/shopApi";
import { apiEnsureDmThread } from "@/features/chat/chatApi";
import { AvatarRing } from "@/components/AvatarRing";
import { LevelBadge } from "@/components/LevelBadge";
import { PROFILE_PAGE_AVATAR_PX } from "@/lib/profileFrame";
import { exitToFromLocationState, PROFILE_EXIT_TO, inboxReturnState, containerReturnState } from "@/lib/settingsNav";
import { showToast } from "@/lib/toast";
import { formatCompactNumber } from "@/lib/formatCompactNumber";
import { getPublicWebOrigin } from "@/lib/api";
import { nativeShareUrl, openExternalLink } from "@/lib/platform";

type ProfileTab = "videos" | "shop" | "private" | "reposts" | "saved" | "liked";

export default function Profile() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const me = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);
  const targetId = userId || me?.id || "";
  const isOwnProfile = Boolean(me && targetId === me.id);
  const [profile, setProfile] = useState<UserPublic | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [following, setFollowing] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!targetId) return;
    void apiFetchProfile(targetId).then((res) => {
      if (res.error || !res.profile) setError(res.error || "Profile not found");
      else {
        setProfile(res.profile);
        setFollowing(Boolean(res.profile.isFollowing));
      }
    });
  }, [targetId]);

  const close = () => navigate(exitToFromLocationState(location.state, PROFILE_EXIT_TO), { replace: true });
  const profileUrl = profile ? `${getPublicWebOrigin()}/profile/${profile.id}` : "";
  const emailLine = isOwnProfile ? me?.email ?? "" : "";

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

  return (
    <div className="page-above-bottom-nav elix-page-glass text-white z-[1]">
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
          <button type="button" onClick={close} title="Close" aria-label="Close" className="relative z-20 p-1">
            <X size={20} className="text-[#E6E9EE]" />
          </button>
        </header>

        {error ? <p className="px-4 text-rose-300 text-sm">{error}</p> : null}

        {profile ? (
          <>
            <div className="shrink-0">
              <div className="flex flex-col items-center mt-2 mb-3 overflow-visible">
                <div
                  className={`relative overflow-visible ${isOwnProfile ? "cursor-pointer" : ""}`}
                  style={{ width: PROFILE_PAGE_AVATAR_PX + 8, height: PROFILE_PAGE_AVATAR_PX + 8 }}
                  onClick={() => {
                    if (!isOwnProfile || uploadingAvatar) return;
                    fileInputRef.current?.click();
                  }}
                >
                  <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full">
                    <AvatarRing src={profile.avatarUrl} alt={profile.displayName} size={PROFILE_PAGE_AVATAR_PX} />
                  </div>
                  {isOwnProfile ? (
                    <button
                      type="button"
                      className="profile-add-story-btn bottom-0 right-0 z-50"
                      title="Add story"
                      aria-label="Add story"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate("/create");
                      }}
                    >
                      <span className="profile-add-story-btn__plus" aria-hidden>
                        +
                      </span>
                    </button>
                  ) : null}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept="image/*"
                  aria-label="Upload profile photo"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (e.target) e.target.value = "";
                    if (!file) return;
                    setUploadingAvatar(true);
                    void apiUploadAvatar(file, file.name).then((res) => {
                      setUploadingAvatar(false);
                      if (res.error || !res.avatarUrl) {
                        showToast(res.error || "Avatar upload failed");
                        return;
                      }
                      updateUser({ avatarUrl: res.avatarUrl });
                      setProfile((prev) => (prev ? { ...prev, avatarUrl: res.avatarUrl } : prev));
                    });
                  }}
                />
                {uploadingAvatar ? <div className="text-xs text-white/70 mt-1">Uploading...</div> : null}
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
                  <button type="button" className="flex flex-col items-center min-w-[60px] active:opacity-80" onClick={() => navigate(`/profile/${profile.id}/following`)}>
                    <span className="text-[17px] font-extrabold text-white">{formatCompactNumber(profile.followingCount)}</span>
                    <span className="text-[11px] text-[#E6E9EE] font-medium">Following</span>
                  </button>
                  <button type="button" className="flex flex-col items-center min-w-[60px] active:opacity-80" onClick={() => navigate(`/profile/${profile.id}/followers`)}>
                    <span className="text-[17px] font-extrabold text-white">{formatCompactNumber(profile.followerCount)}</span>
                    <span className="text-[11px] text-[#E6E9EE] font-medium">Followers</span>
                  </button>
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

              {!isOwnProfile ? (
                <div className="flex items-center justify-center gap-2 mt-4 px-6">
                  <button
                    type="button"
                    onClick={() => {
                      void (following ? apiUnfollow(profile.id) : apiFollow(profile.id)).then((r) => {
                        if (!r.ok) showToast(r.error);
                        else setFollowing(!following);
                      });
                    }}
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
                        else navigate(`/inbox/${r.threadId}`, { state: inboxReturnState() });
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

              <div className="mt-2">
                <div className="flex justify-center overflow-x-auto no-scrollbar">
                  <ActionChip label="AI Studio" onClick={() => navigate("/ai-studio")} icon={<Sparkles size={12} className="royce-icon-gold" />} />
                  <ActionChip label="Elix Studio" onClick={() => navigate("/creator/login-details")} icon={<Sparkles size={12} className="royce-icon-gold" />} />
                  <ActionChip label="Shop" onClick={() => navigate("/shop")} icon={<ShoppingBag size={12} className="royce-icon-gold" />} />
                  <ActionChip label="Showcase" onClick={() => navigate(`/profile/${profile.id}?tab=shop`)} icon={<ShoppingBag size={12} className="royce-icon-gold" />} />
                  {isOwnProfile ? (
                    <ActionChip label="Settings" onClick={() => navigate("/settings")} icon={<Settings size={12} className="royce-icon-gold" />} />
                  ) : null}
                </div>
              </div>

              <ProfileTabs userId={profile.id} isSelf={isOwnProfile} />
            </div>
          </>
        ) : null}

        {showShare && profile ? (
          <div className="fixed inset-0 z-[80] bg-[#080A0E] flex flex-col max-w-[480px] mx-auto">
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
                    navigate("/report", { state: containerReturnState(location.pathname) });
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
      </div>
    </div>
  );
}

function ActionChip({ label, onClick, icon }: { label: string; onClick: () => void; icon: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="flex flex-col items-center gap-0.5 px-3 py-2 whitespace-nowrap">
      <span className="royce-glow-disc" style={{ width: 26, height: 26 }} aria-hidden>
        {icon}
      </span>
      <span className="text-[11px] font-bold text-white">{label}</span>
    </button>
  );
}

function ProfileTabs({ userId, isSelf }: { userId: string; isSelf: boolean }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const tabs: { id: ProfileTab; label: string; icon: ReactNode }[] = [
    { id: "videos", label: "Videos", icon: <Grid3X3 size={18} className="royce-icon-gold" /> },
    { id: "shop", label: "Shop", icon: <ShoppingBag size={18} className="royce-icon-gold" /> },
    ...(isSelf ? [{ id: "private" as const, label: "Private", icon: <Lock size={18} className="royce-icon-gold" /> }] : []),
    { id: "reposts", label: "Reposts", icon: <Repeat2 size={18} className="royce-icon-gold" /> },
    { id: "saved", label: "Saved", icon: <Bookmark size={18} className="royce-icon-gold" /> },
    { id: "liked", label: "Liked", icon: <Heart size={18} className="royce-icon-gold" /> },
  ];
  const requested = params.get("tab");
  const initial = tabs.some((t) => t.id === requested) ? (requested as ProfileTab) : "videos";
  const [activeTab, setActiveTab] = useState<ProfileTab>(initial);
  const [items, setItems] = useState<FeedItem[]>([]);
  const [shopItems, setShopItems] = useState<ShopItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const allowed: ProfileTab[] = isSelf
      ? ["videos", "shop", "private", "reposts", "saved", "liked"]
      : ["videos", "shop", "reposts", "saved", "liked"];
    if (requested && allowed.includes(requested as ProfileTab)) setActiveTab(requested as ProfileTab);
  }, [requested, isSelf]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const load = async () => {
      if (activeTab === "shop") {
        const res = await apiListShopItems(userId);
        if (cancelled) return;
        if (res.error) showToast(res.error);
        setShopItems(res.items);
        setItems([]);
        setLoading(false);
        return;
      }
      const res =
        activeTab === "videos"
          ? await apiFetchUserVideos(userId, "public")
          : activeTab === "private"
            ? await apiFetchUserVideos(userId, "private")
            : activeTab === "saved"
              ? await apiFetchSavedFeed()
              : activeTab === "liked"
                ? await apiFetchLikedFeed()
                : await apiFetchReposts(userId);
      if (cancelled) return;
      if (res.error || !res.page) showToast(res.error || "Could not load");
      setItems(res.page?.items ?? []);
      setShopItems([]);
      setLoading(false);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [activeTab, userId]);

  return (
    <div className="w-full mt-1 flex flex-col min-h-0 flex-1">
      <div className="border-b border-white/10 flex">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 pb-2.5 pt-2.5 flex justify-center border-b-2 transition-colors ${
              activeTab === tab.id ? "border-white text-white" : "border-transparent text-white/30"
            }`}
            aria-label={tab.label}
          >
            {tab.icon}
          </button>
        ))}
      </div>
      {isSelf && activeTab === "private" ? (
        <div className="px-3 pt-2 pb-1 flex justify-end">
          <button type="button" onClick={() => navigate("/create")} className="px-3 py-1.5 rounded-md bg-[#E6E9EE] text-white text-[11px] font-bold">
            Post Story
          </button>
        </div>
      ) : null}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-[#E6E9EE]/25 border-t-[#E6E9EE] rounded-full animate-spin elix-loader" />
        </div>
      ) : null}
      {activeTab === "shop" && !loading ? (
        <div className="grid grid-cols-2 gap-3 px-3 py-2 pb-6">
          {shopItems.map((item) => (
            <button key={item.id} type="button" className="bg-white/5 rounded-2xl overflow-hidden border border-white/5 text-left" onClick={() => navigate("/shop")}>
              {item.imageUrl ? <img src={item.imageUrl} alt="" className="w-full aspect-square object-cover" /> : <div className="aspect-square bg-white/5" />}
              <div className="relative border-t border-white/15 px-2.5 py-2">
                <h3 className="text-sm font-bold text-gold-metallic truncate">{item.name}</h3>
                <p className="text-base font-extrabold text-white mt-0.5">{item.priceLabel}</p>
              </div>
            </button>
          ))}
          {shopItems.length === 0 ? <p className="col-span-2 text-white/40 text-sm text-center py-8">No items for sale yet</p> : null}
        </div>
      ) : null}
      {activeTab !== "shop" && !loading ? (
        <div className="grid grid-cols-3 gap-[2px] px-3 pt-3 pb-2">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              className="aspect-[3/4] bg-transparent relative group text-left rounded-xl overflow-hidden"
              onClick={() => navigate(item.kind === "live" ? `/watch/${item.streamId || item.id}` : `/video/${item.id}`)}
            >
              {item.thumbnailUrl || item.mediaUrl ? (
                item.kind === "video" && item.mediaUrl ? (
                  <video src={`${item.mediaUrl}#t=0.1`} poster={item.thumbnailUrl ?? undefined} muted playsInline preload="metadata" className="absolute inset-0 size-full object-cover" />
                ) : (
                  <img src={item.thumbnailUrl ?? ""} alt="" className="absolute inset-0 size-full object-cover" />
                )
              ) : (
                <div className="absolute inset-0 bg-[#080A0E]" />
              )}
              <span className="absolute bottom-1.5 left-1.5 z-[2] flex flex-col items-start gap-0.5 text-[11px] font-bold text-white drop-shadow-md">
                <Play size={10} fill="white" />
                <span className="leading-none">{formatCompactNumber(item.viewCount ?? 0)}</span>
              </span>
            </button>
          ))}
        </div>
      ) : null}
      {activeTab !== "shop" && !loading && items.length === 0 ? (
        <p className="text-white/40 text-sm text-center py-8">
          {activeTab === "videos" && "No videos yet"}
          {activeTab === "private" && "No private videos"}
          {activeTab === "reposts" && "No reposts yet"}
          {activeTab === "saved" && "No saved videos"}
          {activeTab === "liked" && "No liked videos"}
        </p>
      ) : null}
    </div>
  );
}
