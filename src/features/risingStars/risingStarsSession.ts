import type {
  RisingStarsCategory,
  RisingStarsChallenge,
  RisingStarsRegion,
  RisingStarsSeason,
  RisingStarsStanding,
  RisingStarsTeam,
} from "@shared/contracts";
import type { RisingStarsApiFailure } from "./risingStarsApi";
import { RISING_STARS_LOAD_ERROR } from "./risingStarsApi";

export type RisingStarsTab = "challenges" | "standings" | "teams";

export type RisingStarsHub = {
  season: RisingStarsSeason;
  categories: RisingStarsCategory[];
  regions: RisingStarsRegion[];
  standings: RisingStarsStanding[];
  teams: RisingStarsTeam[];
};

export type RisingStarsView = {
  kind: "loading" | "empty" | "ready" | "error";
  hub: RisingStarsHub | null;
  challenges: RisingStarsChallenge[];
  error: string | null;
  categoryId: string;
  regionId: string;
  tab: RisingStarsTab;
  challengesLoading: boolean;
};

type RisingStarsDeps = {
  getAccountId: () => string | null;
  loadCurrentSeason: () => Promise<
    { ok: true; season: RisingStarsSeason | null } | RisingStarsApiFailure
  >;
  loadCategories: (
    seasonId: string,
  ) => Promise<{ ok: true; categories: RisingStarsCategory[] } | RisingStarsApiFailure>;
  loadRegions: (
    seasonId: string,
  ) => Promise<{ ok: true; regions: RisingStarsRegion[] } | RisingStarsApiFailure>;
  loadStandings: (
    seasonId: string,
  ) => Promise<{ ok: true; standings: RisingStarsStanding[] } | RisingStarsApiFailure>;
  loadTeams: (seasonId: string) => Promise<{ ok: true; teams: RisingStarsTeam[] } | RisingStarsApiFailure>;
  loadChallenges: (input: {
    seasonId: string;
    categoryId?: string;
    regionId?: string;
  }) => Promise<{ ok: true; challenges: RisingStarsChallenge[] } | RisingStarsApiFailure>;
  toast: (message: string) => void;
  onSessionExpired: () => void;
};

const emptyView = (): RisingStarsView => ({
  kind: "loading",
  hub: null,
  challenges: [],
  error: null,
  categoryId: "",
  regionId: "",
  tab: "challenges",
  challengesLoading: false,
});

export function createRisingStarsSession(deps: RisingStarsDeps) {
  let view: RisingStarsView = emptyView();
  let generation = 0;
  let filterGeneration = 0;
  let accountId: string | null = null;
  const listeners = new Set<() => void>();

  const emit = () => {
    for (const listener of listeners) listener();
  };

  const resetForAccount = (nextAccountId: string | null) => {
    if (nextAccountId === accountId) return;
    accountId = nextAccountId;
    generation += 1;
    filterGeneration += 1;
    view = emptyView();
    emit();
  };

  const applyFailure = (result: RisingStarsApiFailure) => {
    if (result.sessionExpired) deps.onSessionExpired();
    view = {
      ...view,
      kind: "error",
      hub: null,
      challenges: [],
      error: result.error || RISING_STARS_LOAD_ERROR,
      challengesLoading: false,
    };
    emit();
    deps.toast(result.error || RISING_STARS_LOAD_ERROR);
  };

  const loadChallenges = async (
    expectedAccountId: string,
    seasonId: string,
    categoryId: string,
    regionId: string,
    gen: number,
    filterGen: number,
  ) => {
    const result = await deps.loadChallenges({
      seasonId,
      categoryId: categoryId || undefined,
      regionId: regionId || undefined,
    });
    if (gen !== generation || filterGen !== filterGeneration || deps.getAccountId() !== expectedAccountId) {
      return;
    }
    if (!result.ok) {
      applyFailure(result);
      return;
    }
    view = {
      ...view,
      challenges: result.challenges,
      challengesLoading: false,
    };
    emit();
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
      resetForAccount(nextAccountId);
    },
    load: async (expectedAccountId: string | null) => {
      if (!expectedAccountId || deps.getAccountId() !== expectedAccountId) {
        view = {
          ...emptyView(),
          kind: "error",
          error: RISING_STARS_LOAD_ERROR,
        };
        emit();
        return;
      }
      accountId = expectedAccountId;
      const gen = generation;
      view = {
        ...view,
        kind: "loading",
        hub: null,
        challenges: [],
        error: null,
        challengesLoading: false,
      };
      emit();
      const current = await deps.loadCurrentSeason();
      if (gen !== generation || deps.getAccountId() !== expectedAccountId) return;
      if (!current.ok) {
        applyFailure(current);
        return;
      }
      if (!current.season) {
        view = {
          ...view,
          kind: "empty",
          hub: null,
          challenges: [],
          error: null,
          challengesLoading: false,
        };
        emit();
        return;
      }
      const season = current.season;
      const [categories, regions, standings, teams, challenges] = await Promise.all([
        deps.loadCategories(season.id),
        deps.loadRegions(season.id),
        deps.loadStandings(season.id),
        deps.loadTeams(season.id),
        deps.loadChallenges({
          seasonId: season.id,
          categoryId: view.categoryId || undefined,
          regionId: view.regionId || undefined,
        }),
      ]);
      if (gen !== generation || deps.getAccountId() !== expectedAccountId) return;
      if (!categories.ok) {
        applyFailure(categories);
        return;
      }
      if (!regions.ok) {
        applyFailure(regions);
        return;
      }
      if (!standings.ok) {
        applyFailure(standings);
        return;
      }
      if (!teams.ok) {
        applyFailure(teams);
        return;
      }
      if (!challenges.ok) {
        applyFailure(challenges);
        return;
      }
      view = {
        ...view,
        kind: "ready",
        hub: {
          season,
          categories: categories.categories,
          regions: regions.regions,
          standings: standings.standings,
          teams: teams.teams,
        },
        challenges: challenges.challenges,
        error: null,
        challengesLoading: false,
      };
      emit();
    },
    setCategoryId: (categoryId: string) => {
      if (view.categoryId === categoryId) return;
      view = { ...view, categoryId };
      emit();
      if (view.kind !== "ready" || !view.hub || !accountId) return;
      filterGeneration += 1;
      const gen = generation;
      const filterGen = filterGeneration;
      const expectedAccountId = accountId;
      const seasonId = view.hub.season.id;
      view = { ...view, challengesLoading: true };
      emit();
      void loadChallenges(expectedAccountId, seasonId, categoryId, view.regionId, gen, filterGen);
    },
    setRegionId: (regionId: string) => {
      if (view.regionId === regionId) return;
      view = { ...view, regionId };
      emit();
      if (view.kind !== "ready" || !view.hub || !accountId) return;
      filterGeneration += 1;
      const gen = generation;
      const filterGen = filterGeneration;
      const expectedAccountId = accountId;
      const seasonId = view.hub.season.id;
      view = { ...view, challengesLoading: true };
      emit();
      void loadChallenges(expectedAccountId, seasonId, view.categoryId, regionId, gen, filterGen);
    },
    setTab: (tab: RisingStarsTab) => {
      if (view.tab === tab) return;
      view = { ...view, tab };
      emit();
    },
  };
}

export type RisingStarsSession = ReturnType<typeof createRisingStarsSession>;
