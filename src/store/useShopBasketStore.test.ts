import { beforeEach, describe, expect, it } from "vitest";
import { useShopBasketStore } from "./useShopBasketStore";

const item = (n: number) => ({
  id: `00000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`,
  title: `Item ${n}`,
  price: 1,
  image_url: null,
});

describe("PAGE-036 shop basket", () => {
  beforeEach(() => {
    useShopBasketStore.getState().clear();
  });

  it("increments quantity for the same item and refuses an 11th line", () => {
    expect(useShopBasketStore.getState().add(item(1)).ok).toBe(true);
    expect(useShopBasketStore.getState().add(item(1)).ok).toBe(true);
    expect(useShopBasketStore.getState().items[0]?.quantity).toBe(2);
    for (let i = 2; i <= 10; i += 1) {
      expect(useShopBasketStore.getState().add(item(i)).ok).toBe(true);
    }
    const eleventh = useShopBasketStore.getState().add(item(11));
    expect(eleventh.ok).toBe(false);
    expect(useShopBasketStore.getState().items).toHaveLength(10);
  });

  it("caps quantity at 99", () => {
    useShopBasketStore.getState().add(item(1));
    useShopBasketStore.getState().setQuantity(item(1).id, 99);
    useShopBasketStore.getState().add(item(1));
    expect(useShopBasketStore.getState().items[0]?.quantity).toBe(99);
    useShopBasketStore.getState().setQuantity(item(1).id, 0);
    expect(useShopBasketStore.getState().items).toHaveLength(0);
  });
});
