import { describe, expect, it } from "vitest";
import { parseWalletResponse } from "./walletApi";

const valid = {
  user_id: "u1",
  coin_balance: 10,
  starter_balance: 50000,
  starter_coins: 50000,
  promotional_balance: 3,
  promotional_coins: 3,
};

describe("parseWalletResponse", () => {
  it("keeps paid, starter, and promotional separate", () => {
    expect(parseWalletResponse(valid)).toEqual({
      paidCoins: 10,
      starterCoins: 50000,
      promoCoins: 3,
    });
  });

  it("treats a successful zero paid balance as zero", () => {
    expect(parseWalletResponse({ ...valid, coin_balance: 0 })?.paidCoins).toBe(0);
  });

  it("rejects a missing paid balance instead of inventing 0", () => {
    const { coin_balance: _omit, ...rest } = valid;
    expect(parseWalletResponse(rest)).toBeNull();
  });

  it("rejects alias mismatch", () => {
    expect(parseWalletResponse({ ...valid, starter_coins: 1 })).toBeNull();
    expect(parseWalletResponse({ ...valid, promotional_coins: 9 })).toBeNull();
  });

  it("rejects test coins mixed into the money wallet", () => {
    expect(parseWalletResponse({ ...valid, testCoins: 25 })).toBeNull();
    expect(parseWalletResponse({ ...valid, test_coins: 25 })).toBeNull();
  });

  it("rejects a merged paidCoins-only payload", () => {
    expect(
      parseWalletResponse({
        paidCoins: 50013,
        promoCoins: 3,
        starterCoins: 50000,
      }),
    ).toBeNull();
  });
});
