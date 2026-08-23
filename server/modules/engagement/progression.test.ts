import { describe, expect, it } from "vitest";
import { engagementFanLevelResponseSchema } from "../../../shared/contracts/engagement.js";
import { deriveFanLevel, latestFanTitle, nextLevelTotalXp } from "./progression.js";

const requirements = [
  { level: 1, total_xp_required: 100, title: "New Supporter", badge_code: "new_supporter" },
  { level: 2, total_xp_required: 250 },
  { level: 3, total_xp_required: 500, title: "Active Fan", badge_code: "active_fan" },
];

describe("PAGE-049 progression contract", () => {
  it("derives level from authoritative thresholds only", () => {
    expect(deriveFanLevel(0, requirements)).toBe(0);
    expect(deriveFanLevel(99, requirements)).toBe(0);
    expect(deriveFanLevel(100, requirements)).toBe(1);
    expect(deriveFanLevel(249, requirements)).toBe(1);
    expect(deriveFanLevel(250, requirements)).toBe(2);
    expect(deriveFanLevel(499, requirements)).toBe(2);
    expect(deriveFanLevel(500, requirements)).toBe(3);
    expect(deriveFanLevel(10_000, requirements)).toBe(3);
    expect(nextLevelTotalXp(0, requirements)).toBe(100);
    expect(nextLevelTotalXp(1, requirements)).toBe(250);
    expect(nextLevelTotalXp(3, requirements)).toBeNull();
    expect(latestFanTitle(0, requirements)).toEqual({ title: null, badge_code: null });
    expect(latestFanTitle(1, requirements)).toEqual({ title: "New Supporter", badge_code: "new_supporter" });
    expect(latestFanTitle(2, requirements)).toEqual({ title: "New Supporter", badge_code: "new_supporter" });
    expect(latestFanTitle(3, requirements)).toEqual({ title: "Active Fan", badge_code: "active_fan" });
  });

  it("rejects negative XP, empty config, and a flattened items payload", () => {
    expect(() => deriveFanLevel(-1, requirements)).toThrow(/XP is unreadable/);
    expect(() => deriveFanLevel(10, [])).toThrow(/Fan level config is unreadable/);
    expect(
      engagementFanLevelResponseSchema.safeParse({
        items: [{ id: "fan-level", title: "Fan level 12", detail: "120 XP" }],
      }).success,
    ).toBe(false);
    expect(
      engagementFanLevelResponseSchema.safeParse({
        fan_level: {
          level: 1,
          tier: "Bronze Fan",
          total_xp: 100,
          title: "New Supporter",
          badge_code: "new_supporter",
          next_level_total_xp: 250,
          xp_to_next_level: 150,
        },
      }).success,
    ).toBe(true);
    expect(
      engagementFanLevelResponseSchema.safeParse({
        fan_level: {
          level: 1,
          tier: "Bronze Fan",
          total_xp: -4,
          title: "New Supporter",
          badge_code: null,
          next_level_total_xp: 250,
          xp_to_next_level: 150,
        },
      }).success,
    ).toBe(false);
  });
});
