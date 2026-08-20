import {
  giftCatalogItemSchema,
  sendGiftBodySchema,
  type GiftCatalogItem,
} from "@shared/contracts";
import { apiRequest } from "@/lib/apiClient";
import { isRecord } from "@/lib/isRecord";

export async function apiGiftCatalog(): Promise<{
  gifts: GiftCatalogItem[];
  error: string | null;
}> {
  const { data, error } = await apiRequest<unknown>("/api/gifts");
  if (error) return { gifts: [], error: error.message };
  const list = Array.isArray(data) ? data : isRecord(data) && Array.isArray(data.gifts) ? data.gifts : null;
  if (!list) return { gifts: [], error: "Invalid gift catalog" };
  const gifts: GiftCatalogItem[] = [];
  for (const item of list) {
    const parsed = giftCatalogItemSchema.safeParse(item);
    if (parsed.success) gifts.push(parsed.data);
  }
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
