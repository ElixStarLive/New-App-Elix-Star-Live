import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ChevronRight, MapPin, Music, Star, Trophy, Users } from "lucide-react";
import { AvatarRing } from "@/components/AvatarRing";
import { RoyceBackIcon } from "@/components/royce";
import {
  apiRisingStarsCategories,
  apiRisingStarsChallenges,
  apiRisingStarsCurrentSeason,
  apiRisingStarsRegions,
  apiRisingStarsStandings,
  apiRisingStarsTeams,
} from "@/features/risingStars/risingStarsApi";
import { createRisingStarsSession } from "@/features/risingStars/risingStarsSession";
import {
  RISING_STARS_EXIT_TO,
  RISING_STARS_HOME,
  containerReturnState,
  exitToFromLocationState,
} from "@/lib/settingsNav";
import { showToast } from "@/lib/toast";
import { useAuthStore } from "@/store/useAuthStore";

export default function RisingStars() {
  const navigate = useNavigate();
  const location = useLocation();
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const session = useMemo(
    () =>
      createRisingStarsSession({
        getAccountId: () => useAuthStore.getState().user?.id ?? null,
        loadCurrentSeason: apiRisingStarsCurrentSeason,
        loadCategories: apiRisingStarsCategories,
        loadRegions: apiRisingStarsRegions,
        loadStandings: apiRisingStarsStandings,
        loadTeams: apiRisingStarsTeams,
        loadChallenges: apiRisingStarsChallenges,
        toast: showToast,
        onSessionExpired: () => {
          void useAuthStore.getState().checkUser();
        },
      }),
    [],
  );
  const view = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);

  useEffect(() => {
    session.bindAccount(userId);
    if (userId) void session.load(userId);
  }, [session, userId]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const accountId = useAuthStore.getState().user?.id ?? null;
      if (accountId) void session.load(accountId);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [session]);

  const goBack = useCallback(() => {
    navigate(exitToFromLocationState(location.state, RISING_STARS_EXIT_TO), { replace: true });
  }, [navigate, location.state]);

  const openChallenge = useCallback(
    (challengeId: string) => {
      const id = challengeId.trim();
      if (!id) return;
      navigate(`/rising-stars/challenge/${encodeURIComponent(id)}`, {
        state: containerReturnState(RISING_STARS_HOME),
      });
    },
    [navigate],
  );

  const openCreatorProfile = useCallback(
    (creatorUserId: string) => {
      const id = creatorUserId.trim();
      if (!id) return;
      navigate(`/profile/${encodeURIComponent(id)}`, {
        state: containerReturnState(RISING_STARS_HOME),
      });
    },
    [navigate],
  );

  const hub = view.kind === "ready" ? view.hub : null;
  const season = hub?.season ?? null;

  return (
    <div className="page-above-bottom-nav bg-transparent text-white">
      <div className="page-above-bottom-nav__inner">
        <div
          className="w-full shrink-0 bg-transparent z-10"
          style={{ paddingTop: "var(--topnav-anchor-top)" }}
        >
          <div
            className="w-full px-3 flex items-center justify-between"
            style={{ minHeight: "var(--topnav-bar-height)" }}
          >
            <button type="button" onClick={goBack} className="p-1" aria-label="Back">
              <RoyceBackIcon className="w-6 h-6 text-white" />
            </button>
            <div className="flex items-center gap-2">
              <Trophy className="w-5 h-5 text-[#F5F5F7]" />
              <h1 className="text-base font-semibold">Rising Stars</h1>
            </div>
            <div className="w-8" />
          </div>
        </div>

        <div className="px-3 pb-6">
          {view.kind === "loading" ? (
            <div className="py-10 text-center text-white/50 text-sm">Loading...</div>
          ) : view.kind === "error" ? (
            <div className="py-10 text-center text-sm text-rose-300">{view.error}</div>
          ) : view.kind === "empty" || !season ? (
            <div className="py-10 text-center text-white/60 text-sm">
              No active Rising Stars season yet. Check back soon.
            </div>
          ) : (
            <>
              <div className="rounded-2xl border border-[#D8D9DD]/30 bg-gradient-to-br from-[#1a1608] to-[#09090B] p-4 mb-4">
                <div className="flex items-center gap-2 mb-1">
                  <Star className="w-4 h-4 text-[#F5F5F7]" />
                  <span className="text-xs uppercase tracking-wide text-[#F5F5F7]">
                    {season.status}
                  </span>
                </div>
                <h2 className="text-lg font-bold mb-1">{season.title}</h2>
                {season.description ? (
                  <p className="text-sm text-white/60">{season.description}</p>
                ) : (
                  <p className="text-sm text-white/60">
                    Compete with exclusive sounds. Free daily votes. Live finals.
                  </p>
                )}
              </div>

              <div className="flex gap-2 overflow-x-auto pb-2 mb-3">
                <button
                  type="button"
                  onClick={() => session.setCategoryId("")}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-xs border ${
                    !view.categoryId
                      ? "bg-[#E6E9EE] text-white elix-accent border-[#D8D9DD]"
                      : "border-white/20 text-white/70"
                  }`}
                >
                  All categories
                </button>
                {(hub?.categories ?? []).map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => session.setCategoryId(category.id)}
                    className={`shrink-0 px-3 py-1.5 rounded-full text-xs border ${
                      view.categoryId === category.id
                        ? "bg-[#E6E9EE] text-white elix-accent border-[#D8D9DD]"
                        : "border-white/20 text-white/70"
                    }`}
                  >
                    {category.title}
                  </button>
                ))}
              </div>

              <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
                <button
                  type="button"
                  onClick={() => session.setRegionId("")}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-xs border ${
                    !view.regionId
                      ? "bg-white/15 text-white border-white/20"
                      : "border-white/10 text-white/50"
                  }`}
                >
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="w-3 h-3" /> All regions
                  </span>
                </button>
                {(hub?.regions ?? []).map((region) => (
                  <button
                    key={region.id}
                    type="button"
                    onClick={() => session.setRegionId(region.id)}
                    className={`shrink-0 px-3 py-1.5 rounded-full text-xs border ${
                      view.regionId === region.id
                        ? "bg-white/15 text-white border-white/20"
                        : "border-white/10 text-white/50"
                    }`}
                  >
                    {region.title}
                  </button>
                ))}
              </div>

              <div className="flex gap-2 mb-4">
                {(
                  [
                    ["challenges", "Challenges"],
                    ["standings", "Standings"],
                    ["teams", "Teams"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => session.setTab(id)}
                    className={`flex-1 py-2 rounded-xl text-xs font-medium ${
                      view.tab === id ? "bg-[#E6E9EE] text-white elix-accent" : "bg-white/10 text-white/70"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {view.tab === "challenges" && (
                <div className="space-y-3">
                  {view.challengesLoading ? (
                    <div className="py-8 text-center text-white/50 text-sm">Loading...</div>
                  ) : view.challenges.length === 0 ? (
                    <p className="text-sm text-white/50 text-center py-8">
                      No challenges for this filter.
                    </p>
                  ) : (
                    view.challenges.map((challenge) => (
                      <button
                        key={challenge.id}
                        type="button"
                        onClick={() => openChallenge(challenge.id)}
                        className="w-full text-left rounded-xl border border-white/10 bg-white/5 p-3 flex items-center gap-3"
                      >
                        <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
                          <Music className="w-5 h-5 text-[#F5F5F7]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold truncate">{challenge.title}</div>
                          <div className="text-xs text-white/50">
                            Week {challenge.week_index} · {challenge.status}
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-white/40" />
                      </button>
                    ))
                  )}
                </div>
              )}

              {view.tab === "standings" && (
                <div className="space-y-2">
                  {(hub?.standings ?? []).length === 0 ? (
                    <p className="text-sm text-white/50 text-center py-8">No standings yet.</p>
                  ) : (
                    (hub?.standings ?? []).map((standing) => (
                      <button
                        key={standing.creator_user_id}
                        type="button"
                        onClick={() => openCreatorProfile(standing.creator_user_id)}
                        className="w-full flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3"
                      >
                        <span className="w-6 text-center text-[#F5F5F7] font-bold text-sm">
                          {standing.rank}
                        </span>
                        <AvatarRing
                          src={standing.avatar_url || ""}
                          size={36}
                          alt={standing.username}
                        />
                        <div className="flex-1 text-left min-w-0">
                          <div className="text-sm font-medium truncate">{standing.username}</div>
                          <div className="text-xs text-white/50">{standing.total_votes} votes</div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}

              {view.tab === "teams" && (
                <div className="space-y-2">
                  {(hub?.teams ?? []).length === 0 ? (
                    <p className="text-sm text-white/50 text-center py-8">No teams yet.</p>
                  ) : (
                    (hub?.teams ?? []).map((team) => (
                      <div
                        key={team.id}
                        className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3"
                      >
                        <Users className="w-5 h-5 text-[#F5F5F7]" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{team.name}</div>
                          <div className="text-xs text-white/50">
                            {team.member_count} members · {team.team_votes} votes
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
