import { describe, expect, it } from "vitest";
import { formatAdminPurchasePence } from "@/content/adminPurchases";
import { parseAdminIapPurchases, parseAdminShopPurchases } from "./adminApi";

describe("PAGE-075 admin purchases parse", () => {
  it("accepts separated IAP and Shop bundles and rejects leaks or mixed sources", () => {
    expect(
      parseAdminIapPurchases({
        source: "iap",
        data: [
          {
            id: "p1",
            user_id: "u1",
            provider: "apple",
            product_id: "coins100",
            transaction_id: "txn-1",
            coins: 100,
            status: "credited",
            created_at: "2026-08-22T00:00:00.000Z",
          },
        ],
      }),
    ).toEqual([
      {
        id: "p1",
        user_id: "u1",
        provider: "apple",
        product_id: "coins100",
        transaction_id: "txn-1",
        coins: 100,
        status: "credited",
        created_at: "2026-08-22T00:00:00.000Z",
      },
    ]);
    expect(
      parseAdminIapPurchases({
        source: "shop",
        data: [],
      }),
    ).toBeNull();
    expect(
      parseAdminIapPurchases({
        source: "iap",
        data: [
          {
            id: "p1",
            user_id: "u1",
            provider: "apple",
            product_id: "coins100",
            transaction_id: "txn-1",
            coins: 100,
            status: "credited",
            created_at: "2026-08-22T00:00:00.000Z",
            raw_payload: { purchaseToken: "secret" },
          },
        ],
      }),
    ).toBeNull();
    expect(parseAdminIapPurchases({ rows: [] })).toBeNull();
    expect(
      parseAdminShopPurchases({
        source: "shop",
        data: [
          {
            id: "s1",
            user_id: "u1",
            stripe_session_id: "cs_test_1",
            item_id: "item-1",
            quantity: 1,
            amount_pence: 1999,
            status: "paid",
            created_at: "2026-08-22T00:00:00.000Z",
          },
        ],
      }),
    ).toEqual([
      {
        id: "s1",
        user_id: "u1",
        stripe_session_id: "cs_test_1",
        item_id: "item-1",
        quantity: 1,
        amount_pence: 1999,
        status: "paid",
        created_at: "2026-08-22T00:00:00.000Z",
      },
    ]);
    expect(
      parseAdminShopPurchases({
        source: "shop",
        data: [
          {
            id: "s1",
            user_id: "u1",
            stripe_session_id: "cs_test_1",
            item_id: "item-1",
            quantity: 1,
            amount_pence: 1999,
            status: "paid",
            created_at: "2026-08-22T00:00:00.000Z",
            client_secret: "pi_secret",
          },
        ],
      }),
    ).toBeNull();
    expect(formatAdminPurchasePence(1999)).toBe("£19.99");
    expect(formatAdminPurchasePence(0)).toBe("£0.00");
    expect(formatAdminPurchasePence(1.5)).toBe("—");
  });
});
