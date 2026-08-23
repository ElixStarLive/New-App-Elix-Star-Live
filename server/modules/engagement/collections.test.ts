import { describe, expect, it } from "vitest";
import {
  engagementChestOpenResponseSchema,
  engagementCreatorCardsResponseSchema,
  engagementStickersResponseSchema,
  engagementTreasureResponseSchema,
} from "../../../shared/contracts/engagement.js";

const catalog = [
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
];

describe("PAGE-054 collections contract", () => {
  it("rejects the stub saved/liked inventory payload", () => {
    expect(
      engagementTreasureResponseSchema.safeParse({
        items: [
          { id: "saved", title: "Saved videos", detail: "1 saved" },
          { id: "liked", title: "Liked videos", detail: "2 liked" },
        ],
      }).success,
    ).toBe(false);
  });

  it("accepts the authoritative treasure, sticker, and creator-card contracts", () => {
    expect(
      engagementTreasureResponseSchema.safeParse({
        catalog,
        chests: [],
      }).success,
    ).toBe(true);
    expect(
      engagementChestOpenResponseSchema.safeParse({
        ok: true,
        alreadyOpened: true,
        reward: {
          reward_xp: 50,
          reward_promo_coins: 25,
          reward_energy: 10,
          reward_label: "50 XP + 25 Promo",
          title: "Watch Chest",
          rarity: "common",
        },
      }).success,
    ).toBe(true);
    expect(
      engagementStickersResponseSchema.safeParse({
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
      }).success,
    ).toBe(true);
    expect(
      engagementCreatorCardsResponseSchema.safeParse({
        tiers: [
          { tier: "bronze", title: "Bronze Creator Card", stars: 2, watch_minutes_required: 5, gifts_required: 0 },
        ],
        unlocked: [],
        progress: [],
      }).success,
    ).toBe(true);
  });

  it("rejects negative quantity and unknown chest status", () => {
    expect(
      engagementTreasureResponseSchema.safeParse({
        catalog,
        chests: [
          {
            id: "c1",
            chest_def_id: "chest_common_watch",
            title: "Watch Chest",
            rarity: "common",
            status: "ready",
            source: "activity",
            location_hint: "hub",
            reward_label: "50 XP + 25 Promo",
            reward_xp: 50,
            reward_promo_coins: 25,
            reward_energy: 10,
            created_at: "2026-08-21T00:00:00.000Z",
            opened_at: null,
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      engagementStickersResponseSchema.safeParse({
        sets: [
          {
            id: "animals",
            title: "Animals",
            theme: "",
            complete_reward_label: "",
            progress: 0,
            total: 1,
            complete: false,
            stickers: [
              {
                id: "animals_fox",
                set_id: "animals",
                name: "Fox",
                emoji: "🦊",
                rarity: "common",
                owned: -1,
                unlocked: false,
              },
            ],
          },
        ],
      }).success,
    ).toBe(false);
  });
});
