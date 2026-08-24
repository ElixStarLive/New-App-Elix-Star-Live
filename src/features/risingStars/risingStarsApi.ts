import {
  risingStarsAttachLiveResponseSchema,
  risingStarsBadgesResponseSchema,
  risingStarsCategoriesResponseSchema,
  risingStarsChallengeDetailResponseSchema,
  risingStarsChallengeLiveResponseSchema,
  risingStarsChallengesResponseSchema,
  risingStarsCreateTeamResponseSchema,
  risingStarsCurrentSeasonResponseSchema,
  risingStarsEnterResponseSchema,
  risingStarsEntriesResponseSchema,
  risingStarsJoinTeamResponseSchema,
  risingStarsLeaderboardResponseSchema,
  risingStarsRegionsResponseSchema,
  risingStarsRewardsResponseSchema,
  risingStarsSeasonResponseSchema,
  risingStarsStandingsResponseSchema,
  risingStarsTeamsResponseSchema,
  risingStarsVoteResponseSchema,
  risingStarsWithdrawResponseSchema,
  type RisingStarsBadge,
  type RisingStarsCategory,
  type RisingStarsChallenge,
  type RisingStarsChallengeDetail,
  type RisingStarsChallengeLive,
  type RisingStarsEntry,
  type RisingStarsLeaderboardRow,
  type RisingStarsRegion,
  type RisingStarsReward,
  type RisingStarsSeason,
  type RisingStarsStanding,
  type RisingStarsTeam,
} from "@shared/contracts";
import { apiRequest } from "@/lib/apiClient";

export type RisingStarsApiFailure = {
  ok: false;
  error: string;
  sessionExpired: boolean;
};

export const RISING_STARS_LOAD_ERROR = "Could not load Rising Stars";
export const RISING_STARS_CHALLENGE_LOAD_ERROR = "Could not load challenge";
export const RISING_STARS_ENTRIES_LOAD_ERROR = "Could not load entries";

export function isRisingStarsSessionFailure(status: number, code?: string): boolean {
  return status === 401 && (code === "unauthenticated" || code === "session_expired");
}

function failure(
  error: { message?: string; status: number; code?: string },
  fallback: string,
): RisingStarsApiFailure {
  return {
    ok: false,
    error: error.message || fallback,
    sessionExpired: isRisingStarsSessionFailure(error.status, error.code),
  };
}

export async function apiRisingStarsCurrentSeason(): Promise<
  { ok: true; season: RisingStarsSeason | null } | RisingStarsApiFailure
> {
  const { data, error } = await apiRequest<unknown>("/api/rising-stars/seasons/current");
  if (error) return failure(error, RISING_STARS_LOAD_ERROR);
  const parsed = risingStarsCurrentSeasonResponseSchema.safeParse(data);
  if (!parsed.success) return { ok: false, error: RISING_STARS_LOAD_ERROR, sessionExpired: false };
  return { ok: true, season: parsed.data.season };
}

export async function apiRisingStarsSeason(
  seasonId: string,
): Promise<{ ok: true; season: RisingStarsSeason } | RisingStarsApiFailure> {
  const { data, error } = await apiRequest<unknown>(
    `/api/rising-stars/seasons/${encodeURIComponent(seasonId)}`,
  );
  if (error) return failure(error, RISING_STARS_LOAD_ERROR);
  const parsed = risingStarsSeasonResponseSchema.safeParse(data);
  if (!parsed.success) return { ok: false, error: RISING_STARS_LOAD_ERROR, sessionExpired: false };
  return { ok: true, season: parsed.data.season };
}

export async function apiRisingStarsCategories(
  seasonId: string,
): Promise<{ ok: true; categories: RisingStarsCategory[] } | RisingStarsApiFailure> {
  const { data, error } = await apiRequest<unknown>(
    `/api/rising-stars/categories?seasonId=${encodeURIComponent(seasonId)}`,
  );
  if (error) return failure(error, RISING_STARS_LOAD_ERROR);
  const parsed = risingStarsCategoriesResponseSchema.safeParse(data);
  if (!parsed.success) return { ok: false, error: RISING_STARS_LOAD_ERROR, sessionExpired: false };
  return { ok: true, categories: parsed.data.categories };
}

export async function apiRisingStarsRegions(
  seasonId: string,
): Promise<{ ok: true; regions: RisingStarsRegion[] } | RisingStarsApiFailure> {
  const { data, error } = await apiRequest<unknown>(
    `/api/rising-stars/regions?seasonId=${encodeURIComponent(seasonId)}`,
  );
  if (error) return failure(error, RISING_STARS_LOAD_ERROR);
  const parsed = risingStarsRegionsResponseSchema.safeParse(data);
  if (!parsed.success) return { ok: false, error: RISING_STARS_LOAD_ERROR, sessionExpired: false };
  return { ok: true, regions: parsed.data.regions };
}

export async function apiRisingStarsStandings(
  seasonId: string,
): Promise<{ ok: true; standings: RisingStarsStanding[] } | RisingStarsApiFailure> {
  const { data, error } = await apiRequest<unknown>(
    `/api/rising-stars/seasons/${encodeURIComponent(seasonId)}/standings`,
  );
  if (error) return failure(error, RISING_STARS_LOAD_ERROR);
  const parsed = risingStarsStandingsResponseSchema.safeParse(data);
  if (!parsed.success) return { ok: false, error: RISING_STARS_LOAD_ERROR, sessionExpired: false };
  return { ok: true, standings: parsed.data.standings };
}

export async function apiRisingStarsTeams(
  seasonId: string,
): Promise<{ ok: true; teams: RisingStarsTeam[] } | RisingStarsApiFailure> {
  const { data, error } = await apiRequest<unknown>(
    `/api/rising-stars/teams?seasonId=${encodeURIComponent(seasonId)}`,
  );
  if (error) return failure(error, RISING_STARS_LOAD_ERROR);
  const parsed = risingStarsTeamsResponseSchema.safeParse(data);
  if (!parsed.success) return { ok: false, error: RISING_STARS_LOAD_ERROR, sessionExpired: false };
  return { ok: true, teams: parsed.data.teams };
}

export async function apiRisingStarsChallenges(input: {
  seasonId: string;
  categoryId?: string;
  regionId?: string;
}): Promise<{ ok: true; challenges: RisingStarsChallenge[] } | RisingStarsApiFailure> {
  const params = new URLSearchParams({ seasonId: input.seasonId });
  if (input.categoryId) params.set("categoryId", input.categoryId);
  if (input.regionId) params.set("regionId", input.regionId);
  const { data, error } = await apiRequest<unknown>(`/api/rising-stars/challenges?${params.toString()}`);
  if (error) return failure(error, RISING_STARS_LOAD_ERROR);
  const parsed = risingStarsChallengesResponseSchema.safeParse(data);
  if (!parsed.success) return { ok: false, error: RISING_STARS_LOAD_ERROR, sessionExpired: false };
  return { ok: true, challenges: parsed.data.challenges };
}

export async function apiRisingStarsRewards(
  seasonId: string,
): Promise<{ ok: true; rewards: RisingStarsReward[] } | RisingStarsApiFailure> {
  const { data, error } = await apiRequest<unknown>(
    `/api/rising-stars/rewards?seasonId=${encodeURIComponent(seasonId)}`,
  );
  if (error) return failure(error, RISING_STARS_LOAD_ERROR);
  const parsed = risingStarsRewardsResponseSchema.safeParse(data);
  if (!parsed.success) return { ok: false, error: RISING_STARS_LOAD_ERROR, sessionExpired: false };
  return { ok: true, rewards: parsed.data.rewards };
}

export async function apiRisingStarsMyBadges(): Promise<
  { ok: true; badges: RisingStarsBadge[] } | RisingStarsApiFailure
> {
  const { data, error } = await apiRequest<unknown>("/api/rising-stars/badges/me");
  if (error) return failure(error, RISING_STARS_LOAD_ERROR);
  const parsed = risingStarsBadgesResponseSchema.safeParse(data);
  if (!parsed.success) return { ok: false, error: RISING_STARS_LOAD_ERROR, sessionExpired: false };
  return { ok: true, badges: parsed.data.badges };
}

export async function apiRisingStarsChallenge(
  challengeId: string,
): Promise<
  | {
      ok: true;
      challenge: RisingStarsChallengeDetail;
      voted_today: boolean;
      my_entry: RisingStarsEntry | null;
      my_team_ids: string[];
    }
  | RisingStarsApiFailure
> {
  const { data, error } = await apiRequest<unknown>(
    `/api/rising-stars/challenges/${encodeURIComponent(challengeId)}`,
  );
  if (error) {
    if (error.status === 404) return failure({ ...error, message: "CHALLENGE_NOT_FOUND" }, "CHALLENGE_NOT_FOUND");
    return failure(error, RISING_STARS_CHALLENGE_LOAD_ERROR);
  }
  const parsed = risingStarsChallengeDetailResponseSchema.safeParse(data);
  if (!parsed.success) return { ok: false, error: RISING_STARS_CHALLENGE_LOAD_ERROR, sessionExpired: false };
  return {
    ok: true,
    challenge: parsed.data.challenge,
    voted_today: parsed.data.voted_today,
    my_entry: parsed.data.my_entry,
    my_team_ids: parsed.data.my_team_ids,
  };
}

export async function apiRisingStarsChallengeEntries(
  challengeId: string,
): Promise<{ ok: true; entries: RisingStarsEntry[] } | RisingStarsApiFailure> {
  const { data, error } = await apiRequest<unknown>(
    `/api/rising-stars/challenges/${encodeURIComponent(challengeId)}/entries`,
  );
  if (error) return failure(error, RISING_STARS_ENTRIES_LOAD_ERROR);
  const parsed = risingStarsEntriesResponseSchema.safeParse(data);
  if (!parsed.success) return { ok: false, error: RISING_STARS_ENTRIES_LOAD_ERROR, sessionExpired: false };
  return { ok: true, entries: parsed.data.entries };
}

export async function apiRisingStarsChallengeLeaderboard(
  challengeId: string,
): Promise<{ ok: true; leaderboard: RisingStarsLeaderboardRow[] } | RisingStarsApiFailure> {
  const { data, error } = await apiRequest<unknown>(
    `/api/rising-stars/challenges/${encodeURIComponent(challengeId)}/leaderboard`,
  );
  if (error) return failure(error, RISING_STARS_ENTRIES_LOAD_ERROR);
  const parsed = risingStarsLeaderboardResponseSchema.safeParse(data);
  if (!parsed.success) return { ok: false, error: RISING_STARS_ENTRIES_LOAD_ERROR, sessionExpired: false };
  return { ok: true, leaderboard: parsed.data.leaderboard };
}

export async function apiRisingStarsChallengeLive(
  challengeId: string,
): Promise<{ ok: true; live: RisingStarsChallengeLive } | RisingStarsApiFailure> {
  const { data, error } = await apiRequest<unknown>(
    `/api/rising-stars/challenges/${encodeURIComponent(challengeId)}/live`,
  );
  if (error) return failure(error, RISING_STARS_CHALLENGE_LOAD_ERROR);
  const parsed = risingStarsChallengeLiveResponseSchema.safeParse(data);
  if (!parsed.success) return { ok: false, error: RISING_STARS_CHALLENGE_LOAD_ERROR, sessionExpired: false };
  return { ok: true, live: parsed.data.live };
}

export async function apiRisingStarsEnterChallenge(
  challengeId: string,
  videoId: string,
  teamId?: string | null,
): Promise<{ ok: true; entry: RisingStarsEntry } | RisingStarsApiFailure> {
  const { data, error } = await apiRequest<unknown>(
    `/api/rising-stars/challenges/${encodeURIComponent(challengeId)}/enter`,
    {
      method: "POST",
      body: JSON.stringify(teamId ? { videoId, teamId } : { videoId }),
    },
  );
  if (error) return failure(error, error.message || "Entry failed");
  const parsed = risingStarsEnterResponseSchema.safeParse(data);
  if (!parsed.success) return { ok: false, error: "Entry failed", sessionExpired: false };
  return { ok: true, entry: parsed.data.entry };
}

export async function apiRisingStarsWithdrawEntry(
  entryId: string,
): Promise<{ ok: true } | RisingStarsApiFailure> {
  const { data, error } = await apiRequest<unknown>(
    `/api/rising-stars/entries/${encodeURIComponent(entryId)}`,
    { method: "DELETE" },
  );
  if (error) return failure(error, error.message || "Withdraw failed");
  const parsed = risingStarsWithdrawResponseSchema.safeParse(data);
  if (!parsed.success) return { ok: false, error: "Withdraw failed", sessionExpired: false };
  return { ok: true };
}

export async function apiRisingStarsVoteEntry(
  entryId: string,
): Promise<{ ok: true; entry_id: string; challenge_id: string; vote_count: number } | RisingStarsApiFailure> {
  const { data, error } = await apiRequest<unknown>(
    `/api/rising-stars/entries/${encodeURIComponent(entryId)}/vote`,
    { method: "POST", body: "{}" },
  );
  if (error) return failure(error, error.message || "Vote failed");
  const parsed = risingStarsVoteResponseSchema.safeParse(data);
  if (!parsed.success) return { ok: false, error: "Vote failed", sessionExpired: false };
  return parsed.data;
}

export async function apiRisingStarsCreateTeam(input: {
  seasonId: string;
  regionId?: string | null;
  name: string;
  slug: string;
}): Promise<{ ok: true; team: RisingStarsTeam } | RisingStarsApiFailure> {
  const { data, error } = await apiRequest<unknown>("/api/rising-stars/teams", {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (error) return failure(error, error.message || "TEAM_CREATE_FAILED");
  const parsed = risingStarsCreateTeamResponseSchema.safeParse(data);
  if (!parsed.success) return { ok: false, error: "TEAM_CREATE_FAILED", sessionExpired: false };
  return { ok: true, team: parsed.data.team };
}

export async function apiRisingStarsJoinTeam(
  teamId: string,
): Promise<{ ok: true } | RisingStarsApiFailure> {
  const { data, error } = await apiRequest<unknown>(
    `/api/rising-stars/teams/${encodeURIComponent(teamId)}/join`,
    { method: "POST", body: "{}" },
  );
  if (error) return failure(error, error.message || "JOIN_FAILED");
  const parsed = risingStarsJoinTeamResponseSchema.safeParse(data);
  if (!parsed.success) return { ok: false, error: "JOIN_FAILED", sessionExpired: false };
  return { ok: true };
}

export async function apiRisingStarsAttachLive(
  challengeId: string,
  input: { phase: "qualifier" | "final"; roomId: string },
): Promise<{ ok: true; challenge: RisingStarsChallengeDetail } | RisingStarsApiFailure> {
  const { data, error } = await apiRequest<unknown>(
    `/api/rising-stars/challenges/${encodeURIComponent(challengeId)}/live/attach`,
    { method: "POST", body: JSON.stringify(input) },
  );
  if (error) return failure(error, error.message || "Attach failed");
  const parsed = risingStarsAttachLiveResponseSchema.safeParse(data);
  if (!parsed.success) return { ok: false, error: "Attach failed", sessionExpired: false };
  return { ok: true, challenge: parsed.data.challenge };
}
