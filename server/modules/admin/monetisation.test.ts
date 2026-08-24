import { describe, expect, it } from "vitest";
import { AppError } from "../../middleware/errors.js";
import {
  ADMIN_MONETISATION_CONFIG_FIELDS,
  ADMIN_MONETISATION_HOURS_MAX,
  ADMIN_MONETISATION_REASON_MAX,
  parseAdminMonetisationPatch,
  parseAdminMonetisationReason,
} from "./monetisation.js";

describe("PAGE-074 admin monetisation contract", () => {
  it("whitelists only the three Neon monetisation_config fields", () => {
    expect([...ADMIN_MONETISATION_CONFIG_FIELDS]).toEqual([
      "giftCreatorPct",
      "giftPlatformPct",
      "giftSettlementHours",
    ]);
    expect(parseAdminMonetisationPatch({ field: "giftCreatorPct", value: 61, updatedBy: "attacker" })).toEqual({
      field: "giftCreatorPct",
      value: 61,
      reason: null,
    });
    expect(parseAdminMonetisationPatch({ field: "giftPlatformPct", value: 40, is_admin: true })).toEqual({
      field: "giftPlatformPct",
      value: 40,
      reason: null,
    });
    expect(
      parseAdminMonetisationPatch({ field: "giftSettlementHours", value: 72, reason: " Admin update " }),
    ).toEqual({
      field: "giftSettlementHours",
      value: 72,
      reason: "Admin update",
    });
  });

  it("rejects unknown fields, non-integers, and out-of-range values", () => {
    expect(() => parseAdminMonetisationPatch({})).toThrow(/UNKNOWN_FIELD/);
    expect(() => parseAdminMonetisationPatch({ field: "withdrawMinPence", value: 1000 })).toThrow(/UNKNOWN_FIELD/);
    expect(() => parseAdminMonetisationPatch({ field: "giftCreatorPct", value: "60" })).toThrow(/Invalid value/);
    expect(() => parseAdminMonetisationPatch({ field: "giftCreatorPct", value: 60.5 })).toThrow(/Invalid value/);
    expect(() => parseAdminMonetisationPatch({ field: "giftCreatorPct", value: Number.NaN })).toThrow(/Invalid value/);
    expect(() => parseAdminMonetisationPatch({ field: "giftCreatorPct", value: null })).toThrow(/UNKNOWN_FIELD|Invalid value/);
    expect(() => parseAdminMonetisationPatch({ field: "giftCreatorPct", value: -1 })).toThrow(/Invalid percentage/);
    expect(() => parseAdminMonetisationPatch({ field: "giftCreatorPct", value: 101 })).toThrow(/Invalid percentage/);
    expect(() => parseAdminMonetisationPatch({ field: "giftSettlementHours", value: -1 })).toThrow(
      /Invalid settlement hours/,
    );
    expect(() => parseAdminMonetisationPatch({ field: "giftSettlementHours", value: ADMIN_MONETISATION_HOURS_MAX + 1 })).toThrow(
      /Invalid settlement hours/,
    );
    expect(() => parseAdminMonetisationReason("x".repeat(ADMIN_MONETISATION_REASON_MAX + 1))).toThrow(AppError);
    expect(() => parseAdminMonetisationReason(12)).toThrow(/Invalid reason/);
  });
});
