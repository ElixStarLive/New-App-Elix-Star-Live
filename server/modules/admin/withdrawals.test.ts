import { describe, expect, it } from "vitest";
import {
  ADMIN_WITHDRAWAL_ACTIONS,
  ADMIN_WITHDRAWAL_LIMIT,
  ADMIN_WITHDRAWAL_NOTE_MAX,
  ADMIN_WITHDRAWAL_STATUSES,
  actionRequiresNote,
  allowedSourcesForAction,
  isAdminWithdrawalAction,
  isAdminWithdrawalId,
  isValidWithdrawalTransition,
  moneyEffectForAction,
  parseAdminWithdrawalNote,
  parseAdminWithdrawalStatusFilter,
  resultingStatusForAction,
} from "./withdrawals.js";

describe("PAGE-076 admin withdrawals contract", () => {
  it("uses the frozen status enum, limit, and action matrix", () => {
    expect(ADMIN_WITHDRAWAL_STATUSES).toEqual([
      "pending",
      "under_review",
      "approved",
      "paid_manually",
      "rejected",
      "cancelled",
    ]);
    expect(ADMIN_WITHDRAWAL_ACTIONS).toEqual(["review", "approve", "reject", "cancel", "mark-paid"]);
    expect(ADMIN_WITHDRAWAL_LIMIT).toBe(100);
    expect(ADMIN_WITHDRAWAL_NOTE_MAX).toBe(500);
    expect(parseAdminWithdrawalStatusFilter(undefined)).toBe("pending");
    expect(parseAdminWithdrawalStatusFilter("all")).toBe("all");
    expect(() => parseAdminWithdrawalStatusFilter("paid")).toThrow(/Invalid status/);
    expect(() => parseAdminWithdrawalStatusFilter("pending'; drop table withdrawals_gbp;--")).toThrow(
      /Invalid status/,
    );
    expect(isAdminWithdrawalAction("approve")).toBe(true);
    expect(isAdminWithdrawalAction("chargeback")).toBe(false);
    expect(isAdminWithdrawalAction("explode")).toBe(false);
    expect(isAdminWithdrawalId("ffffffff-ffff-4fff-8fff-ffffffffffff")).toBe(true);
    expect(isAdminWithdrawalId("not-a-uuid")).toBe(false);
  });

  it("enforces the exact transition matrix and money effects", () => {
    expect(allowedSourcesForAction("review")).toEqual(["pending"]);
    expect(resultingStatusForAction("review")).toBe("under_review");
    expect(moneyEffectForAction("review")).toBe("none");
    expect(actionRequiresNote("review")).toBe(false);

    expect(allowedSourcesForAction("approve")).toEqual(["pending", "under_review"]);
    expect(resultingStatusForAction("approve")).toBe("approved");
    expect(moneyEffectForAction("approve")).toBe("hold_to_withdrawn");

    expect(allowedSourcesForAction("reject")).toEqual(["pending", "under_review"]);
    expect(resultingStatusForAction("reject")).toBe("rejected");
    expect(moneyEffectForAction("reject")).toBe("hold_to_available");
    expect(actionRequiresNote("reject")).toBe(true);

    expect(allowedSourcesForAction("cancel")).toEqual(["pending", "under_review"]);
    expect(resultingStatusForAction("cancel")).toBe("cancelled");
    expect(moneyEffectForAction("cancel")).toBe("hold_to_available");
    expect(actionRequiresNote("cancel")).toBe(true);

    expect(allowedSourcesForAction("mark-paid")).toEqual(["approved"]);
    expect(resultingStatusForAction("mark-paid")).toBe("paid_manually");
    expect(moneyEffectForAction("mark-paid")).toBe("none");

    expect(isValidWithdrawalTransition("pending", "review")).toBe(true);
    expect(isValidWithdrawalTransition("under_review", "review")).toBe(false);
    expect(isValidWithdrawalTransition("paid_manually", "approve")).toBe(false);
    expect(isValidWithdrawalTransition("approved", "cancel")).toBe(false);
    expect(isValidWithdrawalTransition("approved", "mark-paid")).toBe(true);
    expect(isValidWithdrawalTransition("pending", "mark-paid")).toBe(false);
  });

  it("requires reject/cancel notes and trims optional notes", () => {
    expect(parseAdminWithdrawalNote("  paid ref 12  ", false)).toBe("paid ref 12");
    expect(parseAdminWithdrawalNote("", false)).toBeNull();
    expect(() => parseAdminWithdrawalNote("", true)).toThrow(/admin_note required/);
    expect(() => parseAdminWithdrawalNote("   ", true)).toThrow(/admin_note required/);
    expect(() => parseAdminWithdrawalNote("x".repeat(501), false)).toThrow(/too long/);
  });
});
