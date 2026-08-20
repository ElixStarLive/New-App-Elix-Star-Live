import { apiRequest } from "@/lib/apiClient";
import { isRecord } from "@/lib/isRecord";
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
    sellerId: typeof raw.sellerId === "string" ? raw.sellerId : "",
    name: typeof raw.name === "string" ? raw.name : raw.id,
    description: typeof raw.description === "string" ? raw.description : "",
    pricePence,
    priceLabel: typeof raw.priceLabel === "string" ? raw.priceLabel : `£${(pricePence / 100).toFixed(2)}`,
    imageUrl: typeof raw.imageUrl === "string" ? raw.imageUrl : null,
  };
}

export async function apiListShopItems(userId?: string): Promise<{ items: ShopItem[]; error: string | null }> {
  const qs = userId ? `?userId=${encodeURIComponent(userId)}` : "";
  const { data, error } = await apiRequest<unknown>(`/api/shop/items${qs}`);
  if (error) return { items: [], error: error.message };
  const list = Array.isArray(data) ? data : isRecord(data) && Array.isArray(data.items) ? data.items : null;
  if (!list) return { items: [], error: "Invalid shop catalog" };
  return { items: list.map(parseItem).filter((item): item is ShopItem => item !== null), error: null };
}

export async function apiCreateShopItem(body: {
  title: string;
  description: string;
  pricePence: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await apiRequest<unknown>("/api/shop/items", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function apiDeleteShopItem(itemId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await apiRequest<unknown>(`/api/shop/items/${encodeURIComponent(itemId)}`, {
    method: "DELETE",
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function apiStartShopCheckout(itemId: string): Promise<{ ok: true } | { ok: false; error: string }> {
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
