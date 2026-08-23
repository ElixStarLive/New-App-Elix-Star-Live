import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Crown } from "lucide-react";
import { RoyceBackIcon } from "@/components/royce";
import { apiEngagementMvp } from "@/features/engagement/engagementMvpApi";
import { createEngagementMvpSession } from "@/features/engagement/engagementMvpSession";
import type { EngagementMvpPeriod } from "@shared/contracts";
import { ENGAGEMENT_HOME, SETTINGS_HOME, exitToFromLocationState } from "@/lib/settingsNav";
import { showToast } from "@/lib/toast";
import { useAuthStore } from "@/store/useAuthStore";

const PERIODS: Array<[EngagementMvpPeriod, string]> = [
  ["today", "Today"],
  ["week", "Week"],
  ["all", "All"],
];

export default function EngagementMvp() {
  const navigate = useNavigate();
  const location = useLocation();
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const [period, setPeriod] = useState<EngagementMvpPeriod>("today");
  const session = useMemo(
    () =>
      createEngagementMvpSession({
        getAccountId: () => useAuthStore.getState().user?.id ?? null,
        loadMvp: apiEngagementMvp,
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
    if (userId) void session.load(userId, period);
  }, [session, userId, period]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const accountId = useAuthStore.getState().user?.id ?? null;
      if (accountId) void session.load(accountId, period);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [session, period]);

  const exit = useCallback(() => {
    navigate(exitToFromLocationState(location.state, ENGAGEMENT_HOME), { replace: true });
  }, [navigate, location.state]);

  const rows = view.kind === "ready" ? view.board.leaderboard : [];
  const viewerId = view.kind === "ready" ? view.board.viewer_id : "";

  return (
    <div className="page-above-bottom-nav bg-transparent text-white">
      <div className="page-above-bottom-nav__inner">
        <div className="w-full shrink-0 bg-transparent z-10" style={{ paddingTop: "var(--topnav-anchor-top)" }}>
          <div className="w-full px-3 flex items-center" style={{ minHeight: "var(--topnav-bar-height)" }}>
            <div className="w-10 shrink-0" aria-hidden />
            <div className="flex-1 flex items-center justify-center gap-2 min-w-0">
              <Crown className="w-5 h-5 royce-icon-gold shrink-0" />
              <h1 className="text-base font-semibold truncate">
                <span className="elix-silver-red-text">MVP Leaderboard</span>
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
          <div className="flex gap-2 mb-4">
            {PERIODS.map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setPeriod(id)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold border border-transparent transition-opacity ${
                  period === id ? "opacity-100" : "opacity-45"
                }`}
              >
                <span className="elix-silver-red-text">{label}</span>
              </button>
            ))}
          </div>
          <p className="text-[11px] mb-3">
            <span className="elix-silver-red-text opacity-55">
              Live room MVP circles stay on the stream. This board is session/day/week aggregates from gift support.
              Battle Energy boosts Fan Energy separately.
            </span>
          </p>
          {view.kind === "loading" ? (
            <div className="py-10 text-center text-sm">
              <span className="elix-silver-red-text opacity-50">Loading...</span>
            </div>
          ) : view.kind === "error" ? (
            <div className="py-10 text-center text-sm text-rose-300">{view.error}</div>
          ) : rows.length === 0 ? (
            <div className="py-10 text-center text-sm">
              <span className="elix-silver-red-text opacity-50">No MVP scores yet.</span>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {rows.map((row) => {
                const mine = Boolean(viewerId) && row.user_id === viewerId;
                return (
                  <div
                    key={`${row.rank}-${row.user_id}`}
                    className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${
                      mine ? "border-[#D8D9DD]/40 bg-white/[0.04]" : "border-white/10 bg-white/[0.03]"
                    }`}
                  >
                    <span className="w-7 text-sm font-bold tabular-nums">
                      <span className="elix-silver-red-text">#{row.rank}</span>
                    </span>
                    <span className="flex-1 min-w-0 text-sm truncate">
                      <span className="elix-silver-red-text">{mine ? "You" : row.user_id.slice(0, 10)}</span>
                    </span>
                    <span className="text-sm font-semibold tabular-nums">
                      <span className="elix-silver-red-text">{row.points}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
