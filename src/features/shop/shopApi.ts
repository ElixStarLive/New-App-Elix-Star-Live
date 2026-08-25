import { apiRequest, apiUploadForm } from "@/lib/apiClient";
import { isRecord } from "@/lib/isRecord";
import { openStripeCheckoutUrl } from "@/lib/platform";

export type ShopItem = {
  id: string;
  sellerId: string;
  name: string;
  title: string;
  description: string;
  price: number;
  pricePence: number;
  priceLabel: string;
  imageUrl: string | null;
  category: string;
};

export type ShopCheckoutLine = { id: string; quantity: number };

export function parseShopItem(raw: unknown): ShopItem | null {
  if (!isRecord(raw) || typeof raw.id !== "string") return null;
  const sellerId = typeof raw.sellerId === "string" ? raw.sellerId : "";
  if (!sellerId) return null;
  const title = typeof raw.title === "string" && raw.title.trim() ? raw.title : "";
  if (!title) return null;
  if (typeof raw.pricePence !== "number" || !Number.isFinite(raw.pricePence)) return null;
  const pricePence = Math.round(raw.pricePence);
  if (pricePence < 0) return null;
  const imageUrl =
    raw.imageUrl === null ? null : typeof raw.imageUrl === "string" ? raw.imageUrl : null;
  return {
    id: raw.id,
    sellerId,
    name: title,
    title,
    description: typeof raw.description === "string" ? raw.description : "",
    price: pricePence / 100,
    pricePence,
    priceLabel: typeof raw.priceLabel === "string" ? raw.priceLabel : `£${(pricePence / 100).toFixed(2)}`,
    imageUrl,
    category: typeof raw.category === "string" ? raw.category : "other",
  };
}

export function canonicalShopRouteItemId(raw: string | undefined): string | null {
  if (typeof raw !== "string") return null;
  const itemId = raw.trim();
  return itemId.length > 0 ? itemId : null;
}

export function selectShopItemByCanonicalId(
  items: readonly ShopItem[],
  itemId: string | null,
): ShopItem | null {
  if (!itemId) return null;
  return items.find((item) => item.id === itemId) ?? null;
}

export async function apiListShopItems(sellerId?: string): Promise<{ items: ShopItem[]; error: string | null }> {
  const qs = sellerId ? `?sellerId=${encodeURIComponent(sellerId)}` : "";
  const { data, error } = await apiRequest<unknown>(`/api/shop/items${qs}`);
  if (error) return { items: [], error: error.message };
  if (!isRecord(data) || !Array.isArray(data.items)) return { items: [], error: "Invalid shop catalog" };
  return {
    items: data.items.map(parseShopItem).filter((item): item is ShopItem => item !== null),
    error: null,
  };
}

export async function apiCreateShopItem(body: {
  title: string;
  description: string;
  price: number;
  imageUrl?: string | null;
  category: string;
}): Promise<{ item: ShopItem | null; error: string | null }> {
  const { data, error } = await apiRequest<unknown>("/api/shop/items", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (error) return { item: null, error: error.message };
  const item = parseShopItem(data);
  return item ? { item, error: null } : { item: null, error: "Invalid shop item" };
}

export async function apiUpdateShopItem(
  itemId: string,
  body: {
    title: string;
    description: string;
    price: number;
    imageUrl?: string | null;
    category: string;
  },
): Promise<{ item: ShopItem | null; error: string | null }> {
  const { data, error } = await apiRequest<unknown>(`/api/shop/items/${encodeURIComponent(itemId)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  if (error) return { item: null, error: error.message };
  const item = parseShopItem(data);
  return item ? { item, error: null } : { item: null, error: "Invalid shop item" };
}

export async function apiDeleteShopItem(itemId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await apiRequest<unknown>(`/api/shop/items/${encodeURIComponent(itemId)}`, {
    method: "DELETE",
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function apiUploadShopImage(file: Blob, filename = "shop.jpg"): Promise<{
  imageUrl: string | null;
  error: string | null;
}> {
  const body = new FormData();
  body.append("file", file, filename);
  const { data, error } = await apiUploadForm<unknown>("/api/shop/image", body);
  if (error) return { imageUrl: null, error: error.message };
  if (!isRecord(data) || typeof data.imageUrl !== "string") return { imageUrl: null, error: "Image upload failed" };
  return { imageUrl: data.imageUrl, error: null };
}

export async function apiShopCheckout(payload: {
  itemId?: string;
  items?: ShopCheckoutLine[];
  idempotencyKey?: string;
}): Promise<{ url: string | null; sessionId: string | null; error: string | null }> {
  const { data, error } = await apiRequest<unknown>("/api/shop/checkout", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (error) return { url: null, sessionId: null, error: error.message };
  if (!isRecord(data) || typeof data.url !== "string") {
    return { url: null, sessionId: null, error: "Checkout session was not created" };
  }
  return {
    url: data.url,
    sessionId: typeof data.sessionId === "string" ? data.sessionId : null,
    error: null,
  };
}

export async function apiShopCheckoutSessionStatus(sessionId: string): Promise<{
  paid: boolean;
  paymentStatus: string | null;
  error: string | null;
}> {
  const { data, error } = await apiRequest<unknown>(`/api/shop/checkout-session/${encodeURIComponent(sessionId)}`);
  if (error) return { paid: false, paymentStatus: null, error: error.message };
  if (!isRecord(data)) return { paid: false, paymentStatus: null, error: "Could not confirm payment status" };
  return {
    paid: data.paid === true,
    paymentStatus: typeof data.paymentStatus === "string" ? data.paymentStatus : null,
    error: null,
  };
}

export async function openShopStripeCheckout(url: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await openStripeCheckoutUrl(url);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not open checkout" };
  }
}
