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
            userId: "u1",
            provider: "apple",
            productId: "coins100",
            transactionId: "txn-1",
            coins: 100,
            status: "credited",
            createdAt: "2026-08-22T00:00:00.000Z",
          },
        ],
      }),
    ).toEqual([
      {
        id: "p1",
        userId: "u1",
        provider: "apple",
        productId: "coins100",
        transactionId: "txn-1",
        coins: 100,
        status: "credited",
        createdAt: "2026-08-22T00:00:00.000Z",
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
            userId: "u1",
            provider: "apple",
            productId: "coins100",
            transactionId: "txn-1",
            coins: 100,
            status: "credited",
            createdAt: "2026-08-22T00:00:00.000Z",
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
            userId: "u1",
            stripeSessionId: "cs_test_1",
            itemId: "item-1",
            quantity: 1,
            amountPence: 1999,
            status: "paid",
            createdAt: "2026-08-22T00:00:00.000Z",
          },
        ],
      }),
    ).toEqual([
      {
        id: "s1",
        userId: "u1",
        stripeSessionId: "cs_test_1",
        itemId: "item-1",
        quantity: 1,
        amountPence: 1999,
        status: "paid",
        createdAt: "2026-08-22T00:00:00.000Z",
      },
    ]);
    expect(
      parseAdminShopPurchases({
        source: "shop",
        data: [
          {
            id: "s1",
            userId: "u1",
            stripeSessionId: "cs_test_1",
            itemId: "item-1",
            quantity: 1,
            amountPence: 1999,
            status: "paid",
            createdAt: "2026-08-22T00:00:00.000Z",
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
