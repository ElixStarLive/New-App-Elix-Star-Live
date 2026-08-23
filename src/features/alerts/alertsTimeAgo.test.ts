import { describe, expect, it, vi } from "vitest";
import { alertsTimeAgo } from "./alertsTimeAgo";

describe("PAGE-032 alerts time ago", () => {
  it("uses the Alerts page units from seconds through months", () => {
    const now = Date.UTC(2026, 7, 21, 16, 0, 0);
    vi.spyOn(Date, "now").mockReturnValue(now);
    expect(alertsTimeAgo(new Date(now - 12_000).toISOString())).toBe("12s");
    expect(alertsTimeAgo(new Date(now - 5 * 60_000).toISOString())).toBe("5m");
    expect(alertsTimeAgo(new Date(now - 3 * 3_600_000).toISOString())).toBe("3h");
    expect(alertsTimeAgo(new Date(now - 2 * 86_400_000).toISOString())).toBe("2d");
    expect(alertsTimeAgo(new Date(now - 14 * 86_400_000).toISOString())).toBe("2w");
    expect(alertsTimeAgo(new Date(now - 40 * 86_400_000).toISOString())).toBe("1mo");
    expect(alertsTimeAgo("not-a-date")).toBe("");
  });
});
