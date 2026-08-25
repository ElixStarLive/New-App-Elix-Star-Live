import { describe, expect, it } from "vitest";
import { engagementRewardWalletResponseSchema } from "../../../shared/contracts/engagement.js";
import { giftSpendableDisplay } from "./rewardWallet.js";

describe("PAGE-052 reward wallet contract", () => {
  it("keeps domains unmerged and rejects a flattened items payload", () => {
    expect(giftSpendableDisplay(10, 20, 5)).toBe(35);
    expect(giftSpendableDisplay(10, 20, 5, false)).toBe(30);
    expect(
      engagementRewardWalletResponseSchema.safeParse({
        items: [{ id: "promo", title: "Promo", detail: "12 ready to claim", claimable: true }],
      }).success,
    ).toBe(false);
    expect(
      engagementRewardWalletResponseSchema.safeParse({
        wallet: {
          purchasedCoins: 4,
          starterCoins: 50000,
          promotionalCoins: 12,
          totalGiftSpendable: 50016,
          battleEnergy: 3,
          totalXp: 50,
          fanLevel: 0,
          fanTier: "Bronze Fan",
        },
      }).success,
    ).toBe(true);
    expect(
      engagementRewardWalletResponseSchema.safeParse({
        wallet: {
          purchasedCoins: -1,
          starterCoins: 0,
          promotionalCoins: 0,
          totalGiftSpendable: 0,
          battleEnergy: 0,
          totalXp: 0,
          fanLevel: 0,
          fanTier: "Bronze Fan",
        },
      }).success,
    ).toBe(false);
  });
});
