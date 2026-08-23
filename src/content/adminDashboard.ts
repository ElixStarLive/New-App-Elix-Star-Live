/** Frozen PAGE-070 Admin Dashboard labels. Navigation only — no child-page actions. */

export const ADMIN_DASHBOARD_TITLE = "Admin Dashboard";
export const ADMIN_DASHBOARD_LOADING = "Loading...";
export const ADMIN_DASHBOARD_ERROR = "Failed to load dashboard data";
export const ADMIN_DASHBOARD_ACTIONS_TITLE = "Quick Actions";
export const ADMIN_HOME = "/admin";

export const ADMIN_DASHBOARD_METRICS = [
  { key: "dailyActiveUsers", title: "Daily Active Users", color: "blue" },
  { key: "totalUsers", title: "Total Users", color: "green" },
  { key: "totalVideos", title: "Total Videos", color: "purple" },
  { key: "liveRooms", title: "Live Rooms", color: "red" },
  { key: "totalRevenue", title: "Total Revenue", color: "yellow" },
  { key: "pendingReports", title: "Pending Reports", color: "orange" },
] as const;

export const ADMIN_DASHBOARD_ACTIONS = [
  { path: "/admin/users", label: "Manage Users" },
  { path: "/admin/reports", label: "Review Reports" },
  { path: "/admin/economy", label: "Economy Controls" },
  { path: "/admin/monetisation", label: "Monetisation" },
  { path: "/admin/purchases", label: "IAP & Shop Purchases" },
  { path: "/admin/withdrawals", label: "Withdrawals" },
  { path: "/admin/rising-stars", label: "Rising Stars" },
  { path: "/admin/progression", label: "Starter Coins & XP" },
] as const;

export function formatAdminCount(value: number): string {
  return value.toLocaleString();
}

export function formatAdminRevenueMajor(minor: number): string {
  return `$${(minor / 100).toLocaleString()}`;
}
