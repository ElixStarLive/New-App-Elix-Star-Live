import { describe, expect, it } from "vitest";
import { parseAdminEconomy } from "./adminApi";

describe("PAGE-073 admin economy parse", () => {
  it("accepts the exact economy lists and rejects partial or wallet-sum payloads", () => {
    expect(
      parseAdminEconomy({
        gifts: [{ id: "rose", name: "Rose", coinCost: 1, isActive: true }],
        packages: [
          {
            id: "google:coins100",
            productId: "coins100",
            provider: "google",
            title: "100 Coins",
            coins: 100,
            priceDisplay: "£0.99",
          },
        ],
        boosters: [],
      }),
    ).toEqual({
      gifts: [{ id: "rose", name: "Rose", coinCost: 1, isActive: true }],
      packages: [
        {
          id: "google:coins100",
          productId: "coins100",
          provider: "google",
          title: "100 Coins",
          coins: 100,
          priceDisplay: "£0.99",
        },
      ],
      boosters: [],
    });
    expect(parseAdminEconomy({ gifts: [], packages: [], boosters: [] })).toEqual({
      gifts: [],
      packages: [],
      boosters: [],
    });
    expect(
      parseAdminEconomy({
        gifts: [{ id: "rose", name: "Rose", coinCost: 1 }],
        packages: [],
        boosters: [],
      }),
    ).toBeNull();
    expect(parseAdminEconomy({ rows: [{ paid: "1", promo: "2", starter: "3" }] })).toBeNull();
    expect(parseAdminEconomy({ gifts: [], packages: [] })).toBeNull();
    expect(parseAdminEconomy(null)).toBeNull();
  });
});
