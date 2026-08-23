import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Music, Radio, Trophy, Users, Video, Vote } from "lucide-react";
import { AvatarRing } from "@/components/AvatarRing";
import { RoyceBackIcon } from "@/components/royce";
import {
  apiRisingStarsAttachLive,
  apiRisingStarsChallenge,
  apiRisingStarsChallengeEntries,
  apiRisingStarsChallengeLeaderboard,
  apiRisingStarsEnterChallenge,
  apiRisingStarsJoinTeam,
  apiRisingStarsTeams,
  apiRisingStarsVoteEntry,
  apiRisingStarsWithdrawEntry,
} from "@/features/risingStars/risingStarsApi";
import { createRisingStarsChallengeSession } from "@/features/risingStars/risingStarsChallengeSession";
import { apiFetchUserVideos } from "@/features/feed/feedApi";
import {
  RISING_STARS_HOME,
  containerReturnState,
  exitToFromLocationState,
} from "@/lib/settingsNav";
import { nativeShareUrl } from "@/lib/platform";
import { showToast } from "@/lib/toast";
import { useAuthStore } from "@/store/useAuthStore";

export default function RisingStarsChallenge() {
  const { challengeId: routeChallengeId } = useParams<{ challengeId: string }>();
  const challengeId = routeChallengeId?.trim() ?? "";
  const navigate = useNavigate();
  const location = useLocation();
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const session = useMemo(
    () =>
      createRisingStarsChallengeSession({
        getAccountId: () => useAuthStore.getState().user?.id ?? null,
        loadChallenge: apiRisingStarsChallenge,
        loadEntries: apiRisingStarsChallengeEntries,
        loadLeaderboard: apiRisingStarsChallengeLeaderboard,
        loadTeams: apiRisingStarsTeams,
        loadVideos: async (accountId) => {
          const { page, error } = await apiFetchUserVideos(accountId, "public");
          if (error || !page) return { videos: [], error };
          return {
            videos: page.videos.map((video) => ({
              id: video.id,
              description: video.description || video.id,
            })),
            error: null,
          };
        },
        enterChallenge: apiRisingStarsEnterChallenge,
        withdrawEntry: apiRisingStarsWithdrawEntry,
        voteEntry: apiRisingStarsVoteEntry,
        joinTeam: apiRisingStarsJoinTeam,
        attachLive: apiRisingStarsAttachLive,
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
    session.bindChallenge(challengeId);
    if (challengeId) void session.load(challengeId, userId);
  }, [session, userId, challengeId]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const accountId = useAuthStore.getState().user?.id ?? null;
      const id = challengeId.trim();
      if (id) void session.load(id, accountId);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [session, challengeId]);

  const challengePath = challengeId
    ? `/rising-stars/challenge/${challengeId}`
    : RISING_STARS_HOME;

  const goBack = useCallback(() => {
    navigate(exitToFromLocationState(location.state, RISING_STARS_HOME), { replace: true });
  }, [navigate, location.state]);
  const goLogin = useCallback(() => navigate("/login"), [navigate]);
  const goCreate = useCallback(() => navigate("/create"), [navigate]);
  const openCreatorProfile = useCallback(
    (creatorUserId: string) => {
      if (!creatorUserId) return;
      navigate(`/profile/${encodeURIComponent(creatorUserId)}`, {
        state: containerReturnState(challengePath),
      });
    },
    [navigate, challengePath],
  );
  const openVideo = useCallback(
    (videoId: string) => {
      if (!videoId) return;
      navigate(`/video/${encodeURIComponent(videoId)}`, {
        state: containerReturnState(challengePath),
      });
    },
    [navigate, challengePath],
  );
  const openWatchLive = useCallback(
    (roomId: string | null) => {
      if (!roomId) {
        showToast("Live stage not scheduled yet");
        return;
      }
      navigate(`/watch/${encodeURIComponent(roomId)}`, {
        state: containerReturnState(challengePath),
      });
    },
    [navigate, challengePath],
  );

  const challenge = view.challenge;
  const soundTitle = useMemo(() => {
    const meta = challenge?.sound_meta || {};
    return String(meta.title || meta.name || challenge?.sound_track_id || "Exclusive sound");
  }, [challenge]);

  const share = useCallback(async () => {
    if (!challengeId) return;
    await nativeShareUrl({
      title: challenge?.title || "Rising Stars",
      text: "Vote in Rising Stars on Elix Star Live",
      url: `https://www.elixstarlive.co.uk/rising-stars/challenge/${challengeId}`,
    });
  }, [challengeId, challenge?.title]);

  const canEnter =
    Boolean(userId) &&
    view.kind === "ready" &&
    view.entriesStatus === "ready" &&
    !view.myEntry &&
    Boolean(challenge && ["open", "voting"].includes(challenge.status));
  const canWithdraw =
    Boolean(userId) &&
    view.kind === "ready" &&
    Boolean(view.myEntry && ["pending", "active"].includes(view.myEntry.status)) &&
    Boolean(challenge && ["open", "voting"].includes(challenge.status) && !challenge.leaderboard_frozen);
  const canAttach =
    Boolean(userId) &&
    view.kind === "ready" &&
    Boolean(view.myEntry && ["pending", "active", "advanced"].includes(view.myEntry.status)) &&
    Boolean(challenge && ["open", "voting", "qualified", "final"].includes(challenge.status) && !challenge.leaderboard_frozen);

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
              <h1 className="text-base font-semibold">Challenge</h1>
            </div>
            <button type="button" onClick={() => void share()} className="text-xs text-[#F5F5F7]">
              Share
            </button>
          </div>
        </div>

        <div className="px-3 pb-8">
          {view.kind === "loading" ? (
            <div className="py-10 text-center text-white/50 text-sm">Loading...</div>
          ) : view.kind === "not_found" || view.kind === "error" || !challenge ? (
            <div className="py-10 text-center text-sm text-rose-300">
              {view.error || "Could not load challenge"}
            </div>
          ) : (
            <>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 mb-4">
                <div className="text-xs text-[#F5F5F7] mb-1 uppercase">
                  Week {challenge.week_index} · {challenge.status}
                </div>
                <h2 className="text-lg font-bold mb-2">{challenge.title}</h2>
                {challenge.description && (
                  <p className="text-sm text-white/60 mb-3">{challenge.description}</p>
                )}
                <div className="flex items-center gap-2 text-sm text-white/80">
                  <Music className="w-4 h-4 text-[#F5F5F7]" />
                  <span>Required sound: {soundTitle}</span>
                </div>
                <p className="text-xs text-white/40 mt-2">
                  One free vote per day. Votes are not coins and cannot be bought.
                </p>
                <div className="flex gap-2 mt-3">
                  <button
                    type="button"
                    onClick={() => openWatchLive(challenge.live_qualifier_room_id)}
                    className="flex-1 py-2 rounded-xl bg-white/10 text-xs flex items-center justify-center gap-1"
                  >
                    <Radio className="w-3 h-3" /> Qualifier
                  </button>
                  <button
                    type="button"
                    onClick={() => openWatchLive(challenge.live_final_room_id)}
                    className="flex-1 py-2 rounded-xl bg-white/10 text-xs flex items-center justify-center gap-1"
                  >
                    <Radio className="w-3 h-3" /> Final
                  </button>
                </div>
                {canAttach && userId ? (
                  <button
                    type="button"
                    disabled={view.busy}
                    onClick={() =>
                      void session.attachLive(
                        challenge.status === "final" ? "final" : "qualifier",
                        userId,
                      )
                    }
                    className="w-full mt-2 py-2 rounded-xl bg-white/10 text-xs disabled:opacity-40"
                  >
                    Attach live
                  </button>
                ) : null}
              </div>

              {userId && ["open", "voting"].includes(challenge.status) && (
                <div className="rounded-2xl border border-[#D8D9DD]/25 bg-[#1a1608] p-4 mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Video className="w-4 h-4 text-[#F5F5F7]" />
                    <span className="text-sm font-semibold">Enter with your video</span>
                  </div>
                  {view.entriesStatus === "loading" ? (
                    <p className="text-xs text-white/50">Loading...</p>
                  ) : view.myEntry && view.myEntry.status === "withdrawn" ? (
                    <p className="text-xs text-white/50">Entry withdrawn</p>
                  ) : view.myEntry && view.myEntry.status === "disqualified" ? (
                    <p className="text-xs text-white/50">Disqualified</p>
                  ) : canWithdraw ? (
                    <>
                      <p className="text-xs text-white/50 mb-2">Your entry is in this challenge.</p>
                      <button
                        type="button"
                        disabled={view.busy}
                        onClick={() => void session.withdraw()}
                        className="w-full py-2 rounded-xl bg-white/10 text-xs disabled:opacity-40"
                      >
                        Withdraw entry
                      </button>
                    </>
                  ) : canEnter ? (
                    <>
                      <p className="text-xs text-white/50 mb-2">
                        Video must use the required sound. Create one first if needed.
                      </p>
                      <select
                        value={view.selectedVideoId}
                        onChange={(event) => session.selectVideo(event.target.value)}
                        className="w-full bg-transparent border border-white/10 rounded-xl px-3 py-2 text-sm mb-2"
                      >
                        <option value="">Select a video…</option>
                        {view.videos.map((video) => (
                          <option key={video.id} value={video.id}>
                            {video.description.slice(0, 60)}
                          </option>
                        ))}
                      </select>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={goCreate}
                          className="flex-1 py-2 rounded-xl bg-white/10 text-xs"
                        >
                          Create video
                        </button>
                        <button
                          type="button"
                          disabled={!view.selectedVideoId || view.busy}
                          onClick={() => {
                            if (!userId) {
                              goLogin();
                              return;
                            }
                            void session.enter();
                          }}
                          className="flex-1 py-2 rounded-xl bg-[#E6E9EE] text-white text-xs font-semibold disabled:opacity-40"
                        >
                          Submit entry
                        </button>
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-white/50">
                      {view.myEntry ? "Your entry is in this challenge." : "Entry is not available."}
                    </p>
                  )}
                </div>
              )}

              <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <Vote className="w-4 h-4 text-[#F5F5F7]" /> Entries
                {view.votedToday && (
                  <span className="text-xs text-white/40 font-normal">(voted today)</span>
                )}
              </h3>
              <div className="space-y-2">
                {view.entriesStatus === "loading" ? (
                  <p className="text-sm text-white/50 text-center py-8">Loading...</p>
                ) : view.entriesStatus === "error" ? (
                  <p className="text-sm text-rose-300 text-center py-8">
                    {view.entriesError || "Could not load entries"}
                  </p>
                ) : view.entries.length === 0 ? (
                  <p className="text-sm text-white/50 text-center py-8">No entries yet.</p>
                ) : (
                  view.entries.map((entry, idx) => (
                    <div
                      key={entry.id}
                      className="rounded-xl border border-white/10 bg-white/5 p-3 flex items-center gap-3"
                    >
                      <span className="w-6 text-center text-[#F5F5F7] font-bold text-sm">
                        {idx + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => openCreatorProfile(entry.creator_user_id)}
                      >
                        <AvatarRing
                          src={entry.avatar_url || ""}
                          size={36}
                          alt={entry.username || "Creator"}
                        />
                      </button>
                      <div className="flex-1 min-w-0">
                        <button
                          type="button"
                          className="text-sm font-medium truncate block text-left"
                          onClick={() => openVideo(entry.video_id || "")}
                        >
                          {entry.username || "Creator"}
                        </button>
                        <div className="text-xs text-white/50">{entry.vote_count} votes</div>
                      </div>
                      <button
                        type="button"
                        disabled={
                          view.busy ||
                          view.votedToday ||
                          challenge.leaderboard_frozen ||
                          entry.creator_user_id === userId
                        }
                        onClick={() => {
                          if (!userId) {
                            goLogin();
                            return;
                          }
                          void session.vote(entry.id);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-[#E6E9EE] text-white text-xs font-semibold disabled:opacity-40"
                      >
                        Vote
                      </button>
                    </div>
                  ))
                )}
              </div>

              {view.teams.length > 0 ? (
                <>
                  <h3 className="text-sm font-semibold mb-2 mt-4 flex items-center gap-2">
                    <Users className="w-4 h-4 text-[#F5F5F7]" /> Teams
                  </h3>
                  <div className="space-y-2">
                    {view.teams.map((team) => {
                      const joined = view.myTeamIds.includes(team.id);
                      return (
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
                          <button
                            type="button"
                            disabled={view.busy || joined || !userId}
                            onClick={() => {
                              if (!userId) {
                                goLogin();
                                return;
                              }
                              void session.joinTeam(team.id);
                            }}
                            className="px-3 py-1.5 rounded-lg bg-[#E6E9EE] text-white text-xs font-semibold disabled:opacity-40"
                          >
                            {joined ? "Joined" : "Join"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
