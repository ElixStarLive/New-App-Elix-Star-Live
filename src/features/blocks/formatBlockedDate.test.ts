import { describe, expect, it } from "vitest";
import { formatBlockedDate } from "./formatBlockedDate";

describe("PAGE-044 blocked date labels", () => {
  const now = Date.parse("2026-08-21T12:00:00.000Z");

  it("labels today, yesterday, days, weeks, and locale dates", () => {
    expect(formatBlockedDate("2026-08-21T08:00:00.000Z", now)).toBe("today");
    expect(formatBlockedDate("2026-08-20T12:00:00.000Z", now)).toBe("yesterday");
    expect(formatBlockedDate("2026-08-18T12:00:00.000Z", now)).toBe("3 days ago");
    expect(formatBlockedDate("2026-08-10T12:00:00.000Z", now)).toBe("1 weeks ago");
    expect(formatBlockedDate("2026-06-01T12:00:00.000Z", now)).toBe(new Date("2026-06-01T12:00:00.000Z").toLocaleDateString());
  });

  it("returns empty for missing or invalid dates", () => {
    expect(formatBlockedDate("", now)).toBe("");
    expect(formatBlockedDate("not-a-date", now)).toBe("");
  });
});
