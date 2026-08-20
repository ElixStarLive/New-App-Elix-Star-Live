import { apiRequest } from "@/lib/apiClient";
import { isRecord } from "@/lib/isRecord";
import { platform } from "@/lib/platform";

export type CoinProduct = {
  productId: string;
  coins: number;
  label: string;
};

export async function apiListCoinProducts(): Promise<{
  products: CoinProduct[];
  error: string | null;
}> {
  const { data, error } = await apiRequest<unknown>("/api/iap/products");
  if (error) return { products: [], error: error.message };
  const list = Array.isArray(data) ? data : isRecord(data) && Array.isArray(data.products) ? data.products : null;
  if (!list) return { products: [], error: "Invalid IAP catalog" };
  const products: CoinProduct[] = [];
  for (const raw of list) {
    if (!isRecord(raw) || typeof raw.productId !== "string") continue;
    products.push({
      productId: raw.productId,
      coins: typeof raw.coins === "number" ? raw.coins : 0,
      label: typeof raw.label === "string" ? raw.label : raw.productId,
    });
  }
  return { products, error: null };
}

export async function purchaseCoinProduct(productId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!platform.isNative) {
    return { ok: false, error: "Coin purchases are available in the iOS and Android apps only." };
  }
  try {
    const { NativePurchases } = await import("@capgo/native-purchases");
    const result = await NativePurchases.purchaseProduct({ productIdentifier: productId });
    const receipt =
      typeof result === "object" && result && "receipt" in result
        ? String((result as { receipt?: unknown }).receipt ?? "")
        : "";
    if (!receipt) return { ok: false, error: "Purchase was not verified." };
    const { error } = await apiRequest<unknown>("/api/iap/verify", {
      method: "POST",
      body: JSON.stringify({
        provider: platform.isIOS ? "apple" : "google",
        productId,
        receipt,
      }),
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Purchase failed" };
  }
}
