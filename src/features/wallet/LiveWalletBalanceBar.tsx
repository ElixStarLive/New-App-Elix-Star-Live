import { Coins } from "lucide-react";
import { formatWalletCount } from "@/features/wallet/formatWalletCount";
import type { WalletSurfaceStatus } from "@/store/useWalletStore";

export type LiveGiftMoneySource = "paid_coins" | "starter_coins" | "promotional_coins";

type LiveWalletBalanceBarProps = {
  paidCoins: number | null;
  starterCoins: number | null;
  promoCoins: number | null;
  walletStatus: WalletSurfaceStatus;
  giftSource: LiveGiftMoneySource;
  onGiftSourceChange: (source: LiveGiftMoneySource) => void;
  onTopUp: () => void;
  testCoins?: number | null;
  testStatus?: WalletSurfaceStatus;
};

/**
 * PAGE-039 live gift wallet chrome — paid / starter / promo selectors + Top Up.
 * Matches OLD GiftPanel wallet row. Test coins stay a separate non-money line.
 */
export function LiveWalletBalanceBar({
  paidCoins,
  starterCoins,
  promoCoins,
  walletStatus,
  giftSource,
  onGiftSourceChange,
  onTopUp,
  testCoins = null,
  testStatus = "idle",
}: LiveWalletBalanceBarProps) {
  const paidReady = walletStatus === "ready" && paidCoins != null;
  const starterReady = walletStatus === "ready" && starterCoins != null && starterCoins > 0;
  const promoReady = walletStatus === "ready" && promoCoins != null && promoCoins > 0;

  return (
    <div className="mb-2">
      <div className="flex items-center justify-end gap-1.5">
        <div className="flex items-center gap-1 rounded-full px-1.5 py-0.5 border border-[#D8D9DD]/40 bg-transparent">
          {promoReady ? (
            <button
              type="button"
              onClick={() => onGiftSourceChange("promotional_coins")}
              className={`text-[8px] font-bold px-1 py-0.5 rounded ${
                giftSource === "promotional_coins" ? "bg-[#C9CCD1] text-black" : "text-white/60"
              }`}
              title="Promotional coins; zero Diamonds / creator earnings"
            >
              Promo {formatWalletCount(promoCoins, walletStatus)}
            </button>
          ) : null}
          {starterReady ? (
            <button
              type="button"
              onClick={() => onGiftSourceChange("starter_coins")}
              className={`text-[8px] font-bold px-1 py-0.5 rounded ${
                giftSource === "starter_coins"
                  ? "bg-transparent border border-[#D8D9DD]/40 text-[#F5F5F7]"
                  : "text-white/60"
              }`}
              title="Free onboarding coins; no monetary value or creator earnings"
            >
              Starter {formatWalletCount(starterCoins, walletStatus)}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => onGiftSourceChange("paid_coins")}
            className={`flex items-center gap-0.5 text-[8px] font-bold px-1 py-0.5 rounded ${
              giftSource === "paid_coins" ? "text-[#D9A62E]" : "text-[#D9A62E]/70"
            }`}
          >
            <Coins size={10} />
            {paidReady ? formatWalletCount(paidCoins, walletStatus) : formatWalletCount(null, walletStatus)}
          </button>
        </div>
        <button
          type="button"
          onClick={onTopUp}
          className="flex items-center gap-1 flex-shrink-0 rounded-full px-2 py-0.5 border border-[#D8D9DD]/40 bg-transparent active:scale-95 transition-transform"
        >
          <Coins className="w-2.5 h-2.5 text-[#F5F5F7] flex-shrink-0" />
          <span className="text-[#F5F5F7] text-[8px] font-bold whitespace-nowrap">Top Up</span>
        </button>
      </div>
      {giftSource === "starter_coins" ? (
        <p className="text-[9px] text-white/45 mt-1 mb-0 text-right">
          Starter gifts earn XP but create no creator earnings.
        </p>
      ) : null}
      {giftSource === "promotional_coins" ? (
        <p className="text-[9px] text-white/45 mt-1 mb-0 text-right">
          Promo gifts create zero Diamonds / creator earnings.
        </p>
      ) : null}
      <p className="text-[10px] text-white/40 mt-1 text-right">
        Test coins {formatWalletCount(testCoins, testStatus)} (battle score only · not wallet money)
      </p>
    </div>
  );
}

export function giftSourceToBucket(source: LiveGiftMoneySource): "paid" | "promo" | "starter" {
  if (source === "promotional_coins") return "promo";
  if (source === "starter_coins") return "starter";
  return "paid";
}
