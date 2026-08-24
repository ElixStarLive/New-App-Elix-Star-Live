import { describe, expect, it } from "vitest";
import { ADMIN_DAU_QUERY, ADMIN_DASHBOARD_QUERY, mapDashboardRow, parseAdminCount } from "./dashboard.js";

describe("PAGE-070 admin dashboard contract", () => {
  it("uses a 24-hour distinct-session DAU window on auth_sessions", () => {
    expect(ADMIN_DAU_QUERY).toContain("COUNT(DISTINCT user_id)");
    expect(ADMIN_DAU_QUERY).toContain("auth_sessions");
    expect(ADMIN_DAU_QUERY).toContain("INTERVAL '24 hours'");
    expect(ADMIN_DAU_QUERY).not.toContain("elix_auth_sessions");
    expect(ADMIN_DASHBOARD_QUERY).toContain("INTERVAL '24 hours'");
    expect(ADMIN_DASHBOARD_QUERY).toContain("shop_purchases");
    expect(ADMIN_DASHBOARD_QUERY).toContain("amount_pence");
    expect(ADMIN_DASHBOARD_QUERY).not.toContain("processed_purchases");
    expect(ADMIN_DASHBOARD_QUERY).not.toContain("SUM(coins)");
  });

  it("rejects malformed counts instead of coercing them to zero", () => {
    expect(parseAdminCount("3")).toBe(3);
    expect(parseAdminCount(0)).toBe(0);
    expect(parseAdminCount("0")).toBe(0);
    expect(parseAdminCount(undefined)).toBeNull();
    expect(parseAdminCount(null)).toBeNull();
    expect(parseAdminCount("nope")).toBeNull();
    expect(parseAdminCount(-1)).toBeNull();
    expect(mapDashboardRow(undefined)).toBeNull();
    expect(
      mapDashboardRow({
        users: "2",
        videos: "1",
        live: "0",
        reports: "4",
        revenue: "150",
        dau: "7",
      }),
    ).toEqual({
      dailyActiveUsers: 7,
      totalUsers: 2,
      totalVideos: 1,
      liveRooms: 0,
      totalRevenueMinor: 150,
      pendingReports: 4,
    });
    expect(
      mapDashboardRow({
        users: "2",
        videos: "1",
        live: "0",
        reports: "4",
        revenue: "150",
      }),
    ).toBeNull();
  });
});
