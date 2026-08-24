import { describe, expect, it } from "vitest";
import { canonicalIapProductId, decideIapReplay } from "./replay";

describe("PAGE-038 IAP replay", () => {
  it("inserts a new proof, idempotently returns the same user credit, and forbids foreign replay", () => {
    expect(decideIapReplay(null, "user-a")).toEqual({ action: "insert" });
    expect(
      decideIapReplay({ userId: "user-a", status: "credited", coins: 100 }, "user-a"),
    ).toEqual({ action: "idempotent", coins: 100 });
    expect(
      decideIapReplay({ userId: "user-a", status: "credited", coins: 100 }, "user-b"),
    ).toEqual({ action: "forbidden" });
    expect(
      decideIapReplay({ userId: "user-a", status: "reversed", coins: 100 }, "user-a"),
    ).toEqual({ action: "conflict" });
  });

  it("uses one canonical product id and does not fall back to another SKU", () => {
    expect(canonicalIapProductId({ productId: "coins100" })).toBe("coins100");
    expect(canonicalIapProductId({ packageId: "coins500a" })).toBe("coins500a");
    expect(canonicalIapProductId({ productId: "coins100", packageId: "coins500a" })).toBe("coins100");
    expect(canonicalIapProductId({})).toBe("");
  });
});
