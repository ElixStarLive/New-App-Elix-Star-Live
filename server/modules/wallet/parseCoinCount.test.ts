import { describe, expect, it } from "vitest";
import { parseCoinCount, walletApiFromRow } from "./ledger.js";

describe("wallet coin parsing", () => {
  it("accepts safe integers and rejects junk", () => {
    expect(parseCoinCount(0)).toBe(0);
    expect(parseCoinCount("1000")).toBe(1000);
    expect(parseCoinCount(-1)).toBeNull();
    expect(parseCoinCount("1.5")).toBeNull();
    expect(parseCoinCount("")).toBeNull();
    expect(parseCoinCount(null)).toBeNull();
  });

  it("emits unmerged GET /api/wallet fields", () => {
    const dto = walletApiFromRow(
      { paid_coins: "0", promo_coins: "4", starter_coins: "50000" },
      "user-1",
    );
    expect(dto).toEqual({
      user_id: "user-1",
      coin_balance: 0,
      starter_balance: 50000,
      starter_coins: 50000,
      promotional_balance: 4,
      promotional_coins: 4,
    });
    expect(dto.coin_balance).not.toBe(dto.starter_balance + dto.promotional_balance);
  });
});
