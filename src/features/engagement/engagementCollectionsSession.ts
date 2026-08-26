import type {
  EngagementChestOpenResponse,
  EngagementCreatorCardsResponse,
  EngagementStickersResponse,
  EngagementTreasureResponse,
} from "@shared/contracts";
import type { EngagementCollectionsApiFailure } from "./engagementCollectionsApi";

export type EngagementCollectionsInventory = {
  treasure: EngagementTreasureResponse;
  stickers: EngagementStickersResponse;
  cards: EngagementCreatorCardsResponse;
};

export type EngagementCollectionsView =
  | { kind: "loading"; inventory: null; error: null; openingChestId: null }
  | { kind: "ready"; inventory: EngagementCollectionsInventory; error: null; openingChestId: string | null }
  | { kind: "error"; inventory: null; error: string; openingChestId: null };

export const ENGAGEMENT_COLLECTIONS_LOAD_ERROR = "Could not load collections";
export const ENGAGEMENT_COLLECTIONS_OPEN_ERROR = "Open failed";

type CollectionsDeps = {
  getAccountId: () => string | null;
  loadTreasure: () => Promise<{ ok: true; treasure: EngagementTreasureResponse } | EngagementCollectionsApiFailure>;
  loadStickers: () => Promise<{ ok: true; stickers: EngagementStickersResponse } | EngagementCollectionsApiFailure>;
  loadCards: () => Promise<{ ok: true; cards: EngagementCreatorCardsResponse } | EngagementCollectionsApiFailure>;
  openChest: (chestId: string) => Promise<{ ok: true } & EngagementChestOpenResponse | EngagementCollectionsApiFailure>;
  toast: (message: string) => void;
  onSessionExpired: () => void;
  onDisabled: () => void;
};

const emptyView: EngagementCollectionsView = {
  kind: "loading",
  inventory: null,
  error: null,
  openingChestId: null,
};

export function createEngagementCollectionsSession(deps: CollectionsDeps) {
  let view: EngagementCollectionsView = { ...emptyView };
  let generation = 0;
  let accountId: string | null = null;
  const listeners = new Set<() => void>();

  const emit = () => {
    for (const listener of listeners) listener();
  };

  const resetForAccount = (nextAccountId: string | null) => {
    if (nextAccountId === accountId) return;
    accountId = nextAccountId;
    generation += 1;
    view = { ...emptyView };
    emit();
  };

  const applyFailure = (result: EngagementCollectionsApiFailure, fallback: string) => {
    if (result.sessionExpired) deps.onSessionExpired();
    if (result.disabled) deps.onDisabled();
    view = { kind: "error", inventory: null, error: result.error || fallback, openingChestId: null };
    emit();
    deps.toast(result.error || fallback);
  };

  const loadInventory = async (expectedAccountId: string, gen: number) => {
    const [treasure, stickers, cards] = await Promise.all([
      deps.loadTreasure(),
      deps.loadStickers(),
      deps.loadCards(),
    ]);
    if (gen !== generation || deps.getAccountId() !== expectedAccountId) return;
    if (!treasure.ok) {
      applyFailure(treasure, ENGAGEMENT_COLLECTIONS_LOAD_ERROR);
      return;
    }
    if (!stickers.ok) {
      applyFailure(stickers, ENGAGEMENT_COLLECTIONS_LOAD_ERROR);
      return;
    }
    if (!cards.ok) {
      applyFailure(cards, ENGAGEMENT_COLLECTIONS_LOAD_ERROR);
      return;
    }
    view = {
      kind: "ready",
      inventory: { treasure: treasure.treasure, stickers: stickers.stickers, cards: cards.cards },
      error: null,
      openingChestId: null,
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
        view = { kind: "error", inventory: null, error: ENGAGEMENT_COLLECTIONS_LOAD_ERROR, openingChestId: null };
        emit();
        return;
      }
      accountId = expectedAccountId;
      // Bump so an older in-flight inventory GET cannot resurrect an opened chest.
      const gen = ++generation;
      view = { kind: "loading", inventory: null, error: null, openingChestId: null };
      emit();
      await loadInventory(expectedAccountId, gen);
    },
    open: async (expectedAccountId: string | null, chestId: string) => {
      if (!expectedAccountId || deps.getAccountId() !== expectedAccountId) return;
      if (view.kind !== "ready" || view.openingChestId) return;
      const chest = view.inventory.treasure.chests.find((item) => item.id === chestId);
      if (!chest || chest.status !== "found") return;
      const openGen = generation;
      view = { ...view, openingChestId: chestId };
      emit();
      const result = await deps.openChest(chestId);
      if (openGen !== generation || deps.getAccountId() !== expectedAccountId) return;
      if (!result.ok) {
        view = { ...view, openingChestId: null };
        emit();
        if (result.sessionExpired) deps.onSessionExpired();
        if (result.disabled) deps.onDisabled();
        deps.toast(result.error || ENGAGEMENT_COLLECTIONS_OPEN_ERROR);
        return;
      }
      deps.toast(result.reward.reward_label || "Chest opened");
      const reloadGen = ++generation;
      await loadInventory(expectedAccountId, reloadGen);
    },
  };
}

export type EngagementCollectionsSession = ReturnType<typeof createEngagementCollectionsSession>;
