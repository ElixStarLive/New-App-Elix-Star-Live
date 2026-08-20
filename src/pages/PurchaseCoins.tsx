import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, RotateCcw, Sparkles, X } from "lucide-react";
import { apiListCoinProducts, purchaseCoinProduct, type CoinProduct } from "@/features/iap/iapApi";
import { useWalletStore } from "@/store/useWalletStore";
import { showToast } from "@/lib/toast";
import { platform } from "@/lib/platform";

export default function PurchaseCoins() {
  const navigate = useNavigate();
  const fetchWallet = useWalletStore((s) => s.fetchWallet);
  const [products, setProducts] = useState<CoinProduct[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const isNative = platform.isNative;

  useEffect(() => {
    void fetchWallet();
    void apiListCoinProducts().then((res) => {
      if (res.error) setError(res.error);
      else setProducts(res.products);
    });
  }, [fetchWallet]);

  return (
    <div className="h-full min-h-0 w-full bg-transparent text-white flex justify-center px-2">
      <div className="w-full max-w-[480px] h-full min-h-0 flex flex-col overflow-hidden">
        <div className="sticky top-0 z-10 px-4 py-4 flex items-center justify-between" style={{ paddingTop: "var(--page-header-top)" }}>
          <button type="button" onClick={() => navigate("/feed", { replace: true })} className="p-2" title="Back">
            <X size={18} />
          </button>
          <h1 className="text-lg font-bold">Get Coins</h1>
          {isNative ? (
            <button type="button" disabled={busyId !== null} className="p-2" title="Restore purchases">
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
              {error ? <p className="text-rose-300 text-sm">{error}</p> : null}
              {products.map((product) => (
                <button
                  key={product.productId}
                  type="button"
                  disabled={busyId !== null}
                  onClick={() => {
                    setBusyId(product.productId);
                    void purchaseCoinProduct(product.productId).then((r) => {
                      setBusyId(null);
                      if (!r.ok) showToast(r.error);
                      else void fetchWallet();
                    });
                  }}
                  className="w-full p-6 rounded-2xl bg-white/5 border-2 border-transparent disabled:opacity-50"
                >
                  <div className="flex items-center justify-between">
                    <div className="text-left">
                      <div className="flex items-center gap-2 mb-2">
                        <Sparkles className="w-6 h-6 text-[#F5F5F7]" />
                        <span className="text-2xl font-bold">{product.coins.toLocaleString()}</span>
                      </div>
                      <p className="text-sm text-white/60">{product.label}</p>
                    </div>
                    <div className="text-2xl font-bold text-[#F5F5F7]">{product.label}</div>
                  </div>
                  {busyId === product.productId ? <div className="mt-4 text-center text-sm text-white/60">Processing…</div> : null}
                </button>
              ))}
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
            <Feature text="Send virtual gifts to your favorite creators" />
            <Feature text="Activate battle boosters during live competitions" />
            <Feature text="Unlock premium features and filters" />
            <Feature text="Support the community and help creators grow" />
          </div>
          <div className="bg-white/5 border border-white/10 rounded-xl p-4 mt-6">
            <p className="text-xs text-white/60 text-center font-semibold mb-1">All digital coin purchases are final and non-refundable.</p>
            <p className="text-[10px] text-white/40 text-center">
              Coins have no real-world monetary value. Test coins are never money. Shop (Stripe) refunds, if eligible, are separate.
            </p>
          </div>
          <p className="text-xs text-white/40 text-center mt-3 px-4">
            By purchasing, you agree to our{" "}
            <button type="button" className="text-white underline" onClick={() => navigate("/terms")}>
              Terms of Service
            </button>{" "}
            and{" "}
            <button type="button" className="text-white underline" onClick={() => navigate("/privacy")}>
              Privacy Policy
            </button>
            .
          </p>
        </div>
      </div>
    </div>
  );
}

function Feature({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-5 h-5 bg-[#FFFFFF] rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
        <Check className="w-3 h-3 text-black" />
      </div>
      <p className="text-sm text-white/80">{text}</p>
    </div>
  );
}
