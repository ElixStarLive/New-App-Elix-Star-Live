import { describe, expect, it } from "vitest";
import { FAN_TIER_LADDER, fanTierForLevel } from "./fanTiers.js";

describe("fan tier ladder", () => {
  it("is the single owner of named Fan tiers", () => {
    expect(FAN_TIER_LADDER.map((row) => row.name)).toEqual([
      "Bronze Fan",
      "Silver Fan",
      "Gold Fan",
      "Diamond Fan",
      "Elite Fan",
      "Legend Fan",
    ]);
    expect(fanTierForLevel(0)).toBe("Bronze Fan");
    expect(fanTierForLevel(9)).toBe("Bronze Fan");
    expect(fanTierForLevel(10)).toBe("Silver Fan");
    expect(fanTierForLevel(19)).toBe("Silver Fan");
    expect(fanTierForLevel(20)).toBe("Gold Fan");
    expect(fanTierForLevel(30)).toBe("Diamond Fan");
    expect(fanTierForLevel(40)).toBe("Elite Fan");
    expect(fanTierForLevel(50)).toBe("Legend Fan");
    expect(fanTierForLevel(300)).toBe("Legend Fan");
  });
});
