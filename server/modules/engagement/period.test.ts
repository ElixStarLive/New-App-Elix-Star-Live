import { describe, expect, it } from "vitest";
import { missionPeriodKey, utcDateKey, utcWeekKey } from "./period.js";

describe("PAGE-048 mission period keys", () => {
  it("uses UTC day for daily and ISO week for weekly", () => {
    const day = new Date("2026-08-21T23:30:00.000Z");
    expect(utcDateKey(day)).toBe("2026-08-21");
    expect(utcWeekKey(day)).toBe("2026-W34");
    expect(missionPeriodKey("daily", day)).toBe("2026-08-21");
    expect(missionPeriodKey("weekly", day)).toBe("2026-W34");
  });

  it("does not follow a later local clock offset for the UTC date", () => {
    const justBeforeUtcMidnight = new Date("2026-08-21T23:59:59.000Z");
    expect(missionPeriodKey("daily", justBeforeUtcMidnight)).toBe("2026-08-21");
    expect(missionPeriodKey("daily", new Date("2026-08-22T00:00:00.000Z"))).toBe("2026-08-22");
  });
});
