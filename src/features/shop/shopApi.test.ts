import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { canonicalShopRouteItemId, parseShopItem, selectShopItemByCanonicalId, type ShopItem } from "./shopApi";

const hat: ShopItem = {
  id: "11111111-1111-4111-8111-111111111111",
  sellerId: "22222222-2222-4222-8222-222222222222",
  name: "Hat",
  title: "Hat",
  description: "",
  price: 10,
  pricePence: 1000,
  priceLabel: "£10.00",
  imageUrl: null,
  category: "other",
};

const cap: ShopItem = {
  ...hat,
  id: "33333333-3333-4333-8333-333333333333",
  name: "Cap",
  title: "Cap",
};

describe("PAGE-036 shop item parse", () => {
  it("requires canonical seller and title and does not invent them", () => {
    expect(parseShopItem({ id: "x" })).toBeNull();
    expect(
      parseShopItem({
        id: "11111111-1111-4111-8111-111111111111",
        sellerId: "22222222-2222-4222-8222-222222222222",
        title: "Hat",
        pricePence: 1250,
        category: "clothing",
      }),
    ).toMatchObject({
      title: "Hat",
      price: 12.5,
      priceLabel: "£12.50",
      sellerId: "22222222-2222-4222-8222-222222222222",
    });
  });

  it("rejects legacy user_id / price / image_url dual-read shapes", () => {
    expect(
      parseShopItem({
        id: "11111111-1111-4111-8111-111111111111",
        user_id: "22222222-2222-4222-8222-222222222222",
        name: "Hat",
        price: 12.5,
        image_url: "https://cdn.example/hat.png",
      }),
    ).toBeNull();
  });

  it("uses NEW-only sellerId query and paymentStatus reader", () => {
    const src = readFileSync(resolve(process.cwd(), "src/features/shop/shopApi.ts"), "utf8");
    expect(src).toMatch(/paymentStatus: typeof data\.paymentStatus === "string"/);
    expect(src).not.toMatch(/payment_status/);
    expect(src).toMatch(/\?sellerId=/);
    expect(src).not.toMatch(/\?userId=/);
  });
});

describe("PAGE-037 canonical shop item id", () => {
  it("does not fall back to another catalog item", () => {
    expect(canonicalShopRouteItemId(undefined)).toBeNull();
    expect(canonicalShopRouteItemId("  ")).toBeNull();
    expect(canonicalShopRouteItemId("not-a-real-item")).toBe("not-a-real-item");
    expect(selectShopItemByCanonicalId([hat, cap], null)).toBeNull();
    expect(selectShopItemByCanonicalId([hat, cap], hat.id)?.title).toBe("Hat");
    expect(selectShopItemByCanonicalId([hat, cap], cap.id)?.title).toBe("Cap");
    expect(selectShopItemByCanonicalId([hat, cap], "not-a-real-item")).toBeNull();
    expect(selectShopItemByCanonicalId([hat, cap], "44444444-4444-4444-8444-444444444444")).toBeNull();
  });
});
