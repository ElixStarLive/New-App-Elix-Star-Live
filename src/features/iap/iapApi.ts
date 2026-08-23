import { apiRequest } from "@/lib/apiClient";
import { isRecord } from "@/lib/isRecord";
import { platform } from "@/lib/platform";
import { useAuthStore } from "@/store/useAuthStore";
import { useWalletStore } from "@/store/useWalletStore";

export type StoreIapProvider = "apple" | "google";

export type CoinPackage = {
  productId: string;
  provider: StoreIapProvider;
  coins: number;
  label: string;
  title: string;
  price: string;
};

export type CoinPurchaseResult =
  | { ok: true; restoredOwned?: boolean; paidCoins: number | null }
  | { ok: false; error: string; cancelled?: boolean };

type NativePurchasesMod = typeof import("@capgo/native-purchases");

let pluginMod: NativePurchasesMod | null = null;
let purchaseLock = false;
let billingReady: boolean | null = null;

export function currentCoinProvider(): StoreIapProvider | null {
  if (platform.isIOS) return "apple";
  if (platform.isAndroid) return "google";
  return null;
}

function isCancelError(message: string): boolean {
  return /cancel/i.test(message) || message.includes("USER_CANCELED");
}

function isAlreadyOwnedError(message: string): boolean {
  return /already own|ITEM_ALREADY_OWNED|not purchased/i.test(message);
}

function purchaseTokenFromNative(result: unknown): { transactionId: string; receipt: string } {
  if (!isRecord(result)) return { transactionId: "", receipt: "" };
  const transactionId =
    typeof result.transactionId === "string"
      ? result.transactionId
      : typeof result.transactionIdentifier === "string"
        ? result.transactionIdentifier
        : "";
  const receipt =
    typeof result.receipt === "string" && result.receipt
      ? result.receipt
      : typeof result.purchaseToken === "string"
        ? result.purchaseToken
        : "";
  return { transactionId, receipt };
}

async function getNativePlugin(): Promise<NativePurchasesMod | null> {
  if (!platform.isNative) return null;
  if (pluginMod) return pluginMod;
  try {
    pluginMod = await import("@capgo/native-purchases");
    return pluginMod;
  } catch {
    return null;
  }
}

export async function initializeCoinIap(): Promise<boolean> {
  const mod = await getNativePlugin();
  if (!mod) {
    billingReady = false;
    return false;
  }
  try {
    const { isBillingSupported } = await mod.NativePurchases.isBillingSupported();
    billingReady = isBillingSupported;
    return isBillingSupported;
  } catch {
    billingReady = false;
    return false;
  }
}

export function parseCoinCatalogResponse(data: unknown, provider: StoreIapProvider | null): CoinPackage[] {
  if (!isRecord(data)) return [];
  const rows = Array.isArray(data.packages) ? data.packages : [];
  const packages: CoinPackage[] = [];
  for (const raw of rows) {
    if (!isRecord(raw) || typeof raw.productId !== "string" || !raw.productId.trim()) continue;
    const rowProvider =
      raw.provider === "apple" || raw.provider === "google" ? raw.provider : provider;
    if (!rowProvider) continue;
    if (provider && rowProvider !== provider) continue;
    if (typeof raw.coins !== "number" || !Number.isInteger(raw.coins) || raw.coins < 1) continue;
    const label = typeof raw.label === "string" && raw.label.trim() ? raw.label : raw.productId;
    packages.push({
      productId: raw.productId.trim(),
      provider: rowProvider,
      coins: raw.coins,
      label,
      title: label,
      price: "",
    });
  }
  return packages;
}

export async function apiListCoinPackages(): Promise<{
  packages: CoinPackage[];
  error: string | null;
}> {
  const provider = currentCoinProvider();
  const qs = provider ? `?provider=${encodeURIComponent(provider)}` : "";
  const { data, error } = await apiRequest<unknown>(`/api/coin-packages${qs}`);
  if (error) return { packages: [], error: error.message || "Coin store unavailable. Try again in a moment." };
  const packages = parseCoinCatalogResponse(data, provider);
  if (packages.length === 0) {
    return { packages: [], error: "Coin store unavailable. Try again in a moment." };
  }
  return { packages, error: null };
}

export async function loadStoreCoinProducts(): Promise<{
  products: CoinPackage[];
  error: string | null;
}> {
  if (!platform.isNative) {
    return { products: [], error: null };
  }
  const catalog = await apiListCoinPackages();
  if (catalog.error || catalog.packages.length === 0) {
    return { products: [], error: catalog.error || "Coin store unavailable. Try again in a moment." };
  }
  const ready = billingReady ?? (await initializeCoinIap());
  const mod = await getNativePlugin();
  if (!ready || !mod) {
    return { products: [], error: "Purchases are not supported on this device" };
  }
  try {
    const { products } = await mod.NativePurchases.getProducts({
      productIdentifiers: catalog.packages.map((row) => row.productId),
      productType: mod.PURCHASE_TYPE.INAPP,
    });
    if (!products || products.length === 0) {
      return { products: [], error: "Coin store unavailable. Try again in a moment." };
    }
    const byId = new Map(catalog.packages.map((row) => [row.productId, row]));
    const merged: CoinPackage[] = [];
    for (const raw of products) {
      const id = String(
        (raw as { identifier?: string; productIdentifier?: string }).identifier ||
          (raw as { productIdentifier?: string }).productIdentifier ||
          "",
      );
      const catalogRow = byId.get(id);
      if (!catalogRow) continue;
      const price =
        typeof (raw as { priceString?: string }).priceString === "string"
          ? (raw as { priceString: string }).priceString
          : "";
      merged.push({
        ...catalogRow,
        title:
          typeof (raw as { title?: string }).title === "string" && (raw as { title: string }).title
            ? (raw as { title: string }).title
            : catalogRow.title,
        price,
      });
    }
    if (merged.length === 0) {
      return { products: [], error: "Coin store unavailable. Try again in a moment." };
    }
    return { products: merged, error: null };
  } catch (err) {
    return {
      products: [],
      error: err instanceof Error ? err.message : "Failed to load products",
    };
  }
}

async function reconcileAuthoritativePaidBalance(): Promise<number | null> {
  const refreshed = await useWalletStore.getState().fetchWallet();
  if (!refreshed.ok) return null;
  return useWalletStore.getState().paidCoins;
}

export async function apiVerifyCoinPurchase(input: {
  productId: string;
  receipt: string;
  transactionId?: string;
}): Promise<CoinPurchaseResult> {
  const provider = currentCoinProvider();
  if (!provider) {
    return { ok: false, error: "Coin purchases are available in the iOS and Android apps only." };
  }
  const userId = useAuthStore.getState().user?.id;
  if (!userId) return { ok: false, error: "Please log in to purchase coins" };
  if (!input.receipt) return { ok: false, error: "Purchase could not be verified" };
  const { error } = await apiRequest<unknown>("/api/verify-purchase", {
    method: "POST",
    body: JSON.stringify({
      provider,
      productId: input.productId,
      packageId: input.productId,
      receipt: input.receipt,
      transactionId: input.transactionId,
    }),
  });
  if (error) return { ok: false, error: error.message || "Server verification failed" };
  const reconciled = await reconcileAuthoritativePaidBalance();
  if (reconciled == null) {
    return { ok: false, error: "Purchase verified but balance could not be confirmed. Contact support if charged." };
  }
  return { ok: true, paidCoins: reconciled };
}

async function finishStorePurchase(
  mod: NativePurchasesMod,
  transactionId: string,
  receipt: string,
): Promise<void> {
  try {
    if (platform.isAndroid && receipt) {
      await mod.NativePurchases.consumePurchase({ purchaseToken: receipt });
      return;
    }
    if (platform.isIOS && transactionId) {
      await mod.NativePurchases.acknowledgePurchase({ purchaseToken: transactionId });
    }
  } catch {
    /* store finish is recovery, not purchase authority */
  }
}

export async function reconcileOwnedCoinPurchases(): Promise<number> {
  if (!platform.isNative) return 0;
  const catalog = await apiListCoinPackages();
  if (catalog.error) return 0;
  const allowed = new Set(catalog.packages.map((row) => row.productId));
  const mod = await getNativePlugin();
  if (!mod) return 0;
  let credited = 0;
  try {
    const { purchases } = await mod.NativePurchases.getPurchases();
    for (const purchase of purchases || []) {
      const productId = String(
        (purchase as { productIdentifier?: string }).productIdentifier ||
          (purchase as { productId?: string }).productId ||
          "",
      );
      const { transactionId, receipt } = purchaseTokenFromNative(purchase);
      if (!allowed.has(productId) || !receipt) continue;
      const verified = await apiVerifyCoinPurchase({ productId, receipt, transactionId });
      if (verified.ok) {
        credited += 1;
        await finishStorePurchase(mod, transactionId, receipt);
      }
    }
  } catch {
    return credited;
  }
  return credited;
}

export async function purchaseCoinProduct(productId: string): Promise<CoinPurchaseResult> {
  const provider = currentCoinProvider();
  if (!provider) {
    return { ok: false, error: "Coin purchases are available in the iOS and Android apps only." };
  }
  if (!useAuthStore.getState().user?.id) {
    return { ok: false, error: "Please log in to purchase coins" };
  }
  if (purchaseLock) {
    return { ok: false, error: "A purchase is already in progress" };
  }
  const ready = billingReady ?? (await initializeCoinIap());
  const mod = await getNativePlugin();
  if (!ready || !mod) {
    return { ok: false, error: "Purchases are not supported on this device" };
  }
  const ownerId = useAuthStore.getState().user?.id;
  purchaseLock = true;
  try {
    let nativeResult: unknown;
    try {
      nativeResult = await mod.NativePurchases.purchaseProduct({
        productIdentifier: productId,
        productType: mod.PURCHASE_TYPE.INAPP,
        quantity: 1,
        autoAcknowledgePurchases: false,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (isCancelError(message)) return { ok: false, error: "Purchase cancelled", cancelled: true };
      if (isAlreadyOwnedError(message)) {
        const recovered = await reconcileOwnedCoinPurchases();
        if (recovered > 0) return { ok: true, restoredOwned: true, paidCoins: useWalletStore.getState().paidCoins };
        return { ok: false, error: message || "Purchase failed" };
      }
      return { ok: false, error: message || "Purchase failed" };
    }
    if (useAuthStore.getState().user?.id !== ownerId) {
      return { ok: false, error: "Account changed during purchase. Contact support if charged." };
    }
    const { transactionId, receipt } = purchaseTokenFromNative(nativeResult);
    if (!receipt) {
      return { ok: false, error: "Purchase could not be verified" };
    }
    const verified = await apiVerifyCoinPurchase({ productId, receipt, transactionId });
    if (!verified.ok) return verified;
    await finishStorePurchase(mod, transactionId, receipt);
    return verified;
  } finally {
    purchaseLock = false;
  }
}

export async function restoreCoinPurchases(): Promise<{
  restored: number;
  error: string | null;
}> {
  if (!platform.isNative) return { restored: 0, error: "Restore is only available in the app" };
  if (!useAuthStore.getState().user?.id) return { restored: 0, error: "Please log in to restore purchases" };
  const mod = await getNativePlugin();
  if (!mod) return { restored: 0, error: "Purchase service not available" };
  try {
    await mod.NativePurchases.restorePurchases();
  } catch (err) {
    return { restored: 0, error: err instanceof Error ? err.message : "Could not restore purchases" };
  }
  const restored = await reconcileOwnedCoinPurchases();
  return { restored, error: null };
}

export function __resetCoinIapForTests(): void {
  purchaseLock = false;
  billingReady = null;
  pluginMod = null;
}
