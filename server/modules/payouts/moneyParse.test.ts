import { describe, expect, it } from "vitest";
import { AppError } from "../../middleware/errors.js";
import { parseCreatorWithdrawBody, penceFromDb } from "./moneyParse.js";
import { maskPayoutMethodDetails, parsePayoutMethodBody } from "./methods.js";

describe("PAGE-045 money parse", () => {
  it("accepts integer pence and rejects malformed amounts", () => {
    expect(parseCreatorWithdrawBody({ amount_pence: 5000, idempotency_key: "idem-key-1" })).toEqual({
      amountPence: 5000,
      idempotencyKey: "idem-key-1",
    });
    expect(() => parseCreatorWithdrawBody({ amount_pence: 0, idempotency_key: "idem-key-1" })).toThrow(AppError);
    expect(() => parseCreatorWithdrawBody({ amount_pence: -1, idempotency_key: "idem-key-1" })).toThrow(AppError);
    expect(() => parseCreatorWithdrawBody({ amount_pence: 1.5, idempotency_key: "idem-key-1" })).toThrow(AppError);
    expect(() => parseCreatorWithdrawBody({ amount_pence: Number.NaN, idempotency_key: "idem-key-1" })).toThrow(
      AppError,
    );
    expect(() => parseCreatorWithdrawBody({ amount_pence: Number.POSITIVE_INFINITY, idempotency_key: "idem-key-1" })).toThrow(
      AppError,
    );
    expect(() => parseCreatorWithdrawBody({ amount_pence: "5000", idempotency_key: "idem-key-1" })).toThrow(AppError);
    expect(() => parseCreatorWithdrawBody({ amountPence: 5000, idempotencyKey: "idem-key-1" })).toThrow(AppError);
    try {
      parseCreatorWithdrawBody({ amount_pence: 5000 });
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe("idempotency_key_required");
    }
  });

  it("reads database pence as integers", () => {
    expect(penceFromDb("12345")).toBe(12345);
    expect(penceFromDb(0)).toBe(0);
    expect(() => penceFromDb("12.3")).toThrow(AppError);
  });

  it("masks payout method details", () => {
    expect(maskPayoutMethodDetails("bank", { account_name: "A", iban_or_account: "GB82WEST12345698765432" })).toEqual({
      account_name: "A",
      iban_or_account: "••••5432",
    });
    expect(maskPayoutMethodDetails("paypal", { name: "A", email: "maya@example.com" })).toEqual({
      name: "A",
      email: "m•••@example.com",
    });
    expect(parsePayoutMethodBody({ type: "paypal", details: { name: "A", email: "maya@example.com" } }).type).toBe(
      "paypal",
    );
  });
});
