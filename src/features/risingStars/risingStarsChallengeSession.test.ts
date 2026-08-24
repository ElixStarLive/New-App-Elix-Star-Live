import { describe, expect, it, vi } from "vitest";
import type {
  RisingStarsChallengeDetail,
  RisingStarsEntry,
  RisingStarsTeam,
} from "@shared/contracts";
import { RISING_STARS_ENTRIES_LOAD_ERROR } from "./risingStarsApi";
import { createRisingStarsChallengeSession } from "./risingStarsChallengeSession";

const userA = "11111111-1111-4111-8111-111111111111";
const userB = "22222222-2222-4222-8222-222222222222";
const challengeA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const challengeB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const entryA = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const teamA = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const seasonId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const categoryId = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const videoA = "99999999-9999-4999-8999-999999999999";

const detail = (id: string, title: string): RisingStarsChallengeDetail => ({
  id,
  season_id: seasonId,
  category_id: categoryId,
  region_id: null,
  week_index: 1,
  title,
  description: "Use the sound",
  sound_track_id: "track-1",
  sound_meta: { title: "Night Drive" },
  opens_at: "2026-08-01T00:00:00.000Z",
  closes_at: "2026-08-08T00:00:00.000Z",
  status: "open",
  leaderboard_frozen: false,
  live_qualifier_room_id: null,
  live_final_room_id: null,
});

const entry = (id: string, creator: string, votes = 0): RisingStarsEntry => ({
  id,
  challenge_id: challengeA,
  creator_user_id: creator,
  video_id: videoA,
  team_id: null,
  status: "active",
  vote_count: votes,
  created_at: "2026-08-01T00:00:00.000Z",
  username: creator === userA ? "alpha" : "beta",
  avatar_url: null,
});

const team = (): RisingStarsTeam => ({
  id: teamA,
  season_id: seasonId,
  region_id: null,
  name: "North Crew",
  slug: "north-crew",
  captain_user_id: userB,
  team_votes: 0,
  member_count: 1,
});

function createDeps(account: { id: string | null }) {
  const loadChallenge = vi.fn(
    async (
      id: string,
    ): Promise<
      | {
          ok: true;
          challenge: RisingStarsChallengeDetail;
          voted_today: boolean;
          my_entry: RisingStarsEntry | null;
          my_team_ids: string[];
        }
      | { ok: false; error: string; sessionExpired: boolean }
    > => ({
      ok: true,
      challenge: detail(id, id === challengeB ? "Week B" : "Week A"),
      voted_today: false,
      my_entry: null,
      my_team_ids: [],
    }),
  );
  const loadEntries = vi.fn(
    async (): Promise<
      { ok: true; entries: RisingStarsEntry[] } | { ok: false; error: string; sessionExpired: boolean }
    > => ({ ok: true, entries: [] }),
  );
  const loadLeaderboard = vi.fn(async () => ({
    ok: true as const,
    leaderboard: [],
  }));
  const loadTeams = vi.fn(async () => ({ ok: true as const, teams: [team()] }));
  const loadVideos = vi.fn(async () => ({
    videos: [{ id: videoA, description: "My clip" }],
    error: null,
  }));
  const enterChallenge = vi.fn(
    async (): Promise<
      { ok: true; entry: RisingStarsEntry } | { ok: false; error: string; sessionExpired: boolean }
    > => ({ ok: true, entry: entry(entryA, userA) }),
  );
  const withdrawEntry = vi.fn(
    async (): Promise<{ ok: true } | { ok: false; error: string; sessionExpired: boolean }> => ({
      ok: true,
    }),
  );
  const voteEntry = vi.fn(async () => ({
    ok: true as const,
    entry_id: entryA,
    challenge_id: challengeA,
    vote_count: 1,
  }));
  const joinTeam = vi.fn(async () => ({ ok: true as const }));
  const attachLive = vi.fn(async () => ({ ok: true as const, challenge: detail(challengeA, "Week A") }));
  const toast = vi.fn();
  const onSessionExpired = vi.fn();
  return {
    deps: {
      getAccountId: () => account.id,
      loadChallenge,
      loadEntries,
      loadLeaderboard,
      loadTeams,
      loadVideos,
      enterChallenge,
      withdrawEntry,
      voteEntry,
      joinTeam,
      attachLive,
      toast,
      onSessionExpired,
    },
    loadChallenge,
    loadEntries,
    enterChallenge,
    withdrawEntry,
    toast,
    onSessionExpired,
  };
}

describe("PAGE-056 Rising Stars challenge session", () => {
  it("stays loading and does not expose Join while the challenge is in flight", async () => {
    const account = { id: userA };
    const held = new Promise<never>(() => undefined);
    const { deps, loadChallenge } = createDeps(account);
    loadChallenge.mockReturnValueOnce(held);
    const session = createRisingStarsChallengeSession(deps);
    session.bindAccount(userA);
    session.bindChallenge(challengeA);
    void session.load(challengeA, userA);
    expect(session.getSnapshot().kind).toBe("loading");
    expect(session.getSnapshot().challenge).toBeNull();
    expect(session.getSnapshot().myEntry).toBeNull();
    expect(session.getSnapshot().entriesStatus).toBe("loading");
  });

  it("does not treat an entries failure as an empty leaderboard", async () => {
    const account = { id: userA };
    const { deps, loadEntries, toast } = createDeps(account);
    loadEntries.mockResolvedValueOnce({
      ok: false,
      error: RISING_STARS_ENTRIES_LOAD_ERROR,
      sessionExpired: false,
    });
    const session = createRisingStarsChallengeSession(deps);
    session.bindAccount(userA);
    session.bindChallenge(challengeA);
    await session.load(challengeA, userA);
    expect(session.getSnapshot().kind).toBe("ready");
    expect(session.getSnapshot().entriesStatus).toBe("error");
    expect(session.getSnapshot().entries).toEqual([]);
    expect(session.getSnapshot().entriesError).toBe(RISING_STARS_ENTRIES_LOAD_ERROR);
    expect(toast).toHaveBeenCalledWith(RISING_STARS_ENTRIES_LOAD_ERROR);
  });

  it("shows not-found for an unknown challenge and does not invent a fallback", async () => {
    const account = { id: userA };
    const { deps, loadChallenge } = createDeps(account);
    loadChallenge.mockResolvedValueOnce({
      ok: false,
      error: "CHALLENGE_NOT_FOUND",
      sessionExpired: false,
    });
    const session = createRisingStarsChallengeSession(deps);
    session.bindAccount(userA);
    session.bindChallenge(challengeA);
    await session.load(challengeA, userA);
    expect(session.getSnapshot().kind).toBe("not_found");
    expect(session.getSnapshot().challenge).toBeNull();
    expect(session.getSnapshot().error).toBe("CHALLENGE_NOT_FOUND");
  });

  it("drops a late User A challenge after User B binds", async () => {
    const account = { id: userA as string | null };
    let releaseA: ((value: {
      ok: true;
      challenge: RisingStarsChallengeDetail;
      voted_today: boolean;
      my_entry: RisingStarsEntry | null;
      my_team_ids: string[];
    }) => void) | undefined;
    const heldA = new Promise<{
      ok: true;
      challenge: RisingStarsChallengeDetail;
      voted_today: boolean;
      my_entry: RisingStarsEntry | null;
      my_team_ids: string[];
    }>((resolve) => {
      releaseA = resolve;
    });
    const { deps, loadChallenge } = createDeps(account);
    loadChallenge.mockReturnValueOnce(heldA);
    const session = createRisingStarsChallengeSession(deps);
    session.bindAccount(userA);
    session.bindChallenge(challengeA);
    const loadA = session.load(challengeA, userA);
    account.id = userB;
    session.bindAccount(userB);
    expect(session.getSnapshot().kind).toBe("loading");
    releaseA?.({
      ok: true,
      challenge: detail(challengeA, "Week A"),
      voted_today: true,
      my_entry: entry(entryA, userA, 9),
      my_team_ids: [teamA],
    });
    await loadA;
    expect(session.getSnapshot().kind).toBe("loading");
    expect(session.getSnapshot().myEntry).toBeNull();
    expect(session.getSnapshot().votedToday).toBe(false);
    await session.load(challengeA, userB);
    expect(session.getSnapshot().kind).toBe("ready");
    expect(session.getSnapshot().myEntry).toBeNull();
  });

  it("drops a late Challenge A response after Challenge B is opened", async () => {
    const account = { id: userA };
    let releaseA: ((value: {
      ok: true;
      challenge: RisingStarsChallengeDetail;
      voted_today: boolean;
      my_entry: RisingStarsEntry | null;
      my_team_ids: string[];
    }) => void) | undefined;
    const heldA = new Promise<{
      ok: true;
      challenge: RisingStarsChallengeDetail;
      voted_today: boolean;
      my_entry: RisingStarsEntry | null;
      my_team_ids: string[];
    }>((resolve) => {
      releaseA = resolve;
    });
    const { deps, loadChallenge } = createDeps(account);
    loadChallenge.mockReturnValueOnce(heldA);
    const session = createRisingStarsChallengeSession(deps);
    session.bindAccount(userA);
    session.bindChallenge(challengeA);
    const loadA = session.load(challengeA, userA);
    session.bindChallenge(challengeB);
    await session.load(challengeB, userA);
    expect(session.getSnapshot().challenge?.id).toBe(challengeB);
    releaseA?.({
      ok: true,
      challenge: detail(challengeA, "Week A"),
      voted_today: false,
      my_entry: null,
      my_team_ids: [],
    });
    await loadA;
    expect(session.getSnapshot().challenge?.id).toBe(challengeB);
    expect(session.getSnapshot().challenge?.title).toBe("Week B");
  });

  it("reconciles a real entry without treating a rejected enter as joined", async () => {
    const account = { id: userA };
    const { deps, enterChallenge, loadChallenge, toast } = createDeps(account);
    const session = createRisingStarsChallengeSession(deps);
    session.bindAccount(userA);
    session.bindChallenge(challengeA);
    await session.load(challengeA, userA);
    session.selectVideo(videoA);
    enterChallenge.mockResolvedValueOnce({
      ok: false,
      error: "CHALLENGE_CLOSED",
      sessionExpired: false,
    });
    await session.enter();
    expect(session.getSnapshot().myEntry).toBeNull();
    expect(toast).toHaveBeenCalledWith("CHALLENGE_CLOSED");
    enterChallenge.mockResolvedValueOnce({ ok: true, entry: entry(entryA, userA) });
    loadChallenge.mockResolvedValueOnce({
      ok: true,
      challenge: detail(challengeA, "Week A"),
      voted_today: false,
      my_entry: entry(entryA, userA),
      my_team_ids: [],
    });
    await session.enter();
    expect(session.getSnapshot().myEntry?.id).toBe(entryA);
    expect(toast).toHaveBeenCalledWith("Entry accepted");
  });

  it("keeps withdrawn state server-owned after a rejected withdraw", async () => {
    const account = { id: userA };
    const { deps, loadChallenge, withdrawEntry, toast } = createDeps(account);
    loadChallenge.mockResolvedValue({
      ok: true,
      challenge: detail(challengeA, "Week A"),
      voted_today: false,
      my_entry: entry(entryA, userA),
      my_team_ids: [],
    });
    const session = createRisingStarsChallengeSession(deps);
    session.bindAccount(userA);
    session.bindChallenge(challengeA);
    await session.load(challengeA, userA);
    withdrawEntry.mockResolvedValueOnce({
      ok: false,
      error: "WITHDRAW_DENIED",
      sessionExpired: false,
    });
    await session.withdraw();
    expect(session.getSnapshot().myEntry?.id).toBe(entryA);
    expect(toast).toHaveBeenCalledWith("WITHDRAW_DENIED");
  });

  it("does not invent an official rank and uses the server vote_count after a vote", async () => {
    const account = { id: userA };
    const other = entry(entryA, userB, 2);
    const { deps, loadEntries, loadChallenge } = createDeps(account);
    loadEntries.mockResolvedValue({ ok: true, entries: [other] });
    const session = createRisingStarsChallengeSession(deps);
    session.bindAccount(userA);
    session.bindChallenge(challengeA);
    await session.load(challengeA, userA);
    expect(session.getSnapshot().entries[0]?.vote_count).toBe(2);
    loadChallenge.mockResolvedValueOnce({
      ok: true,
      challenge: detail(challengeA, "Week A"),
      voted_today: true,
      my_entry: null,
      my_team_ids: [],
    });
    loadEntries.mockResolvedValueOnce({ ok: true, entries: [{ ...other, vote_count: 3 }] });
    await session.vote(entryA);
    expect(session.getSnapshot().votedToday).toBe(true);
    expect(session.getSnapshot().entries[0]?.vote_count).toBe(3);
  });
});
