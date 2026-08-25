import { describe, expect, it } from "vitest";
import { formatAdminWithdrawalPence } from "@/content/adminWithdrawals";
import { parseAdminWithdrawals } from "./adminApi";

const validRow = {
  id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
  userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  username: "creator1",
  displayName: "Creator One",
  amountPence: 5000,
  currency: "GBP",
  status: "pending",
  adminNote: null,
  processedBy: null,
  processedAt: null,
  createdAt: "2026-08-22T00:00:00.000Z",
};

describe("PAGE-076 admin withdrawals parse", () => {
  it("accepts sanitized withdrawal lists and rejects secrets or fake money", () => {
    expect(parseAdminWithdrawals({ withdrawals: [validRow] })).toEqual([validRow]);
    expect(parseAdminWithdrawals({ withdrawals: [] })).toEqual([]);
    expect(parseAdminWithdrawals({ rows: [validRow] })).toBeNull();
    expect(parseAdminWithdrawals({ payouts: [validRow] })).toBeNull();
    expect(
      parseAdminWithdrawals({
        withdrawals: [{ ...validRow, client_secret: "sk_live_secret" }],
      }),
    ).toBeNull();
    expect(
      parseAdminWithdrawals({
        withdrawals: [{ ...validRow, details: { iban: "GB82WEST12345698765432" } }],
      }),
    ).toBeNull();
    expect(parseAdminWithdrawals({ withdrawals: [{ ...validRow, amountPence: 1.5 }] })).toBeNull();
    expect(parseAdminWithdrawals({ withdrawals: [{ ...validRow, amountPence: 0 }] })).toBeNull();
    expect(parseAdminWithdrawals({ withdrawals: [{ ...validRow, currency: "USD" }] })).toBeNull();
    expect(formatAdminWithdrawalPence(5000)).toBe("£50.00");
    expect(formatAdminWithdrawalPence(1)).toBe("£0.01");
    expect(formatAdminWithdrawalPence(1.5)).toBe("—");
  });
});
