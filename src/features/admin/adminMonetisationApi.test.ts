import { describe, expect, it } from "vitest";
import { parseAdminMonetisation } from "./adminApi";

describe("PAGE-074 admin monetisation parse", () => {
  const valid = {
    config: { giftCreatorPct: 60, giftPlatformPct: 40, giftSettlementHours: 72 },
    dashboard: { currency: "GBP" },
    report: { shop: { c: 0, pence: 0 } },
    withdrawals: [
      {
        id: "wd-1",
        user_id: "user-1",
        amount_pence: 2500,
        status: "requested",
        created_at: "2026-08-22T00:00:00.000Z",
      },
    ],
  };

  it("accepts the exact PAGE-074 bundle and rejects partial or invented payloads", () => {
    expect(parseAdminMonetisation(valid)).toEqual(valid);
    expect(
      parseAdminMonetisation({
        ...valid,
        withdrawals: [],
      }),
    ).toEqual({ ...valid, withdrawals: [] });
    expect(parseAdminMonetisation({ rows: [{ provider: "google", coins: 10 }] })).toBeNull();
    expect(parseAdminMonetisation({ config: valid.config, dashboard: {}, report: {} })).toBeNull();
    expect(
      parseAdminMonetisation({
        ...valid,
        config: { giftCreatorPct: 60, giftPlatformPct: 41, giftSettlementHours: 72 },
      }),
    ).toBeNull();
    expect(
      parseAdminMonetisation({
        ...valid,
        config: { giftCreatorPct: "60", giftPlatformPct: 40, giftSettlementHours: 72 },
      }),
    ).toBeNull();
    expect(parseAdminMonetisation(null)).toBeNull();
  });
});
