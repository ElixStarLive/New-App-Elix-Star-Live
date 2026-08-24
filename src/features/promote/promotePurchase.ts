import { platform } from "@/lib/platform";
import { useAuthStore } from "@/store/useAuthStore";
import { isPromoteProductId, type PromoteProductId } from "@shared/contracts";
import { initializeCoinIap } from "@/features/iap/iapApi";
import { apiCompletePromotePurchase } from "./promoteApi";

type NativePurchasesMod = typeof import("@capgo/native-purchases");

let pluginMod: NativePurchasesMod | null = null;
let promoteLock = false;

function receiptFromNative(result: unknown): { transactionId: string; receipt: string } {
  if (!result || typeof result !== "object") return { transactionId: "", receipt: "" };
  const row = result as Record<string, unknown>;
  const transactionId =
    typeof row.transactionId === "string"
      ? row.transactionId
      : typeof row.transactionIdentifier === "string"
        ? row.transactionIdentifier
        : "";
  const receipt =
    typeof row.receipt === "string" && row.receipt
      ? row.receipt
      : typeof row.purchaseToken === "string"
        ? row.purchaseToken
        : "";
  return { transactionId, receipt };
}

async function nativePlugin(): Promise<NativePurchasesMod | null> {
  if (!platform.isNative) return null;
  if (pluginMod) return pluginMod;
  try {
    pluginMod = await import("@capgo/native-purchases");
    return pluginMod;
  } catch {
    return null;
  }
}

export async function purchasePromoteBoost(input: {
  productId: PromoteProductId;
  contentType: "video" | "profile" | "live";
  contentId: string;
}): Promise<{ ok: true } | { ok: false; error: string; cancelled?: boolean }> {
  if (!isPromoteProductId(input.productId)) {
    return { ok: false, error: "Invalid goal" };
  }
  if (!useAuthStore.getState().user?.id) {
    return { ok: false, error: "Please sign in to promote" };
  }
  const provider = platform.isIOS ? "apple" : platform.isAndroid ? "google" : null;
  if (!provider) {
    return { ok: false, error: "Promote is a digital in-app feature and must be purchased via Apple IAP or Google Play." };
  }
  if (promoteLock) return { ok: false, error: "A purchase is already in progress" };
  const ready = await initializeCoinIap();
  const mod = await nativePlugin();
  if (!ready || !mod) {
    return { ok: false, error: "Purchases are not supported on this device" };
  }
  promoteLock = true;
  try {
    let nativeResult: unknown;
    try {
      nativeResult = await mod.NativePurchases.purchaseProduct({
        productIdentifier: input.productId,
        productType: mod.PURCHASE_TYPE.INAPP,
        quantity: 1,
        autoAcknowledgePurchases: false,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/cancel/i.test(message) || message.includes("USER_CANCELED")) {
        return { ok: false, error: "Purchase cancelled", cancelled: true };
      }
      return { ok: false, error: message || "Purchase failed" };
    }
    const { transactionId, receipt } = receiptFromNative(nativeResult);
    if (!receipt) return { ok: false, error: "Purchase could not be verified" };
    const completed = await apiCompletePromotePurchase({
      transactionId,
      receipt,
      productId: input.productId,
      provider,
      contentType: input.contentType,
      contentId: input.contentId,
    });
    if (!completed.ok) return { ok: false, error: completed.error || "Failed to complete promote. Please try again." };
    try {
      if (platform.isAndroid) {
        await mod.NativePurchases.consumePurchase({ purchaseToken: receipt });
      } else if (transactionId) {
        await mod.NativePurchases.acknowledgePurchase({ purchaseToken: transactionId });
      }
    } catch {
      /* store finish is recovery after a recorded promote */
    }
    return { ok: true };
  } finally {
    promoteLock = false;
  }
}

export function __resetPromotePurchaseForTests(): void {
  promoteLock = false;
  pluginMod = null;
}
