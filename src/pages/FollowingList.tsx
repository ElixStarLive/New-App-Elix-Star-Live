import { useEffect, useRef } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { AvatarRing } from "@/components/AvatarRing";
import { RoyceBackIcon } from "@/components/royce";
import { createFollowingSession } from "@/features/profile/followingSession";
import { useFollowingSession } from "@/features/profile/useFollowingSession";
import { subscribeFollowRelationship } from "@/lib/followRelationshipEvents";
import { containerReturnState, exitToFromLocationState, FOLLOW_LIST_EXIT_TO } from "@/lib/settingsNav";
import { showToast } from "@/lib/toast";
import { useAuthStore } from "@/store/useAuthStore";

export default function FollowingList() {
  const { userId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const me = useAuthStore((s) => s.user);
  const sessionRef = useRef(createFollowingSession());
  const session = sessionRef.current;
  const snap = useFollowingSession(session);
  const ownerId = (userId || "").trim();
  const listFallback = ownerId ? `/profile/${ownerId}` : FOLLOW_LIST_EXIT_TO;

  useEffect(() => {
    if (!ownerId) return;
    void session.load(ownerId, me?.id ?? null).then(() => {
      const after = session.getSnapshot();
      if (after.error && after.users.length > 0) showToast("Could not load list");
    });
    return () => {
      session.dispose();
    };
  }, [session, ownerId, me?.id]);

  useEffect(() => {
    return subscribeFollowRelationship((ev) => {
      sessionRef.current.applyFollowEvent(ev);
    });
  }, []);

  const goBack = () => navigate(exitToFromLocationState(location.state, listFallback), { replace: true });

  return (
    <div className="fixed inset-0 z-[100] elix-page-glass bg-transparent flex flex-col max-w-[480px] mx-auto">
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="relative flex items-center justify-between px-3 pb-2 pt-[max(12px,var(--safe-top))]">
          <button type="button" onClick={goBack} aria-label="Back">
            <RoyceBackIcon />
          </button>
          <h1 className="text-sm font-bold text-[#F5F5F7] absolute left-1/2 -translate-x-1/2">Following</h1>
          <div className="w-8" />
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-8">
          {snap.phase === "loading" || snap.phase === "idle" ? (
            <div className="flex justify-center py-10">
              <div className="w-6 h-6 border-2 border-[#E6E9EE]/25 border-t-[#E6E9EE] rounded-full animate-spin elix-loader" />
            </div>
          ) : snap.phase === "error" && snap.users.length === 0 ? (
            <p className="text-rose-300 text-sm text-center py-10">{snap.error}</p>
          ) : snap.users.length === 0 ? (
            <p className="text-white/40 text-sm text-center py-10">Not following anyone yet.</p>
          ) : (
            <div className="space-y-1">
              {snap.users.map((user) => {
                const name = user.displayName || user.username || "User";
                const isMe = me?.id === user.id;
                const following = Boolean(user.isFollowing);
                return (
                  <div key={user.id} className="flex items-center gap-3 py-2.5">
                    <button
                      type="button"
                      className="flex items-center gap-3 flex-1 min-w-0 text-left"
                      onClick={() =>
                        navigate(`/profile/${user.id}`, { state: containerReturnState(location.pathname) })
                      }
                    >
                      <AvatarRing src={user.avatarUrl} alt={name} size={44} />
                      <div className="min-w-0">
                        <p className="text-white text-sm font-semibold truncate">{name}</p>
                        <p className="text-white/45 text-xs truncate">@{user.username}</p>
                      </div>
                    </button>
                    {!isMe ? (
                      <button
                        type="button"
                        disabled={snap.followBusyId === user.id}
                        onClick={() => {
                          if (!me?.id) {
                            showToast("Log in to follow");
                            navigate("/login");
                            return;
                          }
                          void session.toggleFollow(user.id, me.id).then((res) => {
                            if (!res.ok && res.error !== "busy") showToast("Could not update follow");
                          });
                        }}
                        className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold active:scale-95 disabled:opacity-50 ${
                          following ? "bg-white/10 text-white border border-white/15" : "bg-[#E6E9EE] text-white elix-solid-accent"
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
        </div>
      </div>
    </div>
  );
}
