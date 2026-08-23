import { describe, expect, it } from "vitest";
import { parseCoinCatalogResponse } from "./iapApi";

describe("PAGE-038 coin catalog parse", () => {
  it("fail-closes instead of inventing packages or falling back to another SKU", () => {
    expect(parseCoinCatalogResponse({}, "google")).toEqual([]);
    expect(parseCoinCatalogResponse({ packages: [{ productId: "coins100" }] }, "google")).toEqual([]);
    expect(
      parseCoinCatalogResponse(
        {
          packages: [
            { productId: "coins100", provider: "google", coins: 100, label: "100 Coins" },
            { productId: "coins500", provider: "apple", coins: 500, label: "500 Coins" },
          ],
        },
        "google",
      ),
    ).toEqual([
      {
        productId: "coins100",
        provider: "google",
        coins: 100,
        label: "100 Coins",
        title: "100 Coins",
        price: "",
      },
    ]);
  });
});
