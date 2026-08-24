import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Target } from "lucide-react";
import { RoyceBackIcon } from "@/components/royce";
import { apiEngagementMissionClaim, apiEngagementMissions } from "@/features/engagement/engagementMissionsApi";
import { createEngagementMissionsSession } from "@/features/engagement/engagementMissionsSession";
import type { EngagementMission } from "@shared/contracts";
import {
  ENGAGEMENT_HOME,
  SETTINGS_HOME,
  exitToFromLocationState,
} from "@/lib/settingsNav";
import { showToast } from "@/lib/toast";
import { useAuthStore } from "@/store/useAuthStore";

function MissionSection({
  title,
  items,
  claimingId,
  onClaim,
}: {
  title: string;
  items: EngagementMission[];
  claimingId: string | null;
  onClaim: (id: string) => void;
}) {
  return (
    <div className="mb-4">
      <p className="text-[10px] uppercase tracking-[0.12em] mb-2">
        <span className="elix-silver-red-text opacity-55">{title}</span>
      </p>
      <div className="flex flex-col gap-2">
        {items.map((mission) => {
          const pct = Math.min(100, (Math.max(0, mission.progress) / Math.max(1, mission.goal_count)) * 100);
          return (
            <div key={mission.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">
                    <span className="elix-silver-red-text">{mission.title}</span>
                  </p>
                  <p className="text-[11px]">
                    <span className="elix-silver-red-text opacity-55">{mission.description}</span>
                  </p>
                </div>
                {mission.completed && !mission.claimed ? (
                  <button
                    type="button"
                    disabled={claimingId === mission.id}
                    onClick={() => onClaim(mission.id)}
                    className="shrink-0 rounded-lg bg-transparent border border-white/30 px-2.5 py-1 text-[11px] font-bold active:opacity-70"
                  >
                    <span className="elix-silver-red-text">Claim</span>
                  </button>
                ) : mission.claimed ? (
                  <span className="text-[11px] shrink-0">
                    <span className="elix-silver-red-text opacity-45">Done</span>
                  </span>
                ) : null}
              </div>
              <div className="h-1.5 rounded-full bg-white/10 overflow-hidden mb-1.5">
                <div className="h-full rounded-full bg-[#E6E9EE]" style={{ width: `${pct}%` }} />
              </div>
              <p className="text-[10px] tabular-nums">
                <span className="elix-silver-red-text opacity-55">
                  {mission.progress}/{mission.goal_count} · {mission.reward_xp} XP
                  {mission.reward_promo_coins > 0 ? ` · ${mission.reward_promo_coins} Promo` : ""}
                  {mission.reward_energy > 0 ? ` · ${mission.reward_energy} Energy` : ""}
                </span>
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function EngagementMissions() {
  const navigate = useNavigate();
  const location = useLocation();
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const session = useMemo(
    () =>
      createEngagementMissionsSession({
        getAccountId: () => useAuthStore.getState().user?.id ?? null,
        loadMissions: apiEngagementMissions,
        claimMission: apiEngagementMissionClaim,
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

  const daily = view.kind === "ready" ? view.missions.filter((row) => row.scope === "daily") : [];
  const weekly = view.kind === "ready" ? view.missions.filter((row) => row.scope === "weekly") : [];

  return (
    <div className="page-above-bottom-nav bg-transparent text-white">
      <div className="page-above-bottom-nav__inner">
        <div className="w-full shrink-0 bg-transparent z-10" style={{ paddingTop: "var(--topnav-anchor-top)" }}>
          <div className="w-full px-3 flex items-center" style={{ minHeight: "var(--topnav-bar-height)" }}>
            <div className="w-10 shrink-0" aria-hidden />
            <div className="flex-1 flex items-center justify-center gap-2 min-w-0">
              <Target className="w-5 h-5 royce-icon-gold shrink-0" />
              <h1 className="text-base font-semibold truncate">
                <span className="elix-silver-red-text">Missions</span>
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
              <MissionSection
                title="Daily"
                items={daily}
                claimingId={view.claimingId}
                onClaim={(id) => void session.claim(id, userId)}
              />
              <MissionSection
                title="Weekly"
                items={weekly}
                claimingId={view.claimingId}
                onClaim={(id) => void session.claim(id, userId)}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
