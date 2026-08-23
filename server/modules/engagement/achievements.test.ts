import { describe, expect, it } from "vitest";
import { engagementAchievementsResponseSchema } from "../../../shared/contracts/engagement.js";
import { toAchievementDto } from "./achievements.js";

describe("PAGE-051 achievement contract", () => {
  it("accepts the authoritative list shape and rejects flattened items", () => {
    expect(
      engagementAchievementsResponseSchema.safeParse({
        items: [{ id: "first_gift", title: "First Gift", detail: "1/1 · unlocked" }],
      }).success,
    ).toBe(false);
    expect(
      engagementAchievementsResponseSchema.safeParse({
        achievements: [
          {
            id: "first_gift",
            name: "First Gift",
            description: "Send your first gift",
            icon: "🎁",
            goal_count: 1,
            reward_xp: 50,
            reward_promo_coins: 100,
            rarity: "common",
            progress: 0,
            unlocked: false,
            unlocked_at: null,
            claimed: false,
          },
        ],
      }).success,
    ).toBe(true);
    expect(
      engagementAchievementsResponseSchema.safeParse({
        achievements: [
          {
            id: "first_gift",
            name: "First Gift",
            description: "Send your first gift",
            icon: "🎁",
            goal_count: 0,
            reward_xp: 50,
            reward_promo_coins: 100,
            rarity: "common",
            progress: 0,
            unlocked: false,
            unlocked_at: null,
            claimed: false,
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("keeps achievementId as id and refuses negative progress", () => {
    const dto = toAchievementDto({
      id: "mvp_top10",
      name: "Top 10 MVP",
      description: "Reach top 10 on an MVP board",
      icon: "👑",
      goal_count: "1",
      reward_xp: "400",
      reward_promo_coins: "750",
      rarity: "epic",
      progress: "0",
      unlocked: false,
      unlocked_at: null,
      claimed: false,
    });
    expect(dto.id).toBe("mvp_top10");
    expect(dto.unlocked).toBe(false);
    expect(dto.claimed).toBe(false);
    expect(() =>
      toAchievementDto({
        id: "first_gift",
        name: "First Gift",
        description: "Send your first gift",
        icon: "🎁",
        goal_count: "1",
        reward_xp: "50",
        reward_promo_coins: "100",
        rarity: "common",
        progress: "-1",
        unlocked: false,
        unlocked_at: null,
        claimed: false,
      }),
    ).toThrow(/progress is unreadable/);
  });
});
