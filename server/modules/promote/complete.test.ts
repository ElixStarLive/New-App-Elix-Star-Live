import { describe, expect, it } from "vitest";
import { lookupPromoteProduct, promoteIsPlatformOnly } from "./catalog.js";
import { PROMOTE_PRODUCTS } from "../../../shared/contracts/promote.js";

describe("FLOW-024 promote catalog", () => {
  it("maps the four store SKUs and never credits creator share", () => {
    expect(lookupPromoteProduct("com.elixstarlive.promote_views")).toMatchObject({
      goal: "views",
      amountPence: 500,
    });
    expect(lookupPromoteProduct("com.elixstarlive.promote_likes")?.amountPence).toBe(1000);
    expect(lookupPromoteProduct("com.elixstarlive.promote_profile")?.amountPence).toBe(2000);
    expect(lookupPromoteProduct("com.elixstarlive.promote_followers")?.amountPence).toBe(3000);
    expect(lookupPromoteProduct("coins100")).toBeNull();
    expect(promoteIsPlatformOnly()).toBe(true);
    expect(Object.keys(PROMOTE_PRODUCTS)).toHaveLength(4);
  });
});
