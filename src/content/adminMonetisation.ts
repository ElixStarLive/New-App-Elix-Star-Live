/** Frozen PAGE-074 Admin Monetisation labels. Config + reports only — no withdrawal operations. */

export const ADMIN_MONETISATION_TITLE = "Monetisation";
export const ADMIN_MONETISATION_LOADING = "Loading...";
export const ADMIN_MONETISATION_ERROR = "Failed to load monetisation admin";
export const ADMIN_MONETISATION_HOME = "/admin/monetisation";
export const ADMIN_MONETISATION_AUDIT_REASON = "Audit reason";
export const ADMIN_MONETISATION_REASON_DEFAULT = "Admin update";
export const ADMIN_MONETISATION_GIFTS_TITLE = "Gifts / Subscriptions";
export const ADMIN_MONETISATION_GIFT_CREATOR = "Gift creator %";
export const ADMIN_MONETISATION_GIFT_PLATFORM = "Gift platform %";
export const ADMIN_MONETISATION_GIFT_HOURS = "Gift settlement hours";
export const ADMIN_MONETISATION_SAVE = "Save";
export const ADMIN_MONETISATION_SAVED = "Saved";
export const ADMIN_MONETISATION_SAVE_FAILED = "Save failed";
export const ADMIN_MONETISATION_INVALID_VALUE = "Invalid value";
export const ADMIN_MONETISATION_REWARDS_TITLE = "Creator Rewards";
export const ADMIN_MONETISATION_MILESTONES = "Milestones (views → pence)";
export const ADMIN_MONETISATION_DASHBOARD_TITLE = "Ops dashboard";
export const ADMIN_MONETISATION_REPORT_TITLE = "Revenue report";
export const ADMIN_MONETISATION_RECONCILE_TITLE = "Reconciliation";
export const ADMIN_MONETISATION_FRAUD_TITLE = "Fraud reviews";
export const ADMIN_MONETISATION_FRAUD_EMPTY = "No open fraud reviews";
export const ADMIN_MONETISATION_FORYOU_TITLE = "For You algorithm";
export const ADMIN_MONETISATION_FORYOU_UNAVAILABLE = "For You config unavailable (migrate first)";
export const ADMIN_MONETISATION_WITHDRAWALS_TITLE = "GBP withdrawals";
export const ADMIN_MONETISATION_WITHDRAWALS_EMPTY = "No GBP withdrawals";

export function parseMonetisationIntegerInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^-?\d+$/.test(trimmed)) return null;
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isSafeInteger(parsed)) return null;
  return parsed;
}
