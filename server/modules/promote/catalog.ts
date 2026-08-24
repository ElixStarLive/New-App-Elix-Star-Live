import { PROMOTE_PRODUCTS, isPromoteProductId, type PromoteProductId } from "../../../shared/contracts/promote.js";

export function lookupPromoteProduct(productId: string) {
  if (!isPromoteProductId(productId)) return null;
  const row = PROMOTE_PRODUCTS[productId as PromoteProductId];
  return {
    productId: productId as PromoteProductId,
    goal: row.goal,
    label: row.label,
    amountPence: row.amountPence,
  };
}

export function promoteIsPlatformOnly(): true {
  return true;
}
