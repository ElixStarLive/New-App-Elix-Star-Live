import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Star } from "lucide-react";
import { RoyceBackIcon } from "@/components/royce";
import { apiEngagementFanLevel } from "@/features/engagement/engagementFanLevelApi";
import { createEngagementFanLevelSession } from "@/features/engagement/engagementFanLevelSession";
import { FAN_TIER_LADDER } from "@shared/engagement/fanTiers";
import { ENGAGEMENT_HOME, SETTINGS_HOME, exitToFromLocationState } from "@/lib/settingsNav";
import { showToast } from "@/lib/toast";
import { useAuthStore } from "@/store/useAuthStore";

export default function EngagementFanLevel() {
  const navigate = useNavigate();
  const location = useLocation();
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const session = useMemo(
    () =>
      createEngagementFanLevelSession({
        getAccountId: () => useAuthStore.getState().user?.id ?? null,
        loadFanLevel: apiEngagementFanLevel,
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

  const fan = view.kind === "ready" ? view.fanLevel : null;

  return (
    <div className="page-above-bottom-nav bg-transparent text-white">
      <div className="page-above-bottom-nav__inner">
        <div className="w-full shrink-0 bg-transparent z-10" style={{ paddingTop: "var(--topnav-anchor-top)" }}>
          <div className="w-full px-3 flex items-center" style={{ minHeight: "var(--topnav-bar-height)" }}>
            <div className="w-10 shrink-0" aria-hidden />
            <div className="flex-1 flex items-center justify-center gap-2 min-w-0">
              <Star className="w-5 h-5 royce-icon-gold shrink-0" />
              <h1 className="text-base font-semibold truncate">
                <span className="elix-silver-red-text">Fan Level</span>
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
              <div className="rounded-2xl border border-[#D8D9DD]/30 bg-gradient-to-br from-[#1a1608] to-[#09090B] p-4 mb-4">
                <p className="text-xs uppercase tracking-wide mb-1">
                  <span className="elix-silver-red-text">{fan?.tier}</span>
                </p>
                <p className="text-3xl font-bold mb-1">
                  <span className="elix-silver-red-text">Level {fan?.level}</span>
                </p>
                <p className="text-sm mb-3 tabular-nums">
                  <span className="elix-silver-red-text opacity-70">
                    {fan?.total_xp} XP
                    {fan?.xp_to_next_level != null ? ` · ${fan.xp_to_next_level} to next` : ""}
                  </span>
                </p>
                <p className="text-[11px]">
                  <span className="elix-silver-red-text opacity-55">
                    Earn XP from watching, gifts, missions, and daily login. Rewards are badges and cosmetics only.
                  </span>
                </p>
              </div>
              <p className="text-[10px] uppercase tracking-[0.12em] mb-2">
                <span className="elix-silver-red-text opacity-55">Tiers</span>
              </p>
              <div className="flex flex-col gap-2">
                {FAN_TIER_LADDER.map((tier) => {
                  const active = (fan?.level ?? 0) >= tier.min;
                  return (
                    <div
                      key={tier.name}
                      className={`rounded-xl border px-3 py-2.5 flex items-center justify-between ${
                        active ? "border-[#D8D9DD]/40 bg-white/[0.04]" : "border-white/10 bg-white/[0.03]"
                      }`}
                    >
                      <span className="text-sm">
                        <span className={`elix-silver-red-text ${active ? "" : "opacity-50"}`}>{tier.name}</span>
                      </span>
                      <span className="text-[11px]">
                        <span className="elix-silver-red-text opacity-55">Lv {tier.min}+</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
