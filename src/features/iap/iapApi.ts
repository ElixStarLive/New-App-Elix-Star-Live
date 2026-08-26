import { apiRequest } from "@/lib/apiClient";
import { parseListFrom, type MutationResult } from "@/lib/apiResult";
import { asNonNegInt, asString, isRecord } from "@/lib/isRecord";
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
  const products = parseListFrom(data, "products", (raw) => {
    if (!isRecord(raw) || typeof raw.productId !== "string") return null;
    return {
      productId: raw.productId,
      coins: asNonNegInt(raw.coins),
      label: asString(raw.label, raw.productId),
    };
  });
  if (!products) return { products: [], error: "Invalid IAP catalog" };
  return { products, error: null };
}

export async function purchaseCoinProduct(productId: string): Promise<MutationResult> {
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
