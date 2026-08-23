import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { namedHardwareBackTarget } from "@/lib/settingsNav";
import type { RisingStarsChallengeDetail, RisingStarsEntry } from "@shared/contracts";
import RisingStarsChallenge from "./RisingStarsChallenge";

const api = vi.hoisted(() => ({
  apiRisingStarsChallenge: vi.fn(),
  apiRisingStarsChallengeEntries: vi.fn(),
  apiRisingStarsChallengeLeaderboard: vi.fn(),
  apiRisingStarsTeams: vi.fn(),
  apiRisingStarsEnterChallenge: vi.fn(),
  apiRisingStarsWithdrawEntry: vi.fn(),
  apiRisingStarsVoteEntry: vi.fn(),
  apiRisingStarsJoinTeam: vi.fn(),
  apiRisingStarsAttachLive: vi.fn(),
}));
const feed = vi.hoisted(() => ({
  apiFetchUserVideos: vi.fn(),
}));
const toast = vi.hoisted(() => vi.fn());
const checkUser = vi.hoisted(() => vi.fn(async () => undefined));
const share = vi.hoisted(() => vi.fn(async () => true));
const auth = vi.hoisted(() => ({
  user: { id: "11111111-1111-4111-8111-111111111111" } as { id: string } | null,
  checkUser: () => checkUser(),
}));

vi.mock("@/features/risingStars/risingStarsApi", () => ({
  ...api,
  RISING_STARS_LOAD_ERROR: "Could not load Rising Stars",
  RISING_STARS_CHALLENGE_LOAD_ERROR: "Could not load challenge",
  RISING_STARS_ENTRIES_LOAD_ERROR: "Could not load entries",
}));
vi.mock("@/features/feed/feedApi", () => feed);
vi.mock("@/lib/toast", () => ({ showToast: (message: string) => toast(message) }));
vi.mock("@/lib/platform", () => ({
  nativeShareUrl: async () => share(),
}));
vi.mock("@/store/useAuthStore", () => {
  const useAuthStore = (selector?: (state: typeof auth) => unknown) => (selector ? selector(auth) : auth);
  useAuthStore.getState = () => auth;
  return { useAuthStore };
});

const challengeId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const seasonId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const categoryId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const teamId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const entryId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const videoId = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const otherUser = "22222222-2222-4222-8222-222222222222";

const challenge = (): RisingStarsChallengeDetail => ({
  id: challengeId,
  season_id: seasonId,
  category_id: categoryId,
  region_id: null,
  week_index: 1,
  title: "Week 1 Sound",
  description: "Use the exclusive sound",
  sound_track_id: "track-1",
  sound_meta: { title: "Night Drive" },
  opens_at: "2026-08-01T00:00:00.000Z",
  closes_at: "2026-08-08T00:00:00.000Z",
  status: "open",
  leaderboard_frozen: false,
  live_qualifier_room_id: null,
  live_final_room_id: null,
});

const otherEntry = (): RisingStarsEntry => ({
  id: entryId,
  challenge_id: challengeId,
  creator_user_id: otherUser,
  video_id: videoId,
  team_id: null,
  status: "active",
  vote_count: 4,
  created_at: "2026-08-01T00:00:00.000Z",
  username: "nova",
  avatar_url: null,
});

function LocationProbe() {
  const location = useLocation();
  return <div>{`LOC ${location.pathname}`}</div>;
}

function renderPage(
  entry: string | { pathname: string; state?: unknown } = `/rising-stars/challenge/${challengeId}`,
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <MemoryRouter initialEntries={[typeof entry === "string" ? entry : { pathname: entry.pathname, state: entry.state }]}>
        <Routes>
          <Route path="/rising-stars/challenge/:challengeId" element={<RisingStarsChallenge />} />
          <Route path="/rising-stars" element={<LocationProbe />} />
          <Route path="/create" element={<LocationProbe />} />
          <Route path="/watch/:streamId" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );
  });
  return { container, root };
}

async function waitUntil(predicate: () => boolean, timeout = 2000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (predicate()) return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
  throw new Error("waitUntil timeout");
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

describe("PAGE-056 Rising Stars Challenge", () => {
  beforeEach(() => {
    Object.values(api).forEach((fn) => fn.mockReset());
    feed.apiFetchUserVideos.mockReset();
    toast.mockReset();
    checkUser.mockReset();
    share.mockReset();
    auth.user = { id: "11111111-1111-4111-8111-111111111111" };
    api.apiRisingStarsChallenge.mockResolvedValue({
      ok: true,
      challenge: challenge(),
      voted_today: false,
      my_entry: null,
      my_team_ids: [],
    });
    api.apiRisingStarsChallengeEntries.mockResolvedValue({ ok: true, entries: [otherEntry()] });
    api.apiRisingStarsChallengeLeaderboard.mockResolvedValue({
      ok: true,
      leaderboard: [
        {
          rank: 1,
          entry_id: entryId,
          creator_user_id: otherUser,
          video_id: videoId,
          team_id: null,
          vote_count: 4,
          status: "active",
          username: "nova",
          avatar_url: null,
        },
      ],
    });
    api.apiRisingStarsTeams.mockResolvedValue({
      ok: true,
      teams: [
        {
          id: teamId,
          season_id: seasonId,
          region_id: null,
          name: "North Crew",
          slug: "north-crew",
          captain_user_id: otherUser,
          team_votes: 4,
          member_count: 1,
        },
      ],
    });
    feed.apiFetchUserVideos.mockResolvedValue({
      page: {
        videos: [
          {
            id: videoId,
            url: "https://cdn.example/v.mp4",
            thumbnail: "",
            duration: "",
            user: {
              id: "u1",
              username: "me",
              name: "Me",
              avatar: "",
              level: 1,
              isVerified: false,
              followers: 0,
              following: 0,
            },
            description: "My clip",
            hashtags: [],
            music: { id: "", title: "", artist: "", cover: "", url: "" },
            stats: { views: 0, likes: 0, comments: 0, shares: 0, saves: 0 },
            createdAt: null,
            location: "",
            isLiked: false,
            isSaved: false,
            isFollowing: false,
            comments: [],
            quality: "",
            privacy: "public",
            engagementScore: 0,
          },
        ],
        nextCursor: null,
      },
      error: null,
    });
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = null;
    container = null;
  });

  it("shows Loading without treating Join as available", async () => {
    const hold = new Promise<never>(() => undefined);
    api.apiRisingStarsChallenge.mockReturnValueOnce(hold);
    const view = renderPage();
    root = view.root;
    container = view.container;
    expect(container.textContent).toContain("Loading...");
    expect(container.textContent).not.toContain("Submit entry");
    expect(container.textContent).not.toContain("No entries yet.");
  });

  it("shows the exact challenge detail, required sound, and entry list", async () => {
    const view = renderPage();
    root = view.root;
    container = view.container;
    await waitUntil(() => (container!.textContent || "").includes("Week 1 Sound"));
    expect(container.textContent).toContain("Challenge");
    expect(container.textContent).toContain("Week 1 · open");
    expect(container.textContent).toContain("Required sound: Night Drive");
    expect(container.textContent).toContain("One free vote per day. Votes are not coins and cannot be bought.");
    expect(container.textContent).toContain("Enter with your video");
    expect(container.textContent).toContain("Submit entry");
    expect(container.textContent).toContain("nova");
    expect(container.textContent).toContain("4 votes");
    expect(container.textContent).toContain("North Crew");
    expect(container.textContent).toContain("Join");
  });

  it("shows an honest unknown-challenge error instead of a fallback challenge", async () => {
    api.apiRisingStarsChallenge.mockResolvedValueOnce({
      ok: false,
      error: "CHALLENGE_NOT_FOUND",
      sessionExpired: false,
    });
    const view = renderPage();
    root = view.root;
    container = view.container;
    await waitUntil(() => (container!.textContent || "").includes("CHALLENGE_NOT_FOUND"));
    expect(container.textContent).not.toContain("Week 1 Sound");
    expect(container.textContent).not.toContain("No entries yet.");
    expect(container.textContent).not.toContain("Submit entry");
  });

  it("shows an entries error instead of No entries yet", async () => {
    api.apiRisingStarsChallengeEntries.mockResolvedValueOnce({
      ok: false,
      error: "Could not load entries",
      sessionExpired: false,
    });
    const view = renderPage();
    root = view.root;
    container = view.container;
    await waitUntil(() => (container!.textContent || "").includes("Could not load entries"));
    expect(container.textContent).not.toContain("No entries yet.");
  });

  it("closes to Rising Stars on named and hardware back", async () => {
    const view = renderPage({
      pathname: `/rising-stars/challenge/${challengeId}`,
      state: { returnTo: "/rising-stars" },
    });
    root = view.root;
    container = view.container;
    await waitUntil(() => Boolean(container!.querySelector('button[aria-label="Back"]')));
    act(() => {
      (container!.querySelector('button[aria-label="Back"]') as HTMLButtonElement).click();
    });
    expect(container.textContent).toContain("LOC /rising-stars");
    expect(namedHardwareBackTarget(`/rising-stars/challenge/${challengeId}`)).toBe("/rising-stars");
  });
});
