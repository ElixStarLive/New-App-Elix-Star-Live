import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Wallet, Zap } from "lucide-react";
import { RoyceBackIcon } from "@/components/royce";
import { apiEngagementRewardWallet } from "@/features/engagement/engagementRewardWalletApi";
import { createEngagementRewardWalletSession } from "@/features/engagement/engagementRewardWalletSession";
import { ENGAGEMENT_HOME, SETTINGS_HOME, exitToFromLocationState } from "@/lib/settingsNav";
import { showToast } from "@/lib/toast";
import { useAuthStore } from "@/store/useAuthStore";

function BalanceRow({
  label,
  value,
  note,
}: {
  label: string;
  value: string | number;
  note: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 mb-2">
      <div className="flex items-center justify-between gap-2 mb-0.5">
        <span className="text-sm font-semibold">
          <span className="elix-silver-red-text">{label}</span>
        </span>
        <span className="text-sm font-bold tabular-nums">
          <span className="elix-silver-red-text">{value}</span>
        </span>
      </div>
      <p className="text-[11px]">
        <span className="elix-silver-red-text opacity-55">{note}</span>
      </p>
    </div>
  );
}

export default function EngagementRewards() {
  const navigate = useNavigate();
  const location = useLocation();
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const session = useMemo(
    () =>
      createEngagementRewardWalletSession({
        getAccountId: () => useAuthStore.getState().user?.id ?? null,
        loadWallet: apiEngagementRewardWallet,
        toast: showToast,
        onSessionExpired: () => {
          void useAuthStore.getState().checkUser();
        },
        onDisabled: () => {
          navigate(SETTINGS_HOME, { replace: true });
        },
      }),
    [navigate],
  );
  const view = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);

  useEffect(() => {
    session.bindAccount(userId);
    if (userId) void session.load(userId);
  }, [session, userId]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const accountId = useAuthStore.getState().user?.id ?? null;
      if (accountId) void session.load(accountId);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [session]);

  const exit = useCallback(() => {
    navigate(exitToFromLocationState(location.state, ENGAGEMENT_HOME), { replace: true });
  }, [navigate, location.state]);

  const wallet = view.kind === "ready" ? view.wallet : null;

  return (
    <div className="page-above-bottom-nav bg-transparent text-white">
      <div className="page-above-bottom-nav__inner">
        <div className="w-full shrink-0 bg-transparent z-10" style={{ paddingTop: "var(--topnav-anchor-top)" }}>
          <div className="w-full px-3 flex items-center" style={{ minHeight: "var(--topnav-bar-height)" }}>
            <div className="w-10 shrink-0" aria-hidden />
            <div className="flex-1 flex items-center justify-center gap-2 min-w-0">
              <Wallet className="w-5 h-5 royce-icon-gold shrink-0" />
              <h1 className="text-base font-semibold truncate">
                <span className="elix-silver-red-text">Reward Wallet</span>
              </h1>
            </div>
            <button
              type="button"
              onClick={exit}
              className="w-10 h-10 shrink-0 flex items-center justify-center"
              aria-label="Close"
              title="Close"
            >
              <RoyceBackIcon className="w-6 h-6 text-white" />
            </button>
          </div>
        </div>
        <div className="px-3 pb-6">
          {view.kind === "loading" ? (
            <div className="py-10 text-center text-sm">
              <span className="elix-silver-red-text opacity-50">Loading...</span>
            </div>
          ) : view.kind === "error" ? (
            <div className="py-10 text-center text-sm text-rose-300">{view.error}</div>
          ) : (
            <>
              <BalanceRow
                label="Available for gifts"
                value={wallet!.totalGiftSpendable}
                note="Display total only. Server chooses which balance is spent."
              />
              <BalanceRow
                label="Purchased Coins"
                value={wallet!.purchasedCoins}
                note="From IAP / real money. Used for gifts. Never mixed with promo."
              />
              <BalanceRow
                label="Promotional Coins"
                value={wallet!.promotionalCoins}
                note="Platform rewards. Not withdrawable. Promo gifts create zero Diamonds."
              />
              <BalanceRow
                label="Starter Coins"
                value={wallet!.starterCoins}
                note="Onboarding free coins. Separate from purchased and promo."
              />
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 mb-2">
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <span className="text-sm font-semibold flex items-center gap-1">
                    <Zap className="w-3.5 h-3.5 royce-icon-gold" />
                    <span className="elix-silver-red-text">Battle Energy</span>
                  </span>
                  <span className="text-sm font-bold tabular-nums">
                    <span className="elix-silver-red-text">{wallet!.battleEnergy}</span>
                  </span>
                </div>
                <p className="text-[11px]">
                  <span className="elix-silver-red-text opacity-55">
                    Free LIVE boost power. Affects battle score only — never Diamonds.
                  </span>
                </p>
              </div>
              <BalanceRow
                label="XP / Fan Level"
                value={`${wallet!.totalXp} XP · Lv ${wallet!.fanLevel}`}
                note={`${wallet!.fanTier} — progression only, not currency.`}
              />
              <p className="mt-3 text-[11px] leading-relaxed">
                <span className="elix-silver-red-text opacity-55">
                  Test coins stay local for UI testing and never appear here.
                </span>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
