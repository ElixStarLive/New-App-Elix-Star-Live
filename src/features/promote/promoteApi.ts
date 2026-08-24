import { apiRequest } from "@/lib/apiClient";
import { isRecord } from "@/lib/isRecord";
import type { PromoteContentType } from "@shared/contracts";

export async function apiCompletePromotePurchase(input: {
  transactionId: string;
  receipt: string;
  productId: string;
  provider: "apple" | "google";
  contentType: PromoteContentType;
  contentId: string;
}): Promise<{ ok: boolean; error: string | null }> {
  const { data, error } = await apiRequest<unknown>("/api/promote-iap-complete", {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (error) return { ok: false, error: error.message };
  if (!isRecord(data) || data.success !== true) {
    return { ok: false, error: "Failed to complete promote" };
  }
  return { ok: true, error: null };
}
