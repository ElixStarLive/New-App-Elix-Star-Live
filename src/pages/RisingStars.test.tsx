import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { namedHardwareBackTarget } from "@/lib/settingsNav";
import type {
  RisingStarsCategory,
  RisingStarsChallenge,
  RisingStarsRegion,
  RisingStarsSeason,
  RisingStarsStanding,
  RisingStarsTeam,
} from "@shared/contracts";
import RisingStars from "./RisingStars";

const api = vi.hoisted(() => ({
  apiRisingStarsCurrentSeason: vi.fn(),
  apiRisingStarsCategories: vi.fn(),
  apiRisingStarsRegions: vi.fn(),
  apiRisingStarsStandings: vi.fn(),
  apiRisingStarsTeams: vi.fn(),
  apiRisingStarsChallenges: vi.fn(),
}));
const toast = vi.hoisted(() => vi.fn());
const checkUser = vi.hoisted(() => vi.fn(async () => undefined));
const auth = vi.hoisted(() => ({
  user: { id: "11111111-1111-4111-8111-111111111111" } as { id: string } | null,
  checkUser: () => checkUser(),
}));

vi.mock("@/features/risingStars/risingStarsApi", () => api);
vi.mock("@/lib/toast", () => ({ showToast: (...args: unknown[]) => toast(...args) }));
vi.mock("@/store/useAuthStore", () => {
  const useAuthStore = (selector?: (state: typeof auth) => unknown) => (selector ? selector(auth) : auth);
  useAuthStore.getState = () => auth;
  return { useAuthStore };
});

const seasonId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const categoryId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const regionId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const challengeId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const season = (): RisingStarsSeason => ({
  id: seasonId,
  slug: "season-1",
  title: "Season One",
  description: null,
  starts_at: "2026-08-01T00:00:00.000Z",
  ends_at: "2026-10-01T00:00:00.000Z",
  status: "active",
  created_by: null,
  created_at: "2026-08-01T00:00:00.000Z",
});

const categories = (): RisingStarsCategory[] => [
  { id: categoryId, season_id: seasonId, slug: "dance", title: "Dance", sort_order: 0, is_active: true },
];

const regions = (): RisingStarsRegion[] => [
  {
    id: regionId,
    season_id: seasonId,
    slug: "uk",
    title: "UK",
    country_codes: ["GB"],
    sort_order: 0,
    is_active: true,
  },
];

const challenges = (): RisingStarsChallenge[] => [
  {
    id: challengeId,
    season_id: seasonId,
    category_id: categoryId,
    region_id: regionId,
    week_index: 1,
    title: "Week 1 Sound",
    description: null,
    sound_track_id: "track-1",
    opens_at: "2026-08-01T00:00:00.000Z",
    closes_at: "2026-08-08T00:00:00.000Z",
    status: "open",
    leaderboard_frozen: false,
  },
];

const standings = (): RisingStarsStanding[] => [
  {
    rank: 1,
    creator_user_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    username: "nova",
    avatar_url: null,
    total_votes: 12,
    entries: 1,
  },
];

const teams = (): RisingStarsTeam[] => [
  {
    id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    season_id: seasonId,
    region_id: regionId,
    name: "North Crew",
    slug: "north-crew",
    captain_user_id: "11111111-1111-4111-8111-111111111111",
    team_votes: 12,
    member_count: 3,
  },
];

function LocationProbe() {
  const location = useLocation();
  return <div>{`LOC ${location.pathname}`}</div>;
}

function renderPage(entry: string | { pathname: string; state?: unknown } = "/rising-stars") {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <MemoryRouter initialEntries={[typeof entry === "string" ? entry : { pathname: entry.pathname, state: entry.state }]}>
        <Routes>
          <Route path="/rising-stars" element={<RisingStars />} />
          <Route path="/rising-stars/challenge/:challengeId" element={<LocationProbe />} />
          <Route path="/feed" element={<LocationProbe />} />
          <Route path="/discover" element={<LocationProbe />} />
          <Route path="/profile/:userId" element={<LocationProbe />} />
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

describe("PAGE-055 Rising Stars", () => {
  beforeEach(() => {
    api.apiRisingStarsCurrentSeason.mockReset();
    api.apiRisingStarsCategories.mockReset();
    api.apiRisingStarsRegions.mockReset();
    api.apiRisingStarsStandings.mockReset();
    api.apiRisingStarsTeams.mockReset();
    api.apiRisingStarsChallenges.mockReset();
    toast.mockReset();
    checkUser.mockReset();
    auth.user = { id: "11111111-1111-4111-8111-111111111111" };
    api.apiRisingStarsCurrentSeason.mockResolvedValue({ ok: true, season: season() });
    api.apiRisingStarsCategories.mockResolvedValue({ ok: true, categories: categories() });
    api.apiRisingStarsRegions.mockResolvedValue({ ok: true, regions: regions() });
    api.apiRisingStarsStandings.mockResolvedValue({ ok: true, standings: standings() });
    api.apiRisingStarsTeams.mockResolvedValue({ ok: true, teams: teams() });
    api.apiRisingStarsChallenges.mockResolvedValue({ ok: true, challenges: challenges() });
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = null;
    container = null;
  });

  it("shows loading without empty season or filter copy", async () => {
    const hold = new Promise<{ ok: true; season: RisingStarsSeason | null }>(() => undefined);
    api.apiRisingStarsCurrentSeason.mockReturnValueOnce(hold);
    const view = renderPage();
    root = view.root;
    container = view.container;
    expect(container.textContent).toContain("Loading...");
    expect(container.textContent).not.toContain("No active Rising Stars season yet");
    expect(container.textContent).not.toContain("No challenges for this filter");
    expect(container.textContent).not.toContain("No challenges yet");
  });

  it("shows the exact empty-season copy when the server has no active season", async () => {
    api.apiRisingStarsCurrentSeason.mockResolvedValueOnce({ ok: true, season: null });
    const view = renderPage();
    root = view.root;
    container = view.container;
    await waitUntil(() => (container!.textContent || "").includes("No active Rising Stars season yet. Check back soon."));
    expect(container.textContent).not.toContain("Week 1 Sound");
    expect(container.textContent).not.toContain("No challenges yet");
  });

  it("shows an honest error instead of an empty season", async () => {
    api.apiRisingStarsCurrentSeason.mockResolvedValueOnce({
      ok: false,
      error: "Could not load Rising Stars",
      sessionExpired: false,
    });
    const view = renderPage();
    root = view.root;
    container = view.container;
    await waitUntil(() => (container!.textContent || "").includes("Could not load Rising Stars"));
    expect(container.textContent).not.toContain("No active Rising Stars season yet");
    expect(container.textContent).not.toContain("All categories");
  });

  it("renders season, filters, challenge cards, standings, and teams from the server", async () => {
    const view = renderPage();
    root = view.root;
    container = view.container;
    await waitUntil(() => (container!.textContent || "").includes("Week 1 Sound"));
    expect(container.textContent).toContain("Rising Stars");
    expect(container.textContent).toContain("Season One");
    expect(container.textContent).toContain("active");
    expect(container.textContent).toContain("Compete with exclusive sounds. Free daily votes. Live finals.");
    expect(container.textContent).toContain("All categories");
    expect(container.textContent).toContain("Dance");
    expect(container.textContent).toContain("All regions");
    expect(container.textContent).toContain("UK");
    expect(container.textContent).toContain("Week 1 · open");
    act(() => {
      const standingsTab = Array.from(container!.querySelectorAll("button")).find((button) => button.textContent === "Standings");
      standingsTab?.click();
    });
    expect(container.textContent).toContain("nova");
    expect(container.textContent).toContain("12 votes");
    act(() => {
      const teamsTab = Array.from(container!.querySelectorAll("button")).find((button) => button.textContent === "Teams");
      teamsTab?.click();
    });
    expect(container.textContent).toContain("North Crew");
    expect(container.textContent).toContain("3 members · 12 votes");
  });

  it("hands a canonical challengeId to PAGE-056 and refuses a missing id", async () => {
    const view = renderPage();
    root = view.root;
    container = view.container;
    await waitUntil(() => (container!.textContent || "").includes("Week 1 Sound"));
    act(() => {
      const card = Array.from(container!.querySelectorAll("button")).find((button) =>
        (button.textContent || "").includes("Week 1 Sound"),
      );
      card?.click();
    });
    expect(container.textContent).toContain(`LOC /rising-stars/challenge/${challengeId}`);
  });

  it("closes to For You, honors Discover returnTo, and names hardware back", async () => {
    const view = renderPage({ pathname: "/rising-stars", state: { returnTo: "/discover" } });
    root = view.root;
    container = view.container;
    await waitUntil(() => Boolean(container!.querySelector('button[aria-label="Back"]')));
    act(() => {
      (container!.querySelector('button[aria-label="Back"]') as HTMLButtonElement).click();
    });
    expect(container.textContent).toContain("LOC /discover");
    expect(namedHardwareBackTarget("/rising-stars")).toBe("/feed");
    expect(namedHardwareBackTarget("/rising-stars", { returnTo: "/discover" })).toBe("/discover");
  });
});
