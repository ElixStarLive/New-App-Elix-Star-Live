import { describe, expect, it } from "vitest";
import { AppError } from "../../middleware/errors.js";
import {
  ADMIN_GIFT_COIN_COST_MAX,
  ADMIN_GIFT_ID_MAX,
  ADMIN_GIFTS_LIST_SQL,
  ADMIN_PACKAGES_LIST_SQL,
  formatAdminPackagePriceDisplay,
  parseAdminGiftId,
  parseAdminGiftPatch,
} from "./economy.js";

describe("PAGE-073 admin economy contract", () => {
  it("lists gifts and coin packages without wallet aggregates", () => {
    expect(ADMIN_GIFTS_LIST_SQL).toContain("FROM gifts");
    expect(ADMIN_GIFTS_LIST_SQL).toContain("ORDER BY sort_order ASC, id ASC");
    expect(ADMIN_GIFTS_LIST_SQL).not.toContain("wallet_balances");
    expect(ADMIN_GIFTS_LIST_SQL).not.toContain("paid_coins");
    expect(ADMIN_PACKAGES_LIST_SQL).toContain("FROM coin_packages");
    expect(ADMIN_PACKAGES_LIST_SQL).toContain("price_pence");
    expect(ADMIN_PACKAGES_LIST_SQL).not.toContain("wallet_balances");
  });

  it("resolves a canonical gift id only", () => {
    expect(parseAdminGiftId(" rose ")).toBe("rose");
    expect(() => parseAdminGiftId("")).toThrow(AppError);
    expect(() => parseAdminGiftId("   ")).toThrow(/giftId is required/);
    expect(() => parseAdminGiftId("x".repeat(ADMIN_GIFT_ID_MAX + 1))).toThrow(/Invalid gift/);
    expect(() => parseAdminGiftId(12)).toThrow(/giftId is required/);
  });

  it("whitelists coin_cost and is_active and rejects mass assignment", () => {
    expect(parseAdminGiftPatch({ coin_cost: 25 })).toEqual({ coin_cost: 25 });
    expect(parseAdminGiftPatch({ is_active: false })).toEqual({ is_active: false });
    expect(parseAdminGiftPatch({ coin_cost: 10, is_admin: true, updatedBy: "attacker" })).toEqual({
      coin_cost: 10,
    });
    expect(() => parseAdminGiftPatch({ is_admin: true })).toThrow(/No fields to update/);
    expect(() => parseAdminGiftPatch({})).toThrow(/No fields to update/);
    expect(() => parseAdminGiftPatch({ coin_cost: 0 })).toThrow(/Invalid price/);
    expect(() => parseAdminGiftPatch({ coin_cost: -4 })).toThrow(/Invalid price/);
    expect(() => parseAdminGiftPatch({ coin_cost: 1.5 })).toThrow(/Invalid price/);
    expect(() => parseAdminGiftPatch({ coin_cost: "12" })).toThrow(/Invalid price/);
    expect(() => parseAdminGiftPatch({ coin_cost: Number.NaN })).toThrow(/Invalid price/);
    expect(() => parseAdminGiftPatch({ coin_cost: ADMIN_GIFT_COIN_COST_MAX + 1 })).toThrow(/Invalid price/);
    expect(() => parseAdminGiftPatch({ coin_cost: null })).toThrow(/Invalid price/);
    expect(() => parseAdminGiftPatch({ is_active: "true" })).toThrow(/Invalid status/);
  });

  it("formats package pence as presentation only", () => {
    expect(formatAdminPackagePriceDisplay(99)).toBe("£0.99");
    expect(formatAdminPackagePriceDisplay(119999)).toBe("£1199.99");
    expect(formatAdminPackagePriceDisplay(0)).toBe("");
    expect(formatAdminPackagePriceDisplay(1.5)).toBe("");
  });
});
