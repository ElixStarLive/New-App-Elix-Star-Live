import { describe, expect, it } from "vitest";
import { achievementBarPercent } from "./achievementProgress.js";

describe("PAGE-051 achievement bar presentation", () => {
  it("stays finite for zero, partial, exact, overshoot, and malformed values", () => {
    expect(achievementBarPercent(0, 100)).toBe(0);
    expect(achievementBarPercent(50, 100)).toBe(50);
    expect(achievementBarPercent(99, 100)).toBe(99);
    expect(achievementBarPercent(100, 100)).toBe(100);
    expect(achievementBarPercent(140, 100)).toBe(100);
    expect(achievementBarPercent(-8, 10)).toBe(0);
    expect(achievementBarPercent(5, 0)).toBe(100);
    expect(achievementBarPercent(Number.NaN, 10)).toBe(0);
    expect(achievementBarPercent(4, Number.POSITIVE_INFINITY)).toBe(0);
    expect(Number.isFinite(achievementBarPercent(4, 0))).toBe(true);
  });
});
