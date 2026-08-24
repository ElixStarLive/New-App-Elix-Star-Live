import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Banknote, Landmark, Wallet } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import SettingsOptionSheet from "@/components/SettingsOptionSheet";
import {
  apiCreatorOnboard,
  apiCreatorPayoutSnapshot,
  apiCreatorSavePayoutMethod,
  apiCreatorWithdrawGbp,
} from "@/features/creator/creatorPayoutApi";
import { createCreatorPayoutSession } from "@/features/creator/creatorPayoutSession";
import { formatPence, poundsInputToPence } from "@/features/creator/formatPence";
import { openStripeHostedUrl, platform } from "@/lib/platform";
import { SETTINGS_HOME, exitToFromLocationState } from "@/lib/settingsNav";
import { showToast } from "@/lib/toast";
import { useAuthStore } from "@/store/useAuthStore";

export const PAYOUT_HOME = "/settings/payout";

const GBP_STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  approved: "Approved",
  processing: "Processing",
  paid: "Paid",
  failed: "Failed",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

function SectionLabel({ text }: { text: string }) {
  return (
    <div className="mt-3.5 mb-1 px-1 text-[10px] uppercase tracking-[0.12em] text-[#8B9099] leading-none">
      {text}
    </div>
  );
}

function PayoutMetric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div className="text-[#8B9099] uppercase text-[9px]">{label}</div>
      <div className="text-[#E6E9EE] font-semibold tabular-nums text-[13px]">{value}</div>
    </div>
  );
}

export default function CreatorPayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const queryHandledRef = useRef(false);
  const [methodType, setMethodType] = useState<"bank" | "paypal">("bank");
  const [accountName, setAccountName] = useState("");
  const [accountDetail, setAccountDetail] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");

  const session = useMemo(
    () =>
      createCreatorPayoutSession({
        getAccountId: () => useAuthStore.getState().user?.id ?? null,
        loadSnapshot: apiCreatorPayoutSnapshot,
        saveMethod: apiCreatorSavePayoutMethod,
        withdraw: apiCreatorWithdrawGbp,
        onboard: apiCreatorOnboard,
        openOnboardingUrl: openStripeHostedUrl,
        toast: showToast,
        onSessionExpired: () => {
          void useAuthStore.getState().checkUser();
        },
      }),
    [],
  );
  const view = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);

  useEffect(() => {
    setMethodType("bank");
    setAccountName("");
    setAccountDetail("");
    setWithdrawAmount("");
    void session.load(userId);
  }, [session, userId]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") session.finishConnectReturn();
    };
    if (!platform.isNative) {
      document.addEventListener("visibilitychange", onVisible);
    }
    let cancelled = false;
    let browserHandle: { remove: () => Promise<void> } | null = null;
    let appHandle: { remove: () => Promise<void> } | null = null;
    if (platform.isNative) {
      void (async () => {
        const { Browser } = await import("@capacitor/browser");
        const { App } = await import("@capacitor/app");
        if (cancelled) return;
        browserHandle = await Browser.addListener("browserFinished", () => {
          session.finishConnectReturn();
        });
        if (cancelled) {
          void browserHandle.remove();
          browserHandle = null;
          return;
        }
        appHandle = await App.addListener("appStateChange", ({ isActive }) => {
          if (isActive) session.finishConnectReturn();
        });
        if (cancelled) {
          void appHandle.remove();
          appHandle = null;
        }
      })();
    }
    return () => {
      cancelled = true;
      if (!platform.isNative) {
        document.removeEventListener("visibilitychange", onVisible);
      }
      void browserHandle?.remove();
      void appHandle?.remove();
    };
  }, [session]);

  const exit = useCallback(() => {
    navigate(exitToFromLocationState(location.state, SETTINGS_HOME), { replace: true });
  }, [navigate, location.state]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const refresh = params.get("payout_refresh") === "1";
    const returned = params.get("payout_return") === "1";
    if (!refresh && !returned) return;
    if (queryHandledRef.current) return;
    queryHandledRef.current = true;
    navigate({ pathname: PAYOUT_HOME, search: "" }, { replace: true, state: location.state });
    if (refresh) {
      void session.startOnboard();
      return;
    }
    void session.reloadSilent();
  }, [location.search, location.state, navigate, session]);

  const balance = view.kind === "ready" ? view.balance : null;

  return (
    <SettingsOptionSheet onClose={exit} title="Creator Payout">
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-3 pt-2 pb-[3mm]">
        {view.kind === "loading" ? (
          <div className="flex justify-center py-10">
            <div className="w-6 h-6 border-2 border-[#E6E9EE]/25 border-t-[#E6E9EE] rounded-full animate-spin elix-loader" />
          </div>
        ) : null}
        {view.kind === "error" ? (
          <div className="text-center py-12 text-[#8B9099]">{view.error}</div>
        ) : null}
        {view.kind === "ready" && balance ? (
          <div className="flex flex-col gap-0 max-w-full min-h-full">
            <SectionLabel text="Creator earnings (GBP)" />
            <div className="px-2.5 py-2 flex items-center gap-2 text-[#E6E9EE] font-semibold text-[13px]">
              <Wallet size={16} className="royce-icon-gold" /> Creator earnings (GBP)
            </div>
            <p className="px-2.5 text-[11px] text-[#C8CDD5] leading-snug">
              Creators receive 60% of eligible net gift and creator-subscription revenue received by Elix Star
              Live after applicable store fees, taxes, refunds, chargebacks and processing deductions.
            </p>
            <p className="px-2.5 mt-1.5 text-[11px] text-[#8B9099] leading-snug">
              Video rewards use qualified unique views. Repeated watches by the same user do not create
              additional qualified reward views. Test, free and promotional coins never create withdrawable
              earnings. Promote Video purchases are platform advertising revenue only (0% to creators).
            </p>
            <div className="grid grid-cols-2 gap-3 px-2.5 pt-3 text-[12px]">
              <PayoutMetric
                label="GBP available"
                value={<span className="text-[#D9A62E] font-bold text-lg">{formatPence(balance.gbp.available_pence)}</span>}
              />
              <PayoutMetric
                label="GBP pending"
                value={<span className="font-bold text-lg text-white">{formatPence(balance.gbp.pending_pence)}</span>}
              />
              <PayoutMetric label="GBP withdrawn" value={formatPence(balance.gbp.withdrawn_pence)} />
              <PayoutMetric
                label="GBP reversed / held"
                value={`${formatPence(balance.gbp.reversed_pence)} / ${formatPence(balance.gbp.held_pence)}`}
              />
              <PayoutMetric label="Gift earnings" value={formatPence(balance.earnings_by_source.gifts_pence)} />
              <PayoutMetric
                label="Subscription earnings"
                value={formatPence(balance.earnings_by_source.subscriptions_pence)}
              />
              <PayoutMetric label="Rewards earnings" value={formatPence(balance.earnings_by_source.rewards_pence)} />
              <PayoutMetric label="Active subscribers" value={balance.active_subscribers.toLocaleString()} />
              <PayoutMetric
                label="Qualified views (30d)"
                value={balance.rewards.qualified_views_30d.toLocaleString()}
              />
              <PayoutMetric
                label="Reward milestone"
                value={
                  <>
                    {formatPence(balance.rewards.current_reward_pence)}
                    {balance.rewards.next_milestone_views != null
                      ? ` → ${formatPence(balance.rewards.next_milestone_reward_pence ?? 0)} @ ${balance.rewards.next_milestone_views.toLocaleString()}`
                      : ""}
                  </>
                }
              />
              <PayoutMetric label="Diamonds (ops only)" value={balance.available_coins.toLocaleString()} />
              <PayoutMetric label="Diamonds pending" value={balance.pending_coins.toLocaleString()} />
            </div>

            <SectionLabel text="Stripe Connect (GBP payouts)" />
            <div className="px-2.5 py-2 flex items-center gap-2 text-[#E6E9EE] font-semibold text-[13px]">
              <Banknote size={16} className="royce-icon-gold" /> Stripe Connect
            </div>
            <p className="px-2.5 text-[11px] text-[#8B9099]">
              Status: {view.connectStatus}. Connect is required for automatic provider payouts with transaction IDs.
            </p>
            <div className="px-2.5 pt-2">
              <button
                type="button"
                disabled={view.onboarding || view.connectStatus === "ready"}
                onClick={() => {
                  void session.startOnboard();
                }}
                className="w-full py-2.5 rounded-lg bg-[#E6E9EE] text-white elix-accent text-[12px] font-bold disabled:opacity-50"
              >
                {view.connectStatus === "ready"
                  ? "Stripe Connect ready"
                  : view.onboarding
                    ? "Opening…"
                    : "Set up Stripe Connect"}
              </button>
            </div>

            <SectionLabel text="Payment method" />
            <div className="px-2.5 py-2 flex items-center gap-2 text-[#E6E9EE] font-semibold text-[13px]">
              <Landmark size={16} className="royce-icon-gold" /> Payment method
            </div>
            {view.methods.length > 0 ? (
              <ul className="px-2.5 space-y-1">
                {view.methods.map((method) => (
                  <li key={method.id} className="text-[12px] text-[#C8CDD5]">
                    {(method.type || "method").toUpperCase()}
                    {method.is_default ? " · default" : ""}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-2.5 text-[#8B9099] text-[11px]">Add how you want to receive gift earnings after live.</p>
            )}
            <div className="flex gap-2 px-2.5 pt-2">
              <button
                type="button"
                onClick={() => setMethodType("bank")}
                className={`flex-1 py-2 rounded-lg text-[11px] font-bold border ${methodType === "bank" ? "bg-white/10 border-[#E6E9EE]/45 text-white" : "bg-transparent border-white/10 text-[#C8CDD5]"}`}
              >
                Bank
              </button>
              <button
                type="button"
                onClick={() => setMethodType("paypal")}
                className={`flex-1 py-2 rounded-lg text-[11px] font-bold border ${methodType === "paypal" ? "bg-white/10 border-[#E6E9EE]/45 text-white" : "bg-transparent border-white/10 text-[#C8CDD5]"}`}
              >
                PayPal
              </button>
            </div>
            <div className="px-2.5 pt-2 space-y-2">
              <input
                value={accountName}
                onChange={(event) => setAccountName(event.target.value)}
                placeholder="Account name"
                className="w-full bg-transparent border border-white/10 rounded-lg px-3 py-2 text-white text-[12px] outline-none"
              />
              <input
                value={accountDetail}
                onChange={(event) => setAccountDetail(event.target.value)}
                placeholder={methodType === "paypal" ? "PayPal email" : "IBAN / account number"}
                className="w-full bg-transparent border border-white/10 rounded-lg px-3 py-2 text-white text-[12px] outline-none"
              />
              <button
                type="button"
                disabled={view.savingMethod}
                onClick={() => {
                  if (!accountName.trim() || !accountDetail.trim()) {
                    showToast("Enter payout details");
                    return;
                  }
                  void session
                    .saveMethod({
                      type: methodType,
                      details:
                        methodType === "paypal"
                          ? { email: accountDetail.trim(), name: accountName.trim() }
                          : { account_name: accountName.trim(), iban_or_account: accountDetail.trim() },
                    })
                    .then((saved) => {
                      if (saved) {
                        setAccountName("");
                        setAccountDetail("");
                      }
                    });
                }}
                className="w-full py-2.5 rounded-lg bg-white/10 border border-white/10 text-[#E6E9EE] text-[12px] font-bold disabled:opacity-50"
              >
                {view.savingMethod ? "Saving..." : "Save payout method"}
              </button>
            </div>

            <SectionLabel text="Withdraw GBP" />
            <div className="px-2.5 py-2 flex items-center gap-2 text-[#E6E9EE] font-semibold text-[13px]">
              <Banknote size={16} className="royce-icon-gold" /> Withdraw GBP
            </div>
            <div className="px-2.5 space-y-2">
              <input
                value={withdrawAmount}
                onChange={(event) => setWithdrawAmount(event.target.value.replace(/[^\d.]/g, ""))}
                placeholder="Amount in GBP (e.g. 10.00)"
                inputMode="decimal"
                className="w-full bg-transparent border border-white/10 rounded-lg px-3 py-2 text-white text-[12px] outline-none"
              />
              <button
                type="button"
                disabled={view.withdrawing}
                onClick={() => {
                  const pence = poundsInputToPence(withdrawAmount);
                  if (pence == null) {
                    showToast("Enter a valid GBP amount");
                    return;
                  }
                  void session.withdraw(pence).then((ok) => {
                    if (ok) setWithdrawAmount("");
                  });
                }}
                className="w-full py-2.5 rounded-lg bg-white/10 border border-white/10 text-[#E6E9EE] text-[12px] font-bold disabled:opacity-50"
              >
                {view.withdrawing ? "Submitting..." : "Request GBP withdrawal"}
              </button>
              <p className="text-[10px] text-[#8B9099]">
                Only available GBP earnings can be withdrawn. Coin Diamonds are not cash. Status: Pending → Approved → Processing → Paid.
              </p>
            </div>

            {view.withdrawals.length > 0 ? (
              <>
                <SectionLabel text="GBP withdrawal history" />
                <div className="px-2.5 space-y-2">
                  {view.withdrawals.slice(0, 10).map((row) => (
                    <div key={row.id} className="flex flex-col gap-0.5 text-[11px]">
                      <div className="flex justify-between gap-2">
                        <span className="text-[#C8CDD5] tabular-nums">{formatPence(row.amount_pence)}</span>
                        <span className="text-[#8B9099]">{GBP_STATUS_LABEL[row.status] || row.status}</span>
                      </div>
                      {row.payout_provider_ref ? (
                        <span className="text-[#8B9099] font-mono text-[10px] truncate">
                          {row.payout_provider_ref}
                        </span>
                      ) : null}
                    </div>
                  ))}
                </div>
              </>
            ) : null}

            {view.ledger.length > 0 ? (
              <>
                <SectionLabel text="Ledger history" />
                <div className="px-2.5 space-y-2 pb-2">
                  {view.ledger.slice(0, 15).map((row) => (
                    <div key={row.id} className="flex justify-between gap-2 text-[11px]">
                      <span className="text-[#8B9099] truncate">{row.revenue_source}</span>
                      <span className="text-[#C8CDD5] tabular-nums">{formatPence(row.creator_amount_pence)}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </SettingsOptionSheet>
  );
}
