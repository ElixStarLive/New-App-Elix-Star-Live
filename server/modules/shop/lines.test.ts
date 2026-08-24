import { describe, expect, it } from "vitest";
import { AppError } from "../../middleware/errors.js";
import { parseShopCheckoutLines, shopCheckoutIdempotencyKey } from "./lines.js";

const a = "11111111-1111-4111-8111-111111111111";
const b = "22222222-2222-4222-8222-222222222222";

describe("PAGE-036 checkout lines", () => {
  it("accepts itemId or items[] and merges duplicate ids", () => {
    expect(parseShopCheckoutLines({ itemId: a })).toEqual([{ id: a, quantity: 1 }]);
    expect(parseShopCheckoutLines({ items: [{ id: a, quantity: 2 }, { id: a, quantity: 3 }] })).toEqual([
      { id: a, quantity: 5 },
    ]);
  });

  it("refuses invalid quantities and more than 10 lines", () => {
    expect(() => parseShopCheckoutLines({ itemId: a, quantity: 0 })).toThrow(AppError);
    expect(() => parseShopCheckoutLines({ itemId: a, quantity: 100 })).toThrow(AppError);
    expect(() => parseShopCheckoutLines({ itemId: a, quantity: -1 })).toThrow(AppError);
    expect(() => parseShopCheckoutLines({ itemId: a, quantity: 1.5 })).toThrow(AppError);
    const items = Array.from({ length: 11 }, (_, i) => ({
      id: `00000000-0000-4000-8000-0000000000${String(i).padStart(2, "0")}`,
      quantity: 1,
    }));
    expect(() => parseShopCheckoutLines({ items })).toThrow(/10 items/);
    expect(parseShopCheckoutLines({ items: [{ id: a, quantity: 1 }, { id: b, quantity: 99 }] })).toHaveLength(2);
  });

  it("sanitizes idempotency keys", () => {
    expect(shopCheckoutIdempotencyKey("u1", "short")).toBeNull();
    expect(shopCheckoutIdempotencyKey("u1", "good-key-01")).toBe("shop_cs_u1_good-key-01");
  });
});
