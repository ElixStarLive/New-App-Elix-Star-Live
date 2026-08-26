import {
  giftCatalogItemSchema,
  sendGiftBodySchema,
  type GiftCatalogItem,
} from "@shared/contracts";
import { apiRequest } from "@/lib/apiClient";
import { parseListFrom } from "@/lib/apiResult";
import { isRecord } from "@/lib/isRecord";

export async function apiGiftCatalog(): Promise<{
  gifts: GiftCatalogItem[];
  error: string | null;
}> {
  const { data, error } = await apiRequest<unknown>("/api/gifts");
  if (error) return { gifts: [], error: error.message };
  const gifts = parseListFrom(data, "gifts", (item) => {
    const parsed = giftCatalogItemSchema.safeParse(item);
    return parsed.success ? parsed.data : null;
  });
  if (!gifts) return { gifts: [], error: "Invalid gift catalog" };
  return { gifts, error: null };
}

export async function apiSendGift(body: {
  giftId: string;
  recipientId: string;
  streamId: string;
  idempotencyKey: string;
  bucket?: "paid" | "promo" | "starter" | "test";
}): Promise<{ ok: true; transactionId: string } | { ok: false; error: string }> {
  const parsed = sendGiftBodySchema.safeParse({
    ...body,
    bucket: body.bucket ?? "paid",
  });
  if (!parsed.success) return { ok: false, error: "Invalid gift payload" };
  const { data, error } = await apiRequest<unknown>("/api/gifts/send", {
    method: "POST",
    body: JSON.stringify(parsed.data),
  });
  if (error) return { ok: false, error: error.message };
  if (!isRecord(data) || typeof data.transactionId !== "string") {
    return { ok: false, error: "Gift was not confirmed by the server" };
  }
  return { ok: true, transactionId: data.transactionId };
}
