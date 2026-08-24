import { describe, expect, it, vi } from "vitest";
import type {
  RisingStarsCategory,
  RisingStarsChallenge,
  RisingStarsRegion,
  RisingStarsSeason,
  RisingStarsStanding,
  RisingStarsTeam,
} from "@shared/contracts";
import { RISING_STARS_LOAD_ERROR } from "./risingStarsApi";
import { createRisingStarsSession } from "./risingStarsSession";

const userA = "11111111-1111-4111-8111-111111111111";
const userB = "22222222-2222-4222-8222-222222222222";
const seasonId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const categoryA = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const categoryB = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const regionA = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const challengeA = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const challengeB = "ffffffff-ffff-4fff-8fff-ffffffffffff";

const season = (status: RisingStarsSeason["status"] = "active"): RisingStarsSeason => ({
  id: seasonId,
  slug: "season-test",
  title: "Rising Stars Season",
  description: null,
  starts_at: "2026-08-01T00:00:00.000Z",
  ends_at: "2026-10-01T00:00:00.000Z",
  status,
  created_by: null,
  created_at: "2026-08-01T00:00:00.000Z",
});

const category = (id: string, title: string): RisingStarsCategory => ({
  id,
  season_id: seasonId,
  slug: title.toLowerCase(),
  title,
  sort_order: 0,
  is_active: true,
});

const region = (id: string, title: string): RisingStarsRegion => ({
  id,
  season_id: seasonId,
  slug: title.toLowerCase(),
  title,
  country_codes: ["GB"],
  sort_order: 0,
  is_active: true,
});

const challenge = (id: string, title: string, categoryId = categoryA): RisingStarsChallenge => ({
  id,
  season_id: seasonId,
  category_id: categoryId,
  region_id: regionA,
  week_index: 1,
  title,
  description: null,
  sound_track_id: "track-1",
  opens_at: "2026-08-01T00:00:00.000Z",
  closes_at: "2026-08-08T00:00:00.000Z",
  status: "open",
  leaderboard_frozen: false,
});

const standing = (): RisingStarsStanding => ({
  rank: 1,
  creator_user_id: userA,
  username: "creator",
  avatar_url: null,
  total_votes: 4,
  entries: 1,
});

const team = (): RisingStarsTeam => ({
  id: "99999999-9999-4999-8999-999999999999",
  season_id: seasonId,
  region_id: regionA,
  name: "North Crew",
  slug: "north-crew",
  captain_user_id: userA,
  team_votes: 4,
  member_count: 2,
});

function createDeps(account: { id: string | null }) {
  const loadCurrentSeason = vi.fn(
    async (): Promise<{ ok: true; season: RisingStarsSeason | null } | { ok: false; error: string; sessionExpired: boolean }> => ({
      ok: true,
      season: season(),
    }),
  );
  const loadCategories = vi.fn(async () => ({
    ok: true as const,
    categories: [category(categoryA, "Dance"), category(categoryB, "Rap")],
  }));
  const loadRegions = vi.fn(async () => ({ ok: true as const, regions: [region(regionA, "UK")] }));
  const loadStandings = vi.fn(async () => ({ ok: true as const, standings: [standing()] }));
  const loadTeams = vi.fn(async () => ({ ok: true as const, teams: [team()] }));
  const loadChallenges = vi.fn(async (input: { categoryId?: string }) => ({
    ok: true as const,
    challenges: [
      challenge(input.categoryId === categoryB ? challengeB : challengeA, input.categoryId === categoryB ? "Rap week" : "Dance week", input.categoryId || categoryA),
    ],
  }));
  const toast = vi.fn();
  const onSessionExpired = vi.fn();
  return {
    deps: {
      getAccountId: () => account.id,
      loadCurrentSeason,
      loadCategories,
      loadRegions,
      loadStandings,
      loadTeams,
      loadChallenges,
      toast,
      onSessionExpired,
    },
    loadCurrentSeason,
    loadCategories,
    loadChallenges,
    toast,
    onSessionExpired,
  };
}

describe("PAGE-055 Rising Stars session", () => {
  it("stays loading until the current season response arrives", async () => {
    const account = { id: userA };
    const held = new Promise<{ ok: true; season: RisingStarsSeason | null }>(() => undefined);
    const { deps, loadCurrentSeason } = createDeps(account);
    loadCurrentSeason.mockReturnValueOnce(held);
    const session = createRisingStarsSession(deps);
    session.bindAccount(userA);
    const pending = session.load(userA);
    expect(session.getSnapshot().kind).toBe("loading");
    expect(session.getSnapshot().hub).toBeNull();
    expect(session.getSnapshot().challenges).toEqual([]);
    expect(session.getSnapshot().error).toBeNull();
    void pending;
  });

  it("uses the empty-season copy only after the server returns no active season", async () => {
    const account = { id: userA };
    const { deps, loadCurrentSeason, loadChallenges } = createDeps(account);
    loadCurrentSeason.mockResolvedValueOnce({ ok: true, season: null });
    const session = createRisingStarsSession(deps);
    session.bindAccount(userA);
    await session.load(userA);
    expect(session.getSnapshot().kind).toBe("empty");
    expect(session.getSnapshot().hub).toBeNull();
    expect(session.getSnapshot().challenges).toEqual([]);
    expect(loadChallenges).not.toHaveBeenCalled();
  });

  it("does not treat a failed hub load as an empty season", async () => {
    const account = { id: userA };
    const { deps, loadCurrentSeason, toast } = createDeps(account);
    loadCurrentSeason.mockResolvedValueOnce({
      ok: false,
      error: RISING_STARS_LOAD_ERROR,
      sessionExpired: false,
    });
    const session = createRisingStarsSession(deps);
    session.bindAccount(userA);
    await session.load(userA);
    expect(session.getSnapshot().kind).toBe("error");
    expect(session.getSnapshot().error).toBe(RISING_STARS_LOAD_ERROR);
    expect(session.getSnapshot().hub).toBeNull();
    expect(toast).toHaveBeenCalledWith(RISING_STARS_LOAD_ERROR);
  });

  it("drops a late User A hub response after User B binds", async () => {
    const account = { id: userA as string | null };
    let releaseA: ((value: { ok: true; season: RisingStarsSeason | null }) => void) | undefined;
    const heldA = new Promise<{ ok: true; season: RisingStarsSeason | null }>((resolve) => {
      releaseA = resolve;
    });
    const { deps, loadCurrentSeason } = createDeps(account);
    loadCurrentSeason.mockReturnValueOnce(heldA);
    const session = createRisingStarsSession(deps);
    session.bindAccount(userA);
    const loadA = session.load(userA);
    account.id = userB;
    session.bindAccount(userB);
    expect(session.getSnapshot().kind).toBe("loading");
    releaseA?.({ ok: true, season: season() });
    await loadA;
    expect(session.getSnapshot().kind).toBe("loading");
    expect(session.getSnapshot().hub).toBeNull();
    await session.load(userB);
    expect(session.getSnapshot().kind).toBe("ready");
    expect(session.getSnapshot().hub?.season.id).toBe(seasonId);
  });

  it("drops a late Category A challenge list after Category B is selected", async () => {
    const account = { id: userA };
    let releaseA: ((value: { ok: true; challenges: RisingStarsChallenge[] }) => void) | undefined;
    const heldA = new Promise<{ ok: true; challenges: RisingStarsChallenge[] }>((resolve) => {
      releaseA = resolve;
    });
    const { deps, loadChallenges } = createDeps(account);
    const session = createRisingStarsSession(deps);
    session.bindAccount(userA);
    await session.load(userA);
    expect(session.getSnapshot().challenges[0]?.id).toBe(challengeA);
    loadChallenges.mockReturnValueOnce(heldA);
    loadChallenges.mockResolvedValueOnce({
      ok: true,
      challenges: [challenge(challengeB, "Rap week", categoryB)],
    });
    session.setCategoryId(categoryA);
    session.setCategoryId(categoryB);
    releaseA?.({ ok: true, challenges: [challenge(challengeA, "Late dance", categoryA)] });
    await Promise.resolve();
    await Promise.resolve();
    expect(session.getSnapshot().categoryId).toBe(categoryB);
    expect(session.getSnapshot().challenges.every((row) => row.id !== challengeA)).toBe(true);
    await vi.waitFor(() => {
      expect(session.getSnapshot().challenges[0]?.id).toBe(challengeB);
    });
    expect(session.getSnapshot().challengesLoading).toBe(false);
  });

  it("keeps rank and votes as server fields", async () => {
    const account = { id: userA };
    const { deps } = createDeps(account);
    const session = createRisingStarsSession(deps);
    session.bindAccount(userA);
    await session.load(userA);
    expect(session.getSnapshot().hub?.standings[0]).toMatchObject({
      rank: 1,
      creator_user_id: userA,
      total_votes: 4,
    });
    expect(session.getSnapshot().hub?.teams[0]).toMatchObject({
      id: "99999999-9999-4999-8999-999999999999",
      member_count: 2,
      team_votes: 4,
    });
  });
});
