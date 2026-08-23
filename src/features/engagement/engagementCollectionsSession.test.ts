import { describe, expect, it, vi } from "vitest";
import type {
  EngagementCreatorCardsResponse,
  EngagementStickersResponse,
  EngagementTreasureResponse,
} from "@shared/contracts";
import {
  ENGAGEMENT_COLLECTIONS_LOAD_ERROR,
  createEngagementCollectionsSession,
} from "./engagementCollectionsSession";

const userA = "11111111-1111-4111-8111-111111111111";
const userB = "22222222-2222-4222-8222-222222222222";
const chestA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const treasure = (chests: EngagementTreasureResponse["chests"] = []): EngagementTreasureResponse => ({
  catalog: [
    {
      id: "chest_common_watch",
      rarity: "common",
      title: "Watch Chest",
      description: "Appears after watching LIVE",
      reward_xp: 50,
      reward_promo_coins: 25,
      reward_energy: 10,
      reward_label: "50 XP + 25 Promo",
    },
  ],
  chests,
});

const stickers = (): EngagementStickersResponse => ({
  sets: [
    {
      id: "animals",
      title: "Animals",
      theme: "Wildlife",
      complete_reward_label: "Animal frame",
      progress: 0,
      total: 4,
      complete: false,
      stickers: [
        {
          id: "animals_fox",
          set_id: "animals",
          name: "Fox",
          emoji: "🦊",
          rarity: "common",
          owned: 0,
          unlocked: false,
        },
      ],
    },
  ],
});

const cards = (unlocked: EngagementCreatorCardsResponse["unlocked"] = []): EngagementCreatorCardsResponse => ({
  tiers: [
    { tier: "bronze", title: "Bronze Creator Card", stars: 2, watch_minutes_required: 5, gifts_required: 0 },
  ],
  unlocked,
  progress: [],
});

const foundChest = {
  id: chestA,
  chest_def_id: "chest_common_watch",
  title: "Watch Chest",
  rarity: "common",
  status: "found" as const,
  source: "activity",
  location_hint: "hub",
  reward_label: "50 XP + 25 Promo",
  reward_xp: 50,
  reward_promo_coins: 25,
  reward_energy: 10,
  created_at: "2026-08-21T00:00:00.000Z",
  opened_at: null,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function createDeps(accountId: string | null = userA) {
  let current = accountId;
  const loadTreasure = vi.fn();
  const loadStickers = vi.fn();
  const loadCards = vi.fn();
  const openChest = vi.fn();
  const toast = vi.fn();
  const onSessionExpired = vi.fn();
  const onDisabled = vi.fn();
  const session = createEngagementCollectionsSession({
    getAccountId: () => current,
    loadTreasure,
    loadStickers,
    loadCards,
    openChest,
    toast,
    onSessionExpired,
    onDisabled,
  });
  session.bindAccount(accountId);
  return {
    session,
    loadTreasure,
    loadStickers,
    loadCards,
    openChest,
    toast,
    onSessionExpired,
    onDisabled,
    setAccount: (id: string | null) => {
      current = id;
    },
  };
}

describe("PAGE-054 collections session", () => {
  it("starts loading and does not treat a failed load as empty inventory", async () => {
    const deps = createDeps();
    expect(deps.session.getSnapshot()).toMatchObject({ kind: "loading", inventory: null, openingChestId: null });
    deps.loadTreasure.mockResolvedValueOnce({
      ok: false,
      error: ENGAGEMENT_COLLECTIONS_LOAD_ERROR,
      sessionExpired: false,
      disabled: false,
    });
    deps.loadStickers.mockResolvedValueOnce({ ok: true, stickers: stickers() });
    deps.loadCards.mockResolvedValueOnce({ ok: true, cards: cards() });
    await deps.session.load(userA);
    expect(deps.session.getSnapshot()).toMatchObject({
      kind: "error",
      inventory: null,
      error: ENGAGEMENT_COLLECTIONS_LOAD_ERROR,
      openingChestId: null,
    });
  });

  it("drops a late User A inventory after User B is active", async () => {
    const deps = createDeps(userA);
    const first = deferred<{ ok: true; treasure: EngagementTreasureResponse }>();
    deps.loadTreasure.mockReturnValueOnce(first.promise);
    deps.loadStickers.mockResolvedValue({ ok: true, stickers: stickers() });
    deps.loadCards.mockResolvedValue({ ok: true, cards: cards() });
    const loadA = deps.session.load(userA);
    deps.setAccount(userB);
    deps.session.bindAccount(userB);
    deps.loadTreasure.mockResolvedValueOnce({ ok: true, treasure: treasure([]) });
    const loadB = deps.session.load(userB);
    first.resolve({ ok: true, treasure: treasure([foundChest]) });
    await loadA;
    await loadB;
    const snap = deps.session.getSnapshot();
    expect(snap.kind).toBe("ready");
    if (snap.kind === "ready") {
      expect(snap.inventory.treasure.chests).toEqual([]);
    }
  });

  it("locks Open during the active request and does not unlock locally", async () => {
    const deps = createDeps();
    deps.loadTreasure.mockResolvedValue({ ok: true, treasure: treasure([foundChest]) });
    deps.loadStickers.mockResolvedValue({ ok: true, stickers: stickers() });
    deps.loadCards.mockResolvedValue({ ok: true, cards: cards() });
    await deps.session.load(userA);
    deps.openChest.mockResolvedValueOnce({
      ok: true,
      reward: {
        reward_xp: 50,
        reward_promo_coins: 25,
        reward_energy: 10,
        reward_label: "50 XP + 25 Promo",
        title: "Watch Chest",
        rarity: "common",
      },
    });
    const first = deps.session.open(userA, chestA);
    const second = deps.session.open(userA, chestA);
    await first;
    await second;
    expect(deps.openChest).toHaveBeenCalledTimes(1);
    expect(deps.openChest).toHaveBeenCalledWith(chestA);
    expect(deps.toast).toHaveBeenCalledWith("50 XP + 25 Promo");
    expect(deps.session.getSnapshot()).toMatchObject({ kind: "ready", openingChestId: null });
  });

  it("does not open a chest the server has not marked found", async () => {
    const deps = createDeps();
    deps.loadTreasure.mockResolvedValueOnce({
      ok: true,
      treasure: treasure([{ ...foundChest, status: "opened", opened_at: "2026-08-21T01:00:00.000Z" }]),
    });
    deps.loadStickers.mockResolvedValueOnce({ ok: true, stickers: stickers() });
    deps.loadCards.mockResolvedValueOnce({ ok: true, cards: cards() });
    await deps.session.load(userA);
    await deps.session.open(userA, chestA);
    expect(deps.openChest).not.toHaveBeenCalled();
  });

  it("keeps the previous ready state after a failed open", async () => {
    const deps = createDeps();
    deps.loadTreasure.mockResolvedValueOnce({ ok: true, treasure: treasure([foundChest]) });
    deps.loadStickers.mockResolvedValueOnce({ ok: true, stickers: stickers() });
    deps.loadCards.mockResolvedValueOnce({ ok: true, cards: cards() });
    await deps.session.load(userA);
    deps.openChest.mockResolvedValueOnce({
      ok: false,
      error: "Open failed",
      sessionExpired: false,
      disabled: false,
    });
    await deps.session.open(userA, chestA);
    expect(deps.session.getSnapshot()).toMatchObject({
      kind: "ready",
      openingChestId: null,
      inventory: { treasure: { chests: [foundChest] } },
    });
    expect(deps.toast).toHaveBeenCalledWith("Open failed");
  });
});
