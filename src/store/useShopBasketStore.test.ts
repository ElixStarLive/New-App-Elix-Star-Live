import { beforeEach, describe, expect, it } from "vitest";
import type { ShopItem } from "@/features/shop/shopApi";
import { useShopBasketStore } from "./useShopBasketStore";

function item(id: string): ShopItem {
  return {
    id,
    sellerId: "seller-1",
    name: `Item ${id}`,
    description: "",
    pricePence: 1000,
    priceLabel: "£10.00",
    imageUrl: null,
  };
}

function lines(): { id: string; quantity: number }[] {
  return useShopBasketStore.getState().lines.map((line) => ({ id: line.item.id, quantity: line.quantity }));
}

describe("useShopBasketStore", () => {
  beforeEach(() => {
    useShopBasketStore.getState().clear();
  });

  it("starts empty", () => {
    expect(lines()).toEqual([]);
    expect(useShopBasketStore.getState().unitCount()).toBe(0);
  });

  it("appends new items in the order they were added", () => {
    useShopBasketStore.getState().add(item("a"));
    useShopBasketStore.getState().add(item("b"));
    expect(lines()).toEqual([
      { id: "a", quantity: 1 },
      { id: "b", quantity: 1 },
    ]);
  });

  it("increments the quantity instead of duplicating a line", () => {
    useShopBasketStore.getState().add(item("a"));
    useShopBasketStore.getState().add(item("a"));
    useShopBasketStore.getState().add(item("b"));
    expect(lines()).toEqual([
      { id: "a", quantity: 2 },
      { id: "b", quantity: 1 },
    ]);
    expect(useShopBasketStore.getState().unitCount()).toBe(3);
  });

  it("removes a whole line regardless of its quantity, ignoring unknown ids", () => {
    useShopBasketStore.getState().add(item("a"));
    useShopBasketStore.getState().add(item("a"));
    useShopBasketStore.getState().add(item("b"));
    useShopBasketStore.getState().remove("missing");
    expect(useShopBasketStore.getState().unitCount()).toBe(3);
    useShopBasketStore.getState().remove("a");
    expect(lines()).toEqual([{ id: "b", quantity: 1 }]);
  });

  it("empties the basket", () => {
    useShopBasketStore.getState().add(item("a"));
    useShopBasketStore.getState().clear();
    expect(lines()).toEqual([]);
    expect(useShopBasketStore.getState().unitCount()).toBe(0);
  });
});
