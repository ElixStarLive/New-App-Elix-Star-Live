import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import type { UserPublic } from "@shared/contracts";
import { apiFollow, apiFollowList, apiUnfollow } from "@/features/feed/feedApi";
import { PageScaffold } from "@/components/PageScaffold";
import { AvatarRing } from "@/components/AvatarRing";
import { containerReturnState, exitToFromLocationState } from "@/lib/settingsNav";
import { useAuthStore } from "@/store/useAuthStore";
import { showToast } from "@/lib/toast";

export default function FollowList() {
  const { userId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const me = useAuthStore((s) => s.user);
  const kind = location.pathname.endsWith("/following") ? "following" : "followers";
  const [users, setUsers] = useState<UserPublic[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    void apiFollowList(userId, kind).then((res) => {
      setLoading(false);
      if (res.error) setError(res.error);
      else {
        setUsers(res.users);
        setFollowingIds(new Set(res.users.filter((u) => u.isFollowing).map((u) => u.id)));
      }
    });
  }, [userId, kind]);

  return (
    <PageScaffold
      title={kind === "following" ? "Following" : "Followers"}
      headerBorder={false}
      onClose={() => navigate(exitToFromLocationState(location.state, userId ? `/profile/${userId}` : "/profile"), { replace: true })}
    >
      {error ? <p className="px-4 text-rose-300 text-sm">{error}</p> : null}
      {loading ? (
        <div className="flex justify-center py-10">
          <div className="w-6 h-6 border-2 border-[#E6E9EE]/25 border-t-[#E6E9EE] rounded-full animate-spin elix-loader" />
        </div>
      ) : users.length === 0 ? (
        <p className="text-white/40 text-sm text-center py-10">{kind === "following" ? "Not following anyone yet." : "No followers yet."}</p>
      ) : (
        <div className="px-4 pb-8 space-y-1">
          {users.map((u) => {
            const following = followingIds.has(u.id);
            return (
              <div key={u.id} className="flex items-center gap-3 py-2.5">
                <button
                  type="button"
                  className="flex items-center gap-3 flex-1 min-w-0 text-left"
                  onClick={() => navigate(`/profile/${u.id}`, { state: containerReturnState(location.pathname) })}
                >
                  <AvatarRing src={u.avatarUrl} alt={u.displayName} size={44} />
                  <div className="min-w-0">
                    <p className="text-white text-sm font-semibold truncate">{u.displayName}</p>
                    <p className="text-white/45 text-xs truncate">@{u.username}</p>
                  </div>
                </button>
                {me?.id !== u.id ? (
                  <button
                    type="button"
                    onClick={() => {
                      void (following ? apiUnfollow(u.id) : apiFollow(u.id)).then((r) => {
                        if (!r.ok) showToast(r.error);
                        else {
                          setFollowingIds((prev) => {
                            const next = new Set(prev);
                            if (following) next.delete(u.id);
                            else next.add(u.id);
                            return next;
                          });
                        }
                      });
                    }}
                    className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold ${
                      following ? "bg-white/10 text-white border border-white/15" : "elix-solid-red"
                    }`}
                  >
                    {following ? "Following" : "Follow"}
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </PageScaffold>
  );
}
