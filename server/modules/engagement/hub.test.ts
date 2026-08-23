import { describe, expect, it } from "vitest";
import { engagementHubResponseSchema } from "../../../shared/contracts/engagement.js";
import { fanTierForLevel } from "./hub.js";

describe("PAGE-047 hub contract", () => {
  it("maps fan level to the server-owned tier labels", () => {
    expect(fanTierForLevel(0)).toBe("Bronze Fan");
    expect(fanTierForLevel(9)).toBe("Bronze Fan");
    expect(fanTierForLevel(10)).toBe("Silver Fan");
    expect(fanTierForLevel(20)).toBe("Gold Fan");
    expect(fanTierForLevel(30)).toBe("Diamond Fan");
    expect(fanTierForLevel(40)).toBe("Elite Fan");
    expect(fanTierForLevel(50)).toBe("Legend Fan");
  });

  it("rejects a merged wallet payload and missing hub fields", () => {
    expect(
      engagementHubResponseSchema.safeParse({
        coin_balance: 12,
        promotional_coins: 1,
        battle_energy: 1,
        total_xp: 1,
      }).success,
    ).toBe(false);
    expect(
      engagementHubResponseSchema.safeParse({
        hub: {
          promotional_coins: 1,
          battle_energy: 1,
          total_xp: 1,
          fan_level: 1,
          fan_tier: "Bronze Fan",
          missions_open: 0,
          daily_login: { can_claim: false, streak_day: 1, claimed_today: true },
          starter_coin_balance: 0,
        },
      }).success,
    ).toBe(true);
    expect(
      engagementHubResponseSchema.safeParse({
        hub: {
          promotional_coins: -1,
          battle_energy: 0,
          total_xp: 0,
          fan_level: 0,
          fan_tier: "Bronze Fan",
          missions_open: 0,
          daily_login: { can_claim: false, streak_day: 0, claimed_today: false },
          starter_coin_balance: 0,
        },
      }).success,
    ).toBe(false);
  });
});
