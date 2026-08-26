import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Coins, Sparkles } from "lucide-react";
import {
  initializeCoinIap,
  loadStoreCoinProducts,
  purchaseCoinProduct,
  reconcileOwnedCoinPurchases,
  type CoinPackage,
} from "@/features/iap/iapApi";
import { platform } from "@/lib/platform";
import { showToast } from "@/lib/toast";

/** Above live gift overlay (99999); below EngagementDrawer (1001000). */
const BUY_COINS_Z_BACKDROP = 100050;
const BUY_COINS_Z_PANEL = 100051;

type BuyCoinsModalProps = {
  isOpen: boolean;
  onClose: () => void;
  /** Call-site compatibility only — never used as a fake post-purchase balance. */
  currentBalance?: number;
  /** Called only with an authoritative post-purchase paid wallet balance. */
  onSuccess?: (newBalance: number) => void;
};

export function BuyCoinsModal({ isOpen, onClose, onSuccess }: BuyCoinsModalProps) {
  const [products, setProducts] = useState<CoinPackage[]>([]);
  const [loadingProductId, setLoadingProductId] = useState<string | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogPhase, setCatalogPhase] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const isNative = platform.isNative;

  useEffect(() => {
    if (!isOpen || !isNative) return;
    let cancelled = false;
    const loadNative = async () => {
      setCatalogPhase("loading");
      setCatalogError(null);
      try {
        await initializeCoinIap();
        await reconcileOwnedCoinPurchases();
        const res = await loadStoreCoinProducts();
        if (cancelled) return;
        if (res.error || res.products.length === 0) {
          setProducts([]);
          const message = res.error || "Coin store unavailable. Try again in a moment.";
          setCatalogError(message);
          setCatalogPhase("error");
          showToast(message);
          return;
        }
        setProducts(res.products);
        setCatalogPhase("ready");
      } catch {
        if (!cancelled) {
          setProducts([]);
          setCatalogError("Failed to load products");
          setCatalogPhase("error");
          showToast("Failed to load products");
        }
      }
    };
    void loadNative();
    return () => {
      cancelled = true;
    };
  }, [isOpen, isNative]);

  const handlePurchase = useCallback(
    async (product: CoinPackage) => {
      if (loadingProductId) return;
      setLoadingProductId(product.productId);
      try {
        const result = await purchaseCoinProduct(product.productId);
        if (!result.ok) {
          if (!result.cancelled && result.error !== "Purchase cancelled") {
            showToast(result.error || "Purchase failed");
          }
          return;
        }
        if (result.restoredOwned) {
          showToast("Previous purchase restored");
        }
        if (typeof result.paidCoins === "number") {
          onSuccess?.(result.paidCoins);
          if (!result.restoredOwned) {
            showToast(`Coins updated — balance ${result.paidCoins.toLocaleString()}`);
          }
        } else {
          showToast("Purchase completed. Open wallet to confirm balance.");
        }
        onClose();
      } catch {
        showToast("Purchase failed");
      } finally {
        setLoadingProductId(null);
      }
    },
    [loadingProductId, onClose, onSuccess],
  );

  if (!isOpen) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <>
      <div
        className="fixed inset-0 bg-black/80 pointer-events-auto"
        style={{ zIndex: BUY_COINS_Z_BACKDROP }}
        onClick={onClose}
        aria-hidden
      />
      <div
        className="fixed left-0 right-0 pointer-events-auto max-w-[480px] mx-auto"
        style={{ zIndex: BUY_COINS_Z_PANEL, bottom: 0 }}
        role="dialog"
        aria-modal="true"
        aria-label="Recharge Coins"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="elix-panel rounded-t-2xl min-h-[52vh] h-[min(58vh,calc(100dvh-18%))] flex flex-col shadow-2xl overflow-hidden relative"
          style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        >
          <div className="absolute inset-0 bg-[#080A0E]" aria-hidden />
          <div className="relative z-[1] flex flex-col h-full min-h-0">
            <div className="flex justify-center pt-2 pb-1">
              <div className="w-10 h-1 bg-white/20 rounded-full" />
            </div>

            <div className="flex items-center gap-1.5 px-4 pb-2 flex-shrink-0">
              <Coins className="w-3.5 h-3.5 text-[#D9A62E]" strokeWidth={1.8} />
              <span className="text-white font-bold text-[13px]">Recharge Coins</span>
            </div>

            <div className="flex-1 overflow-y-auto px-4 pb-4">
              {isNative ? (
                <div className="space-y-2">
                  {catalogPhase === "idle" || catalogPhase === "loading" ? (
                    <div className="flex justify-center py-8">
                      <div className="w-8 h-8 border-2 border-[#E6E9EE]/25 border-t-[#E6E9EE] rounded-full animate-spin elix-loader" />
                    </div>
                  ) : catalogPhase === "error" ? (
                    <p className="text-rose-300 text-xs text-center py-6">
                      {catalogError || "Failed to load products"}
                    </p>
                  ) : (
                    products.map((product) => (
                      <button
                        key={product.productId}
                        type="button"
                        onClick={() => void handlePurchase(product)}
                        disabled={Boolean(loadingProductId)}
                        className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg bg-white/[0.03] border border-white/10 hover:bg-white/5 transition-colors active:scale-[0.98] disabled:opacity-50"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-[rgba(0,0,0,0.35)] border border-[#D8D9DD]/30 flex items-center justify-center">
                            <Sparkles className="w-3.5 h-3.5 text-[#F5F5F7]" strokeWidth={1.8} />
                          </div>
                          <div className="text-left">
                            <p className="text-white text-xs font-semibold">{product.title}</p>
                            {product.price ? (
                              <p className="text-white/40 text-[10px]">{product.price}</p>
                            ) : null}
                          </div>
                        </div>
                        <span className="text-[#D9A62E] text-[10px] font-bold">
                          {loadingProductId === product.productId
                            ? "Processing..."
                            : `${product.coins} coins`}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-6 text-center">
                  <Sparkles className="w-8 h-8 text-[#F5F5F7] mb-3" />
                  <p className="text-white text-xs font-semibold mb-1">Purchase Coins in the App</p>
                  <p className="text-white/40 text-[10px] px-4">
                    Coins are digital items and must be purchased through the Elix Star app on your mobile device.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
