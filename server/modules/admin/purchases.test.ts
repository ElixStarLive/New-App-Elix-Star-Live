import { describe, expect, it } from "vitest";
import { ADMIN_IAP_PURCHASES_LIMIT, ADMIN_SHOP_PURCHASES_LIMIT } from "./purchases.js";

describe("PAGE-075 admin purchases contract", () => {
  it("bounds IAP and Shop lists separately", () => {
    expect(ADMIN_IAP_PURCHASES_LIMIT).toBe(200);
    expect(ADMIN_SHOP_PURCHASES_LIMIT).toBe(100);
  });
});
