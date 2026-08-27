import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { ChevronLeft, Settings, MessageCircle, UserPlus, User } from 'lucide-react';
import { fetchProfile, type PublicProfile } from '../features/users/usersApi';
import { fetchForYou, type FeedVideo } from '../features/feed/feedApi';
import { useAuthStore } from '../features/auth/authStore';
import { formatCompactNumber } from '../lib/formatCompactNumber';

const tabs = ['videos', 'saved', 'liked'] as const;
type Tab = (typeof tabs)[number];

export default function Profile() {
  const navigate = useNavigate();
  const location = useLocation();
  const { userId: routeUserId } = useParams<{ userId?: string }>();
  const currentUser = useAuthStore((s) => s.user);
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('videos');
  const [allVideos, setAllVideos] = useState<FeedVideo[]>([]);
  const [savedVideos, setSavedVideos] = useState<FeedVideo[]>([]);

  const effectiveUserId = routeUserId ?? currentUser?.id ?? '';
  const isOwn = effectiveUserId === currentUser?.id;

  useEffect(() => {
    if (!effectiveUserId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all([fetchProfile(effectiveUserId), fetchForYou()]).then(([pResult, vResult]) => {
      if (cancelled) return;
      if (pResult.error) {
        setError(pResult.error.message);
      } else if (pResult.data) {
        setProfile(pResult.data);
      }
      if (vResult.data) {
        setAllVideos(vResult.data.videos);
        setSavedVideos(vResult.data.videos.filter((v) => v.savedByMe));
      }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [effectiveUserId]);

  const goBack = useCallback(
    () => navigate((location.state as { from?: string } | null)?.from || '/feed', { replace: true }),
    [navigate, location.state],
  );

  const goEdit = useCallback(() => navigate('/edit-profile'), [navigate]);
  const goSettings = useCallback(() => navigate('/settings'), [navigate]);
  const openVideo = useCallback(
    (videoId: string) => navigate(`/video/${videoId}`, { state: { from: location.pathname } }),
    [navigate, location.pathname],
  );
  const goFollowers = useCallback(
    () => navigate(`/profile/${effectiveUserId}/followers`),
    [navigate, effectiveUserId],
  );
  const goFollowing = useCallback(
    () => navigate(`/profile/${effectiveUserId}/following`),
    [navigate, effectiveUserId],
  );

  const displayedVideos = (() => {
    if (activeTab === 'saved') return isOwn ? savedVideos : [];
    if (activeTab === 'liked') return [];
    return allVideos.filter((v) => v.user.id === effectiveUserId);
  })();

  if (error) {
    return (
      <div className="app-live-column flex h-full items-center justify-center p-4 text-white">
        <p>{error}</p>
      </div>
    );
  }

  if (loading || !profile) {
    return (
      <div className="app-live-column flex h-full items-center justify-center p-4 text-white/60">
        <p>Loading profile…</p>
      </div>
    );
  }

  return (
    <div className="app-live-column h-full w-full overflow-y-auto text-white">
      <div className="mx-auto w-full max-w-[480px] p-4">
        <div className="mb-4 flex items-center justify-between">
          <button onClick={goBack} className="p-1" aria-label="Back">
            <span className="royce-glow-disc">
              <ChevronLeft size={18} strokeWidth={2.35} className="royce-icon-gold" />
            </span>
          </button>
          <h1 className="elix-silver-red-text text-lg font-bold">{profile.displayName}</h1>
          {isOwn ? (
            <button onClick={goSettings} className="p-1" aria-label="Settings">
              <span className="royce-glow-disc">
                <Settings size={18} strokeWidth={2.25} className="royce-icon-gold" />
              </span>
            </button>
          ) : (
            <button onClick={goBack} className="p-1" aria-label="Close">
              <span className="royce-glow-disc">
                <ChevronLeft size={18} strokeWidth={2.35} className="royce-icon-gold" />
              </span>
            </button>
          )}
        </div>

        <div className="mb-6 flex items-center gap-4">
          {profile.avatarUrl ? (
            <img
              src={profile.avatarUrl}
              alt=""
              className="h-20 w-20 rounded-full border-2 border-[#D8D9DD] object-cover"
            />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-[#D8D9DD] bg-white/10">
              <User className="h-10 w-10 text-white/40" />
            </div>
          )}
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-white">{profile.displayName}</h2>
            <p className="text-sm text-white/60">@{profile.username}</p>
            {profile.bio && <p className="mt-2 text-sm text-white/80">{profile.bio}</p>}
          </div>
        </div>

        <div className="mb-6 flex justify-around">
          <button onClick={goFollowers} className="text-center">
            <div className="text-lg font-bold text-white">{formatCompactNumber(profile.followers)}</div>
            <div className="text-xs text-white/60">Followers</div>
          </button>
          <button onClick={goFollowing} className="text-center">
            <div className="text-lg font-bold text-white">{formatCompactNumber(profile.following)}</div>
            <div className="text-xs text-white/60">Following</div>
          </button>
          <div className="text-center">
            <div className="text-lg font-bold text-white">{formatCompactNumber(profile.videoCount)}</div>
            <div className="text-xs text-white/60">Videos</div>
          </div>
        </div>

        <div className="mb-6 flex gap-2">
          {isOwn ? (
            <>
              <button
                onClick={goEdit}
                className="flex-1 rounded-xl border border-white/20 bg-white/10 py-2 text-sm font-bold text-white"
              >
                Edit profile
              </button>
              <button
                onClick={goSettings}
                className="rounded-xl border border-white/20 bg-white/10 p-2"
              >
                <Settings size={18} className="royce-icon-gold" />
              </button>
            </>
          ) : (
            <>
              <button className="flex-1 rounded-xl border border-white/20 bg-white/10 py-2 text-sm font-bold text-white">
                <UserPlus size={16} className="mr-1 inline" />
                Follow
              </button>
              <button className="rounded-xl border border-white/20 bg-white/10 p-2">
                <MessageCircle size={18} className="royce-icon-gold" />
              </button>
            </>
          )}
        </div>

        <div className="mb-4 flex gap-2">
          {tabs.map((t) => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className={`flex-1 rounded-xl py-2 text-xs font-bold ${
                activeTab === t ? 'bg-[#E6E9EE] text-black' : 'bg-white/10 text-white/70'
              }`}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-1">
          {displayedVideos.map((v) => (
            <button
              key={v.id}
              onClick={() => openVideo(v.id)}
              className="relative aspect-[9/16] overflow-hidden rounded bg-transparent"
            >
              <img src={v.thumbnail} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>

        {!loading && displayedVideos.length === 0 && (
          <div className="py-12 text-center text-white/40">No {activeTab} videos yet.</div>
        )}
      </div>
    </div>
  );
}
