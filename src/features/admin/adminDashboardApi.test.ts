import { describe, expect, it } from "vitest";
import { formatAdminCount, formatAdminRevenueMajor } from "@/content/adminDashboard";
import { parseAdminDashboard } from "./adminApi";

describe("PAGE-070 dashboard client parse", () => {
  it("accepts a complete server aggregate and rejects missing fields", () => {
    expect(
      parseAdminDashboard({
        dailyActiveUsers: 0,
        totalUsers: 9,
        totalVideos: 1,
        liveRooms: 0,
        totalRevenueMinor: 0,
        pendingReports: 0,
      }),
    ).toEqual({
      dailyActiveUsers: 0,
      totalUsers: 9,
      totalVideos: 1,
      liveRooms: 0,
      totalRevenueMinor: 0,
      pendingReports: 0,
    });
    expect(
      parseAdminDashboard({
        dailyActiveUsers: 4,
        totalUsers: 9,
        totalVideos: 1,
        liveRooms: 0,
        pendingReports: 0,
      }),
    ).toBeNull();
    expect(parseAdminDashboard({ dailyActiveUsers: "nope" })).toBeNull();
    expect(parseAdminDashboard(null)).toBeNull();
  });

  it("formats counts and revenue the same way as the frozen dashboard cards", () => {
    expect(formatAdminCount(0)).toBe((0).toLocaleString());
    expect(formatAdminCount(9)).toBe((9).toLocaleString());
    expect(formatAdminCount(999)).toBe((999).toLocaleString());
    expect(formatAdminCount(1000)).toBe((1000).toLocaleString());
    expect(formatAdminCount(999999)).toBe((999999).toLocaleString());
    expect(formatAdminRevenueMajor(0)).toBe(`$${(0).toLocaleString()}`);
    expect(formatAdminRevenueMajor(15000)).toBe(`$${(150).toLocaleString()}`);
  });
});
