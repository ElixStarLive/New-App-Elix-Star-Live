import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Trophy } from "lucide-react";
import { RoyceBackIcon } from "@/components/royce";
import { apiEngagementAchievements } from "@/features/engagement/engagementAchievementsApi";
import { createEngagementAchievementsSession } from "@/features/engagement/engagementAchievementsSession";
import { achievementBarPercent } from "@shared/engagement/achievementProgress";
import type { EngagementAchievement } from "@shared/contracts";
import { ENGAGEMENT_HOME, SETTINGS_HOME, exitToFromLocationState } from "@/lib/settingsNav";
import { showToast } from "@/lib/toast";
import { useAuthStore } from "@/store/useAuthStore";

function AchievementCard({ achievement }: { achievement: EngagementAchievement }) {
  const pct = achievementBarPercent(achievement.progress, achievement.goal_count);
  return (
    <div
      role="listitem"
      aria-label={`${achievement.name}. ${achievement.unlocked ? "Unlocked" : "Locked"}. Progress ${achievement.progress} of ${achievement.goal_count}.`}
      className={`rounded-xl border p-3 ${
        achievement.unlocked ? "border-[#D8D9DD]/40 bg-white/[0.04]" : "border-white/10 bg-white/[0.03]"
      }`}
    >
      <div className="flex items-start gap-2 mb-1.5">
        <span className="text-xl leading-none" aria-hidden>
          {achievement.icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            <span className="elix-silver-red-text">{achievement.name}</span>
          </p>
          <p className="text-[11px]">
            <span className="elix-silver-red-text opacity-55">{achievement.description}</span>
          </p>
        </div>
        <span className="text-[10px] uppercase shrink-0">
          <span className="elix-silver-red-text opacity-70">{achievement.rarity}</span>
        </span>
      </div>
      <div
        className="h-1.5 rounded-full bg-white/10 overflow-hidden mb-1"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={achievement.goal_count}
        aria-valuenow={achievement.progress}
        aria-label={`${achievement.name} progress`}
      >
        <div className="h-full rounded-full bg-[#E6E9EE]" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-[10px] tabular-nums">
        <span className="elix-silver-red-text opacity-55">
          {achievement.progress}/{achievement.goal_count}
          {achievement.reward_xp > 0 ? ` · ${achievement.reward_xp} XP` : ""}
          {achievement.reward_promo_coins > 0 ? ` · ${achievement.reward_promo_coins} Promo` : ""}
          {achievement.unlocked ? " · Unlocked" : ""}
        </span>
      </p>
    </div>
  );
}

export default function EngagementAchievements() {
  const navigate = useNavigate();
  const location = useLocation();
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const session = useMemo(
    () =>
      createEngagementAchievementsSession({
        getAccountId: () => useAuthStore.getState().user?.id ?? null,
        loadAchievements: apiEngagementAchievements,
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

  const items = view.kind === "ready" ? view.achievements : [];

  return (
    <div className="page-above-bottom-nav bg-transparent text-white">
      <div className="page-above-bottom-nav__inner engagement-panel-writing">
        <div className="w-full shrink-0 bg-transparent z-10" style={{ paddingTop: "var(--topnav-anchor-top)" }}>
          <div className="w-full px-3 flex items-center" style={{ minHeight: "var(--topnav-bar-height)" }}>
            <div className="w-10 shrink-0" aria-hidden />
            <div className="flex-1 flex items-center justify-center gap-2 min-w-0">
              <Trophy className="w-5 h-5 royce-icon-gold shrink-0" />
              <h1 className="text-base font-semibold truncate">
                <span className="elix-silver-red-text">Achievements</span>
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
            <div className="flex flex-col gap-2" role="list">
              {items.map((achievement) => (
                <AchievementCard key={achievement.id} achievement={achievement} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
