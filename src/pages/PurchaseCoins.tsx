import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Check, RotateCcw, Sparkles } from "lucide-react";
import { RoyceBackIcon } from "@/components/royce";
import {
  initializeCoinIap,
  loadStoreCoinProducts,
  purchaseCoinProduct,
  reconcileOwnedCoinPurchases,
  restoreCoinPurchases,
  type CoinPackage,
} from "@/features/iap/iapApi";
import { containerReturnState, FEED_HOME, returnToFromLocationState } from "@/lib/settingsNav";
import { showToast } from "@/lib/toast";
import { platform } from "@/lib/platform";
import { useAuthStore } from "@/store/useAuthStore";

export default function PurchaseCoins() {
  const navigate = useNavigate();
  const location = useLocation();
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const isNative = platform.isNative;
  const [products, setProducts] = useState<CoinPackage[]>([]);
  const [catalogPhase, setCatalogPhase] = useState<"idle" | "loading" | "ready" | "error">(
    isNative ? "idle" : "ready",
  );
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const returnTo = returnToFromLocationState(location.state) || FEED_HOME;

  const goBack = useCallback(() => {
    navigate(returnTo, { replace: true });
  }, [navigate, returnTo]);

  const loadProducts = useCallback(async () => {
    if (!isNative) return;
    setCatalogPhase("loading");
    setCatalogError(null);
    try {
      await initializeCoinIap();
      try {
        const recovered = await reconcileOwnedCoinPurchases();
        if (recovered > 0) showToast("Previous coin purchase restored");
      } catch {
        /* best-effort restore must not block the store */
      }
      const res = await loadStoreCoinProducts();
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
      setProducts([]);
      const message = "Failed to load products";
      setCatalogError(message);
      setCatalogPhase("error");
      showToast(message);
    }
  }, [isNative]);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  const handlePurchase = useCallback(
    async (product: CoinPackage) => {
      if (!userId) {
        showToast("Please log in to purchase coins");
        navigate("/login", { replace: true });
        return;
      }
      if (loading) return;
      setLoading(true);
      setSelectedId(product.productId);
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
          return;
        }
        if (typeof result.paidCoins === "number") {
          showToast(`Coins updated — balance ${result.paidCoins.toLocaleString()}`);
        } else {
          showToast("Purchase completed. Open wallet to confirm balance.");
        }
      } catch {
        showToast("Purchase failed");
      } finally {
        setLoading(false);
        setSelectedId(null);
      }
    },
    [loading, navigate, userId],
  );

  const handleRestore = useCallback(async () => {
    try {
      setLoading(true);
      const result = await restoreCoinPurchases();
      if (result.error) {
        showToast(result.error);
        return;
      }
      if (!result.restored) {
        showToast("No purchases to restore");
        return;
      }
      showToast("Purchases restored");
    } catch {
      showToast("Could not restore purchases");
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div className="h-full min-h-0 w-full bg-transparent text-white flex justify-center px-2">
      <div className="w-full max-w-[480px] h-full min-h-0 flex flex-col overflow-hidden elix-page-glass bg-transparent">
        <div className="sticky top-0 bg-transparent z-10 px-4 py-4 border-b border-transparent flex items-center justify-between">
          <button type="button" onClick={goBack} className="p-2 hover:brightness-125 rounded-full transition" title="Back">
            <RoyceBackIcon />
          </button>
          <h1 className="text-lg font-bold">Get Coins</h1>
          {isNative ? (
            <button
              type="button"
              onClick={() => void handleRestore()}
              disabled={loading}
              className="p-2 hover:brightness-125 rounded-full transition"
              title="Restore purchases"
            >
              <RotateCcw className="w-5 h-5 text-[#F5F5F7]" />
            </button>
          ) : (
            <div className="w-10" />
          )}
        </div>

        <div className="px-4 py-6 flex-1 overflow-y-auto">
          <div className="text-center mb-8">
            <div className="w-20 h-20 bg-gradient-to-br from-[#D9A62E] to-[#B8943F] rounded-full mx-auto mb-4 flex items-center justify-center">
              <Sparkles className="w-10 h-10 text-black" />
            </div>
            <h2 className="text-2xl font-bold mb-2">Buy Coins</h2>
            <p className="text-sm text-white/60">Send gifts, unlock features, and support creators</p>
          </div>

          {isNative ? (
            <div className="space-y-3 mb-8">
              {catalogPhase === "idle" || catalogPhase === "loading" ? (
                <div className="flex justify-center py-10">
                  <div className="w-8 h-8 border-2 border-[#E6E9EE]/25 border-t-[#E6E9EE] rounded-full animate-spin elix-loader" />
                </div>
              ) : catalogPhase === "error" ? (
                <p className="text-rose-300 text-sm text-center py-6">{catalogError || "Failed to load products"}</p>
              ) : (
                products.map((product) => (
                  <button
                    key={product.productId}
                    type="button"
                    onClick={() => void handlePurchase(product)}
                    disabled={loading}
                    className="w-full p-6 rounded-2xl transition relative overflow-hidden bg-white/5 border-2 border-transparent hover:border-[#D8D9DD]/40 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-left">
                        <div className="flex items-center gap-2 mb-2">
                          <Sparkles className="w-6 h-6 text-[#F5F5F7]" />
                          <span className="text-2xl font-bold">{product.coins.toLocaleString()}</span>
                        </div>
                        <p className="text-sm text-white/60">{product.title}</p>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold text-[#F5F5F7]">{product.price || "Loading…"}</div>
                      </div>
                    </div>
                    {loading && selectedId === product.productId ? (
                      <div className="mt-4 text-center text-sm text-white/60">Processing…</div>
                    ) : null}
                  </button>
                ))
              )}
            </div>
          ) : (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-8 text-center">
              <Sparkles className="w-10 h-10 text-[#F5F5F7] mx-auto mb-3" />
              <h3 className="font-bold text-lg mb-2">Purchase Coins in the App</h3>
              <p className="text-sm text-white/60">
                Coins are digital items and must be purchased through the Elix Star app on your mobile device via Apple App Store or Google Play.
              </p>
            </div>
          )}

          <div className="bg-white/5 rounded-2xl p-6 space-y-4">
            <h3 className="font-bold mb-4">What you can do with coins:</h3>
            <FeatureItem text="Send virtual gifts to your favorite creators" />
            <FeatureItem text="Activate battle boosters during live competitions" />
            <FeatureItem text="Unlock premium features and filters" />
            <FeatureItem text="Support the community and help creators grow" />
          </div>
          <div className="bg-white/5 border border-white/10 rounded-xl p-4 mt-6">
            <p className="text-xs text-white/60 text-center font-semibold mb-1">All digital coin purchases are final and non-refundable.</p>
            <p className="text-[10px] text-white/40 text-center">
              Coins have no real-world monetary value. Once purchased, coins cannot be returned, exchanged, or transferred, and are not refunded via Stripe or the shop. Gifts sent to creators are final. Shop (Stripe) refunds, if eligible, are separate — see Terms. Prices may vary by platform.
            </p>
          </div>
          <p className="text-xs text-white/40 text-center mt-3 px-4">
            By purchasing, you agree to our{" "}
            <button
              type="button"
              className="text-white underline cursor-pointer"
              onClick={() => navigate("/terms", { state: containerReturnState(returnTo) })}
            >
              Terms of Use (EULA)
            </button>{" "}
            and{" "}
            <button
              type="button"
              className="text-white underline cursor-pointer"
              onClick={() => navigate("/privacy", { state: containerReturnState(returnTo) })}
            >
              Privacy Policy
            </button>
            .
          </p>
        </div>
      </div>
    </div>
  );
}

function FeatureItem({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-5 h-5 bg-[#FFFFFF] rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
        <Check className="w-3 h-3 text-black" />
      </div>
      <p className="text-sm text-white/80">{text}</p>
    </div>
  );
}
