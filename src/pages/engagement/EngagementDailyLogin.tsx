import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Calendar } from "lucide-react";
import { RoyceBackIcon } from "@/components/royce";
import { apiEngagementDailyLogin, apiEngagementDailyLoginClaim } from "@/features/engagement/engagementDailyLoginApi";
import { createEngagementDailyLoginSession } from "@/features/engagement/engagementDailyLoginSession";
import { ENGAGEMENT_HOME, SETTINGS_HOME, exitToFromLocationState } from "@/lib/settingsNav";
import { showToast } from "@/lib/toast";
import { useAuthStore } from "@/store/useAuthStore";

const DAYS = [1, 2, 3, 4, 5, 6, 7] as const;

export default function EngagementDailyLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const session = useMemo(
    () =>
      createEngagementDailyLoginSession({
        getAccountId: () => useAuthStore.getState().user?.id ?? null,
        loadDaily: apiEngagementDailyLogin,
        claimDaily: apiEngagementDailyLoginClaim,
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

  const daily = view.kind === "ready" ? view.daily : null;

  return (
    <div className="page-above-bottom-nav bg-transparent text-white">
      <div className="page-above-bottom-nav__inner">
        <div className="w-full shrink-0 bg-transparent z-10" style={{ paddingTop: "var(--topnav-anchor-top)" }}>
          <div className="w-full px-3 flex items-center" style={{ minHeight: "var(--topnav-bar-height)" }}>
            <div className="w-10 shrink-0" aria-hidden />
            <div className="flex-1 flex items-center justify-center gap-2 min-w-0">
              <Calendar className="w-5 h-5 royce-icon-gold shrink-0" />
              <h1 className="text-base font-semibold truncate">
                <span className="elix-silver-red-text">Daily Login</span>
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
            <div className="rounded-2xl border border-[#D8D9DD]/30 bg-gradient-to-br from-[#1a1608] to-[#09090B] p-4">
              <p className="text-xs uppercase tracking-wide mb-1">
                <span className="elix-silver-red-text">7-day streak</span>
              </p>
              <p className="text-2xl font-bold mb-2">
                <span className="elix-silver-red-text">Day {daily!.streak_day}</span>
              </p>
              {daily!.next_reward ? (
                <p className="text-sm mb-4">
                  <span className="elix-silver-red-text opacity-70">
                    Next: {daily!.next_reward.reward_label}
                    {daily!.next_reward.reward_xp > 0 ? ` · ${daily!.next_reward.reward_xp} XP` : ""}
                    {daily!.next_reward.reward_promo_coins > 0
                      ? ` · ${daily!.next_reward.reward_promo_coins} Promo`
                      : ""}
                  </span>
                </p>
              ) : daily!.claimed_today ? (
                <p className="text-sm mb-4">
                  <span className="elix-silver-red-text opacity-70">
                    Already claimed today. Come back tomorrow.
                  </span>
                </p>
              ) : null}
              <div className="grid grid-cols-7 gap-1.5 mb-4">
                {DAYS.map((day) => {
                  const filled = daily!.claimed_today ? day <= daily!.streak_day : day < daily!.streak_day;
                  const current = !daily!.claimed_today && day === daily!.streak_day;
                  return (
                    <div
                      key={day}
                      className={`aspect-square rounded-lg flex items-center justify-center text-[11px] font-bold border ${
                        filled
                          ? "bg-transparent border-white/40"
                          : current
                            ? "bg-white/10 border-white/50"
                            : "bg-white/[0.03] border-white/10"
                      }`}
                    >
                      <span className={`elix-silver-red-text ${filled || current ? "" : "opacity-40"}`}>{day}</span>
                    </div>
                  );
                })}
              </div>
              <button
                type="button"
                disabled={!daily!.can_claim || view.claiming}
                onClick={() => void session.claim(userId)}
                className="w-full rounded-xl py-2.5 text-sm font-semibold border border-white/30 bg-transparent disabled:opacity-40 active:opacity-70"
              >
                <span className="elix-silver-red-text">{daily!.claimed_today ? "Claimed" : "Claim today"}</span>
              </button>
              <p className="mt-3 text-[11px]">
                <span className="elix-silver-red-text opacity-55">
                  Rewards are XP, Promotional Coins, or cosmetics only — never Purchased Coins stakes.
                </span>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
