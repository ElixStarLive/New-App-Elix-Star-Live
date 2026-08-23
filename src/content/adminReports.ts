/** Frozen PAGE-072 Admin Reports labels. Status + warning only — no ban/economy. */

export const ADMIN_REPORTS_TITLE = "Reports Queue";
export const ADMIN_REPORTS_LOADING = "Loading...";
export const ADMIN_REPORTS_ERROR = "Failed to load reports";
export const ADMIN_REPORTS_EMPTY = "No reports found";
export const ADMIN_REPORTS_NO_DETAILS = "No details provided";
export const ADMIN_REPORTS_UNKNOWN_REPORTER = "Unknown";
export const ADMIN_REPORTS_RESOLVE_SUCCESS = "Report resolved";
export const ADMIN_REPORTS_RESOLVE_FAILURE = "Failed to resolve report";
export const ADMIN_REPORTS_FILTER_PENDING = "Pending";
export const ADMIN_REPORTS_FILTER_ALL = "All";
export const ADMIN_REPORTS_REMOVE = "Remove Content";
export const ADMIN_REPORTS_WARN = "Warn User";
export const ADMIN_REPORTS_NO_ACTION = "No Action";
export const ADMIN_REPORTS_VIEW = "View";
export const ADMIN_REPORTS_HOME = "/admin/reports";
export const ADMIN_REPORTS_REPORTED_BY = "Reported by:";

export const ADMIN_REPORTS_WARNING_TITLE = "Content warning";
export const ADMIN_REPORTS_WARNING_BODY =
  "Your content was reviewed by moderators and may violate our community guidelines. Repeated violations can lead to a ban.";

export type AdminReportsFilter = "pending" | "all";
export type AdminReportAction = "removed" | "warned" | "no_action";

export function isAdminReportQueueStatus(status: string): boolean {
  return status === "open" || status === "pending";
}

export function formatAdminReportReason(reason: string): string {
  return reason.replace("_", " ").toUpperCase();
}

export function formatAdminReportCreated(value: string): string {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";
  return date.toLocaleString();
}

export function countQueuedAdminReports(reports: Array<{ status: string }>): number {
  return reports.filter((row) => isAdminReportQueueStatus(row.status)).length;
}
