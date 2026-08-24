import { useEffect, useRef, type ReactNode } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
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
} from "lucide-react";
import { LevelBadge } from "@/components/LevelBadge";
import { RoyceCloseIcon } from "@/components/royce";
import { StoryGoldRingAvatar } from "@/components/StoryGoldRingAvatar";
import { createOwnProfileSession } from "@/features/profile/ownProfileSession";
import { ownProfileEmailLine, type OwnProfileTab } from "@/features/profile/ownProfileApi";
import { useOwnProfileSession } from "@/features/profile/useOwnProfileSession";
import { PROFILE_PAGE_AVATAR_PX } from "@/lib/profileFrame";
import { containerReturnState, exitToFromLocationState, PROFILE_EXIT_TO } from "@/lib/settingsNav";
import { formatCompactNumber } from "@/lib/formatCompactNumber";
import { getPublicWebOrigin } from "@/lib/api";
import { nativeShareUrl, openExternalLink } from "@/lib/platform";
import { showToast } from "@/lib/toast";
import { useAuthStore } from "@/store/useAuthStore";

const TABS: { id: OwnProfileTab; label: string; icon: ReactNode }[] = [
  { id: "videos", label: "Videos", icon: <Grid3X3 size={18} className="royce-icon-gold" /> },
  { id: "shop", label: "Shop", icon: <ShoppingBag size={18} className="royce-icon-gold" /> },
  { id: "private", label: "Private", icon: <Lock size={18} className="royce-icon-gold" /> },
  { id: "reposts", label: "Reposts", icon: <Repeat2 size={18} className="royce-icon-gold" /> },
  { id: "saved", label: "Saved", icon: <Bookmark size={18} className="royce-icon-gold" /> },
  { id: "liked", label: "Liked", icon: <Heart size={18} className="royce-icon-gold" /> },
];

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

export default function OwnProfile() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const me = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);
  const sessionRef = useRef(createOwnProfileSession());
  const session = sessionRef.current;
  const snap = useOwnProfileSession(session);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const accountRef = useRef(me?.id ?? null);

  useEffect(() => {
    const owned = sessionRef.current;
    const requested = params.get("tab");
    if (requested && TABS.some((t) => t.id === requested)) {
      owned.setTab(requested as OwnProfileTab);
    }
    void owned.load();
    return () => {
      owned.dispose();
    };
    // Mount-scoped session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (accountRef.current === (me?.id ?? null)) return;
    accountRef.current = me?.id ?? null;
    sessionRef.current.dispose();
    void sessionRef.current.load();
  }, [me?.id]);

  const profile = snap.profile;
  const profileUrl = profile ? `${getPublicWebOrigin()}/profile/${profile.id}` : "";
  const emailLine = ownProfileEmailLine(me?.email, profile?.username ?? me?.username ?? "");

  const close = () => navigate(exitToFromLocationState(location.state, PROFILE_EXIT_TO), { replace: true });
  const nested = () => containerReturnState("/profile");

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
          <button type="button" onClick={() => session.setShareOpen(true)} title="Share profile" className="relative z-20 p-1">
            <span className="royce-glow-disc" style={{ width: 34, height: 34 }} aria-hidden>
              <Share2 size={18} className="royce-icon-gold" strokeWidth={2} />
            </span>
          </button>
          <div className="pointer-events-none flex-1 flex items-center justify-center min-w-0 px-2">
            <div className="text-[16px] font-bold text-white truncate">Profile</div>
          </div>
          <button type="button" onClick={close} title="Close" aria-label="Close" className="relative z-20 p-1">
            <RoyceCloseIcon />
          </button>
        </header>

        {snap.phase === "error" ? <p className="px-4 text-rose-300 text-sm">{snap.error}</p> : null}
        {snap.phase === "loading" && !profile ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-2 border-[#E6E9EE]/25 border-t-[#E6E9EE] rounded-full animate-spin elix-loader" />
          </div>
        ) : null}

        {profile ? (
          <>
            <div className="shrink-0">
              <div className="flex flex-col items-center mt-2 mb-3 overflow-visible">
                <div
                  className="relative overflow-visible cursor-pointer"
                  style={{ width: PROFILE_PAGE_AVATAR_PX + 8, height: PROFILE_PAGE_AVATAR_PX + 8 }}
                  onClick={() => {
                    if (snap.uploadingAvatar) return;
                    fileInputRef.current?.click();
                  }}
                >
                  <div
                    className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full ${snap.hasStory ? "p-[2px]" : ""}`}
                    style={{
                      background: snap.hasStory ? "linear-gradient(135deg, #E6E9EE, #FFFFFF, #E6E9EE)" : "transparent",
                    }}
                  >
                    <StoryGoldRingAvatar size={PROFILE_PAGE_AVATAR_PX} src={profile.avatarUrl ?? ""} alt={profile.displayName} />
                  </div>
                  <button
                    type="button"
                    className="profile-add-story-btn bottom-0 right-0 z-50"
                    title="Add story"
                    aria-label="Add story"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate("/upload?type=story", { state: nested() });
                    }}
                  >
                    <span className="profile-add-story-btn__plus" aria-hidden>
                      +
                    </span>
                  </button>
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
                    void session.uploadAvatar(file).then((res) => {
                      if (!res.ok) {
                        showToast(res.error || "Avatar upload failed");
                        return;
                      }
                      updateUser({ avatarUrl: res.avatarUrl });
                    });
                  }}
                />
                {snap.uploadingAvatar ? <div className="text-xs text-white/70 mt-1">Uploading...</div> : null}
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
                  <LevelBadge level={1} hideCircle />
                </div>
              </div>

              <div className="mx-4 mt-4">
                <div className="flex items-center justify-center gap-6 px-4 py-3">
                  <button type="button" className="flex flex-col items-center min-w-[60px] active:opacity-80" onClick={() => navigate(`/profile/${profile.id}/following`, { state: nested() })}>
                    <span className="text-[17px] font-extrabold text-white">{formatCompactNumber(profile.followingCount)}</span>
                    <span className="text-[11px] text-[#E6E9EE] font-medium">Following</span>
                  </button>
                  <button type="button" className="flex flex-col items-center min-w-[60px] active:opacity-80" onClick={() => navigate(`/profile/${profile.id}/followers`, { state: nested() })}>
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

              <div className="mt-2">
                <div className="flex justify-center overflow-x-auto no-scrollbar">
                  <ActionChip label="AI Studio" onClick={() => navigate("/ai-studio", { state: nested() })} icon={<Sparkles size={12} className="royce-icon-gold" />} />
                  <ActionChip label="Elix Studio" onClick={() => navigate("/creator/login-details", { state: nested() })} icon={<Sparkles size={12} className="royce-icon-gold" />} />
                  <ActionChip label="Shop" onClick={() => navigate("/shop", { state: nested() })} icon={<ShoppingBag size={12} className="royce-icon-gold" />} />
                  <ActionChip label="Showcase" onClick={() => session.setTab("shop")} icon={<ShoppingBag size={12} className="royce-icon-gold" />} />
                  <ActionChip label="Settings" onClick={() => navigate("/settings", { state: nested() })} icon={<Settings size={12} className="royce-icon-gold" />} />
                </div>
              </div>

              <div className="border-b border-white/10 flex">
                {TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => session.setTab(tab.id)}
                    className={`flex-1 pb-2.5 pt-2.5 flex justify-center border-b-2 transition-colors ${
                      snap.tab === tab.id ? "border-white text-white" : "border-transparent text-white/30"
                    }`}
                    aria-label={tab.label}
                  >
                    {tab.icon}
                  </button>
                ))}
              </div>
              {snap.tab === "private" ? (
                <div className="px-3 pt-2 pb-1 flex justify-end">
                  <button type="button" onClick={() => navigate("/upload?type=story", { state: nested() })} className="px-3 py-1.5 rounded-md bg-[#E6E9EE] text-white text-[11px] font-bold">
                    Post Story
                  </button>
                </div>
              ) : null}
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain">
              {snap.tabError ? <p className="px-4 pt-3 text-rose-300 text-sm">{snap.tabError}</p> : null}
              {snap.tab === "shop" ? (
                snap.tabLoading && snap.shopItems.length === 0 ? (
                  <div className="flex items-center justify-center py-16">
                    <div className="w-8 h-8 border-2 border-[#E6E9EE]/25 border-t-[#E6E9EE] rounded-full animate-spin elix-loader" />
                  </div>
                ) : snap.shopItems.length > 0 ? (
                  <div className="grid grid-cols-2 gap-3 px-3 py-3">
                    {snap.shopItems.map((item) => (
                      <button key={item.id} type="button" className="bg-white/5 rounded-2xl overflow-hidden border border-white/5 text-left" onClick={() => navigate("/shop", { state: nested() })}>
                        {item.imageUrl ? <img src={item.imageUrl} alt="" className="w-full aspect-square object-cover" /> : <div className="aspect-square bg-white/5" />}
                        <div className="relative border-t border-white/15 px-2.5 py-2">
                          <h3 className="text-sm font-bold text-gold-metallic truncate">{item.name}</h3>
                          <p className="text-base font-extrabold text-white mt-0.5">{item.priceLabel}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : !snap.tabLoading ? (
                  <div className="flex-1 flex flex-col items-center justify-center py-16 gap-2">
                    <ShoppingBag size={32} className="text-white/20" />
                    <span className="text-white/30 text-sm">No items for sale</span>
                    <button type="button" onClick={() => navigate("/shop", { state: nested() })} className="mt-2 px-4 py-2 rounded-xl bg-[#E6E9EE] text-white font-bold text-xs">
                      Start Selling
                    </button>
                  </div>
                ) : null
              ) : (
                <>
                  {snap.tabLoading && snap.items.length === 0 ? (
                    <div className="flex items-center justify-center py-16">
                      <div className="w-8 h-8 border-2 border-[#E6E9EE]/25 border-t-[#E6E9EE] rounded-full animate-spin elix-loader" />
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-[2px] px-3 pt-3 pb-2">
                      {snap.items.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className="aspect-[3/4] bg-transparent relative group text-left rounded-xl overflow-hidden"
                          onClick={() =>
                            navigate(`/video/${item.id}`, {
                              state: { ...nested(), fromProfile: true },
                            })
                          }
                        >
                          {item.thumbnail || item.url ? (
                            item.url ? (
                              <video src={`${item.url}#t=0.1`} poster={item.thumbnail || undefined} muted playsInline preload="metadata" className="absolute inset-0 size-full object-cover opacity-90 group-hover:opacity-100 transition pointer-events-none" />
                            ) : (
                              <img src={item.thumbnail ?? ""} alt="" className="absolute inset-0 size-full object-cover opacity-90 group-hover:opacity-100 transition pointer-events-none" loading="lazy" />
                            )
                          ) : (
                            <div className="absolute inset-0 bg-[#080A0E]" />
                          )}
                          {snap.tab === "private" ? (
                            <div className="absolute top-2 right-2 z-[2]">
                              <Lock size={14} className="text-white drop-shadow" />
                            </div>
                          ) : null}
                          <span className="absolute bottom-1.5 left-1.5 z-[2] flex flex-col items-start gap-0.5 text-[11px] font-bold text-white drop-shadow-md">
                            <Play size={10} fill="white" />
                            <span className="leading-none">{formatCompactNumber(item.stats?.views ?? 0)}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  {!snap.tabLoading && snap.items.length === 0 && !snap.tabError ? (
                    <div className="flex-1 flex flex-col items-center justify-center py-16 text-white/30 text-sm">
                      {snap.tab === "videos" ? "No videos yet" : null}
                      {snap.tab === "private" ? (
                        <>
                          <span>No private videos</span>
                          <button type="button" onClick={() => navigate("/upload?type=story", { state: nested() })} className="mt-2 px-3 py-1.5 rounded-md bg-[#E6E9EE] text-white text-[11px] font-bold">
                            Post Story
                          </button>
                        </>
                      ) : null}
                      {snap.tab === "reposts" ? "No reposts yet" : null}
                      {snap.tab === "saved" ? "No saved videos" : null}
                      {snap.tab === "liked" ? "No liked videos" : null}
                    </div>
                  ) : null}
                  {snap.nextCursor ? (
                    <div className="flex justify-center py-3">
                      <button type="button" disabled={snap.tabLoadingMore} onClick={() => void session.loadMore()} className="px-4 py-2 rounded-lg bg-white/10 text-xs font-semibold text-white/80 disabled:opacity-40">
                        {snap.tabLoadingMore ? "Loading…" : "Load more"}
                      </button>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </>
        ) : null}

        {snap.shareOpen && profile ? (
          <div className="fixed inset-x-0 top-0 z-[80] elix-page-glass flex flex-col max-w-[480px] mx-auto fixed-above-bottom-nav">
            <header className="flex items-center justify-between px-4 pb-2" style={{ paddingTop: "var(--page-header-top)" }}>
              <span className="w-10" />
              <h2 className="text-[16px] font-bold">Share to</h2>
              <button type="button" onClick={() => session.setShareOpen(false)} aria-label="Close" className="p-1">
                <RoyceCloseIcon />
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
                    session.setShareOpen(false);
                    navigate("/report", { state: containerReturnState("/profile") });
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
