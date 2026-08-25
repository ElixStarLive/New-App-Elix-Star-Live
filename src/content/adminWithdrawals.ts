/** Frozen PAGE-076 Admin Withdrawals labels. Operational review only — no automated payout rail. */

export const ADMIN_WITHDRAWALS_TITLE = "Withdrawals";
export const ADMIN_WITHDRAWALS_SUBTITLE =
  "Manual review only — no automated bank payout rail. Every status change records admin identity, timestamp, and note.";
export const ADMIN_WITHDRAWALS_BACK = "← Admin";
export const ADMIN_WITHDRAWALS_LOADING = "Loading…";
export const ADMIN_WITHDRAWALS_ERROR = "Failed to load payouts";
export const ADMIN_WITHDRAWALS_EMPTY = "No payouts in this status.";
export const ADMIN_WITHDRAWALS_NOTE_LABEL = "Admin note / reason (required for reject & cancel)";
export const ADMIN_WITHDRAWALS_NOTE_PLACEHOLDER = "Reason or payment reference";
export const ADMIN_WITHDRAWALS_NOTE_REQUIRED = "Note/reason required";
export const ADMIN_WITHDRAWALS_UPDATED = "Updated";
export const ADMIN_WITHDRAWALS_ACTION_FAILED = "Action failed";
export const ADMIN_WITHDRAWALS_HOME = "/admin/withdrawals";

export const ADMIN_WITHDRAWAL_STATUS_LABELS = {
  pending: "Requested",
  under_review: "Under review",
  approved: "Approved",
  paid_manually: "Paid manually",
  rejected: "Rejected",
  cancelled: "Cancelled",
} as const;

export const ADMIN_WITHDRAWAL_TABS = [
  "pending",
  "under_review",
  "approved",
  "paid_manually",
  "rejected",
  "cancelled",
  "all",
] as const;

export type AdminWithdrawalTab = (typeof ADMIN_WITHDRAWAL_TABS)[number];
export type AdminWithdrawalAction = "review" | "approve" | "reject" | "cancel" | "mark-paid";

export const ADMIN_WITHDRAWAL_ACTION_LABELS = {
  review: "Under review",
  approve: "Approve",
  reject: "Reject",
  cancel: "Cancel",
  "mark-paid": "Mark paid manually",
} as const;

export function adminWithdrawalTabLabel(tab: AdminWithdrawalTab): string {
  if (tab === "all") return "All";
  return ADMIN_WITHDRAWAL_STATUS_LABELS[tab];
}

export function formatAdminWithdrawalStatus(status: string): string {
  return status in ADMIN_WITHDRAWAL_STATUS_LABELS
    ? ADMIN_WITHDRAWAL_STATUS_LABELS[status as keyof typeof ADMIN_WITHDRAWAL_STATUS_LABELS]
    : status;
}

export function formatAdminWithdrawalPence(pence: number): string {
  if (!Number.isInteger(pence) || pence < 0) return "—";
  const pounds = Math.trunc(pence / 100);
  const remainder = pence % 100;
  return `£${pounds}.${String(remainder).padStart(2, "0")}`;
}

export function formatAdminWithdrawalCreator(row: {
  displayName: string;
  username: string;
  userId: string;
}): string {
  return row.displayName || row.username || row.userId;
}

export function actionRequiresAdminNote(action: AdminWithdrawalAction): boolean {
  return action === "reject" || action === "cancel";
}
