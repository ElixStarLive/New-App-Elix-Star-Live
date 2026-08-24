export type IapReplayDecision =
  | { action: "insert" }
  | { action: "idempotent"; coins: number }
  | { action: "forbidden" }
  | { action: "conflict" };

export function decideIapReplay(
  existing: { userId: string; status: string; coins: number } | null,
  requesterId: string,
): IapReplayDecision {
  if (!existing) return { action: "insert" };
  if (existing.userId !== requesterId) return { action: "forbidden" };
  if (existing.status === "credited") return { action: "idempotent", coins: existing.coins };
  return { action: "conflict" };
}

export function canonicalIapProductId(body: { productId?: string; packageId?: string }): string {
  const productId = typeof body.productId === "string" ? body.productId.trim() : "";
  if (productId) return productId;
  return typeof body.packageId === "string" ? body.packageId.trim() : "";
}
