import type {
  RisingStarsChallengeDetail,
  RisingStarsEntry,
  RisingStarsLeaderboardRow,
  RisingStarsTeam,
} from "@shared/contracts";
import type { RisingStarsApiFailure } from "./risingStarsApi";
import {
  RISING_STARS_CHALLENGE_LOAD_ERROR,
  RISING_STARS_ENTRIES_LOAD_ERROR,
} from "./risingStarsApi";

export type RisingStarsVideoOption = {
  id: string;
  description: string;
};

export type RisingStarsChallengeView = {
  kind: "loading" | "ready" | "not_found" | "error";
  challengeId: string;
  challenge: RisingStarsChallengeDetail | null;
  entries: RisingStarsEntry[];
  entriesStatus: "loading" | "ready" | "error";
  entriesError: string | null;
  leaderboard: RisingStarsLeaderboardRow[];
  votedToday: boolean;
  myEntry: RisingStarsEntry | null;
  myTeamIds: string[];
  teams: RisingStarsTeam[];
  videos: RisingStarsVideoOption[];
  selectedVideoId: string;
  busy: boolean;
  error: string | null;
};

type ChallengeDeps = {
  getAccountId: () => string | null;
  loadChallenge: (challengeId: string) => Promise<
    | {
        ok: true;
        challenge: RisingStarsChallengeDetail;
        voted_today: boolean;
        my_entry: RisingStarsEntry | null;
        my_team_ids: string[];
      }
    | RisingStarsApiFailure
  >;
  loadEntries: (
    challengeId: string,
  ) => Promise<{ ok: true; entries: RisingStarsEntry[] } | RisingStarsApiFailure>;
  loadLeaderboard: (
    challengeId: string,
  ) => Promise<{ ok: true; leaderboard: RisingStarsLeaderboardRow[] } | RisingStarsApiFailure>;
  loadTeams: (seasonId: string) => Promise<{ ok: true; teams: RisingStarsTeam[] } | RisingStarsApiFailure>;
  loadVideos: (userId: string) => Promise<{ videos: RisingStarsVideoOption[]; error: string | null }>;
  enterChallenge: (
    challengeId: string,
    videoId: string,
  ) => Promise<{ ok: true; entry: RisingStarsEntry } | RisingStarsApiFailure>;
  withdrawEntry: (entryId: string) => Promise<{ ok: true } | RisingStarsApiFailure>;
  voteEntry: (
    entryId: string,
  ) => Promise<{ ok: true; entry_id: string; challenge_id: string; vote_count: number } | RisingStarsApiFailure>;
  joinTeam: (teamId: string) => Promise<{ ok: true } | RisingStarsApiFailure>;
  attachLive: (
    challengeId: string,
    input: { phase: "qualifier" | "final"; roomId: string },
  ) => Promise<{ ok: true; challenge: RisingStarsChallengeDetail } | RisingStarsApiFailure>;
  toast: (message: string) => void;
  onSessionExpired: () => void;
};

const emptyView = (challengeId = ""): RisingStarsChallengeView => ({
  kind: "loading",
  challengeId,
  challenge: null,
  entries: [],
  entriesStatus: "loading",
  entriesError: null,
  leaderboard: [],
  votedToday: false,
  myEntry: null,
  myTeamIds: [],
  teams: [],
  videos: [],
  selectedVideoId: "",
  busy: false,
  error: null,
});

function isCurrent(
  deps: ChallengeDeps,
  generation: number,
  currentGeneration: number,
  expectedAccountId: string | null,
): boolean {
  return generation === currentGeneration && deps.getAccountId() === expectedAccountId;
}

export function createRisingStarsChallengeSession(deps: ChallengeDeps) {
  let view: RisingStarsChallengeView = emptyView();
  let generation = 0;
  let accountId: string | null = null;
  let boundChallengeId = "";
  const listeners = new Set<() => void>();

  const emit = () => {
    for (const listener of listeners) listener();
  };

  const reset = (nextChallengeId: string) => {
    view = emptyView(nextChallengeId);
    emit();
  };

  const applyLoadFailure = (result: RisingStarsApiFailure, fallback: string) => {
    if (result.sessionExpired) deps.onSessionExpired();
    const notFound = result.error === "CHALLENGE_NOT_FOUND";
    view = {
      ...emptyView(view.challengeId),
      kind: notFound ? "not_found" : "error",
      error: result.error || fallback,
    };
    emit();
    deps.toast(result.error || fallback);
  };

  const applyMutationFailure = (result: RisingStarsApiFailure, fallback: string) => {
    if (result.sessionExpired) deps.onSessionExpired();
    view = { ...view, busy: false };
    emit();
    deps.toast(result.error || fallback);
  };

  const reconcile = async (
    challengeId: string,
    expectedAccountId: string | null,
    gen: number,
    showLoading: boolean,
  ) => {
    if (showLoading) {
      view = {
        ...emptyView(challengeId),
        selectedVideoId: view.challengeId === challengeId ? view.selectedVideoId : "",
      };
      emit();
    }
    const [detail, entries, leaderboard] = await Promise.all([
      deps.loadChallenge(challengeId),
      deps.loadEntries(challengeId),
      deps.loadLeaderboard(challengeId),
    ]);
    if (!isCurrent(deps, gen, generation, expectedAccountId) || boundChallengeId !== challengeId) {
      return;
    }
    if (!detail.ok) {
      applyLoadFailure(detail, RISING_STARS_CHALLENGE_LOAD_ERROR);
      return;
    }
    let entriesStatus: RisingStarsChallengeView["entriesStatus"] = "ready";
    let entriesError: string | null = null;
    let nextEntries: RisingStarsEntry[] = [];
    if (!entries.ok) {
      entriesStatus = "error";
      entriesError = entries.error || RISING_STARS_ENTRIES_LOAD_ERROR;
    } else {
      nextEntries = entries.entries;
    }
    const nextLeaderboard = leaderboard.ok ? leaderboard.leaderboard : [];
    view = {
      ...view,
      kind: "ready",
      challengeId,
      challenge: detail.challenge,
      entries: nextEntries,
      entriesStatus,
      entriesError,
      leaderboard: nextLeaderboard,
      votedToday: detail.voted_today,
      myEntry: detail.my_entry,
      myTeamIds: detail.my_team_ids,
      error: null,
      busy: false,
    };
    emit();
    if (entriesStatus === "error" && entriesError) deps.toast(entriesError);

    const teams = await deps.loadTeams(detail.challenge.season_id);
    if (!isCurrent(deps, gen, generation, expectedAccountId) || boundChallengeId !== challengeId) {
      return;
    }
    if (teams.ok) {
      view = { ...view, teams: teams.teams };
      emit();
    }

    if (expectedAccountId) {
      const videos = await deps.loadVideos(expectedAccountId);
      if (!isCurrent(deps, gen, generation, expectedAccountId) || boundChallengeId !== challengeId) {
        return;
      }
      view = { ...view, videos: videos.videos };
      emit();
    }
  };

  return {
    getSnapshot: () => view,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    bindAccount: (nextAccountId: string | null) => {
      if (nextAccountId === accountId) return;
      accountId = nextAccountId;
      generation += 1;
      reset(boundChallengeId);
    },
    bindChallenge: (challengeId: string) => {
      const id = challengeId.trim();
      if (id === boundChallengeId) return;
      boundChallengeId = id;
      generation += 1;
      reset(id);
    },
    selectVideo: (videoId: string) => {
      if (view.selectedVideoId === videoId) return;
      view = { ...view, selectedVideoId: videoId };
      emit();
    },
    load: async (challengeId: string, expectedAccountId: string | null) => {
      const id = challengeId.trim();
      if (!id) {
        view = { ...emptyView(""), kind: "not_found", error: "CHALLENGE_NOT_FOUND" };
        emit();
        return;
      }
      if (deps.getAccountId() !== expectedAccountId) return;
      boundChallengeId = id;
      accountId = expectedAccountId;
      // Bump so an older in-flight challenge GET cannot resurrect withdrawn/entry/team/live state.
      const gen = ++generation;
      await reconcile(id, expectedAccountId, gen, true);
    },
    enter: async () => {
      if (view.busy || view.kind !== "ready" || !view.challenge || view.entriesStatus !== "ready") return;
      if (view.myEntry) return;
      const videoId = view.selectedVideoId.trim();
      if (!videoId) return;
      const expectedAccountId = accountId;
      const challengeId = view.challenge.id;
      const openGen = generation;
      view = { ...view, busy: true };
      emit();
      const result = await deps.enterChallenge(challengeId, videoId);
      if (!isCurrent(deps, openGen, generation, expectedAccountId) || boundChallengeId !== challengeId) {
        return;
      }
      if (!result.ok) {
        applyMutationFailure(result, result.error || "Entry failed");
        return;
      }
      deps.toast("Entry accepted");
      const reloadGen = ++generation;
      await reconcile(challengeId, expectedAccountId, reloadGen, false);
    },
    withdraw: async () => {
      if (view.busy || view.kind !== "ready" || !view.myEntry) return;
      const expectedAccountId = accountId;
      const challengeId = view.challengeId;
      const entryId = view.myEntry.id;
      const openGen = generation;
      view = { ...view, busy: true };
      emit();
      const result = await deps.withdrawEntry(entryId);
      if (!isCurrent(deps, openGen, generation, expectedAccountId) || boundChallengeId !== challengeId) {
        return;
      }
      if (!result.ok) {
        applyMutationFailure(result, result.error || "Withdraw failed");
        return;
      }
      deps.toast("Entry withdrawn");
      const reloadGen = ++generation;
      await reconcile(challengeId, expectedAccountId, reloadGen, false);
    },
    vote: async (entryId: string) => {
      if (view.busy || view.kind !== "ready" || view.votedToday || !view.challenge) return;
      if (view.challenge.leaderboard_frozen) return;
      const expectedAccountId = accountId;
      const challengeId = view.challenge.id;
      const openGen = generation;
      view = { ...view, busy: true };
      emit();
      const result = await deps.voteEntry(entryId);
      if (!isCurrent(deps, openGen, generation, expectedAccountId) || boundChallengeId !== challengeId) {
        return;
      }
      if (!result.ok) {
        applyMutationFailure(result, result.error || "Vote failed");
        return;
      }
      view = {
        ...view,
        votedToday: true,
        busy: false,
        entries: view.entries.map((entry) =>
          entry.id === result.entry_id ? { ...entry, vote_count: result.vote_count } : entry,
        ),
        leaderboard: view.leaderboard.map((row) =>
          row.entry_id === result.entry_id ? { ...row, vote_count: result.vote_count } : row,
        ),
      };
      emit();
      deps.toast("Vote counted");
      const reloadGen = ++generation;
      await reconcile(challengeId, expectedAccountId, reloadGen, false);
    },
    joinTeam: async (teamId: string) => {
      if (view.busy || view.kind !== "ready" || !teamId) return;
      const expectedAccountId = accountId;
      const challengeId = view.challengeId;
      const openGen = generation;
      view = { ...view, busy: true };
      emit();
      const result = await deps.joinTeam(teamId);
      if (!isCurrent(deps, openGen, generation, expectedAccountId) || boundChallengeId !== challengeId) {
        return;
      }
      if (!result.ok) {
        applyMutationFailure(result, result.error || "JOIN_FAILED");
        return;
      }
      deps.toast("Joined team");
      const reloadGen = ++generation;
      await reconcile(challengeId, expectedAccountId, reloadGen, false);
    },
    attachLive: async (phase: "qualifier" | "final", roomId: string) => {
      if (view.busy || view.kind !== "ready" || !view.challenge || !roomId.trim()) return;
      const expectedAccountId = accountId;
      const challengeId = view.challenge.id;
      const openGen = generation;
      view = { ...view, busy: true };
      emit();
      const result = await deps.attachLive(challengeId, { phase, roomId: roomId.trim() });
      if (!isCurrent(deps, openGen, generation, expectedAccountId) || boundChallengeId !== challengeId) {
        return;
      }
      if (!result.ok) {
        applyMutationFailure(result, result.error || "Attach failed");
        return;
      }
      view = { ...view, challenge: result.challenge, busy: false };
      emit();
      deps.toast("Live attached");
      const reloadGen = ++generation;
      await reconcile(challengeId, expectedAccountId, reloadGen, false);
    },
  };
}

export type RisingStarsChallengeSession = ReturnType<typeof createRisingStarsChallengeSession>;
