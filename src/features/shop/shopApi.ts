import { apiRequest } from "@/lib/apiClient";
import { apiMutate, parseListFrom, type MutationResult } from "@/lib/apiResult";
import { asString, asStringOrNull, isRecord } from "@/lib/isRecord";
import { openStripeCheckoutUrl } from "@/lib/platform";

export type ShopItem = {
  id: string;
  sellerId: string;
  name: string;
  description: string;
  pricePence: number;
  priceLabel: string;
  imageUrl: string | null;
};

function parseItem(raw: unknown): ShopItem | null {
  if (!isRecord(raw) || typeof raw.id !== "string") return null;
  const pricePence = typeof raw.pricePence === "number" ? raw.pricePence : 0;
  return {
    id: raw.id,
    sellerId: asString(raw.sellerId),
    name: asString(raw.name, raw.id),
    description: asString(raw.description),
    pricePence,
    priceLabel: asString(raw.priceLabel, `£${(pricePence / 100).toFixed(2)}`),
    imageUrl: asStringOrNull(raw.imageUrl),
  };
}

export async function apiListShopItems(userId?: string): Promise<{ items: ShopItem[]; error: string | null }> {
  const qs = userId ? `?userId=${encodeURIComponent(userId)}` : "";
  const { data, error } = await apiRequest<unknown>(`/api/shop/items${qs}`);
  if (error) return { items: [], error: error.message };
  const items = parseListFrom(data, "items", parseItem);
  if (!items) return { items: [], error: "Invalid shop catalog" };
  return { items, error: null };
}

export async function apiCreateShopItem(body: {
  title: string;
  description: string;
  pricePence: number;
}): Promise<MutationResult> {
  return apiMutate("/api/shop/items", "POST", body);
}

export async function apiDeleteShopItem(itemId: string): Promise<MutationResult> {
  return apiMutate(`/api/shop/items/${encodeURIComponent(itemId)}`, "DELETE");
}

export async function apiStartShopCheckout(itemId: string): Promise<MutationResult> {
  const { data, error } = await apiRequest<unknown>("/api/shop/checkout", {
    method: "POST",
    body: JSON.stringify({ itemId }),
  });
  if (error) return { ok: false, error: error.message };
  if (!isRecord(data) || typeof data.url !== "string") {
    return { ok: false, error: "Checkout session was not created" };
  }
  try {
    await openStripeCheckoutUrl(data.url);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not open checkout" };
  }
}
