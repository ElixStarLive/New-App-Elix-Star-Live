import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Coins, ShieldCheck, Sparkles } from "lucide-react";
import {
  ADMIN_PROGRESSION_ADJUST_STARTER,
  ADMIN_PROGRESSION_ADJUST_XP,
  ADMIN_PROGRESSION_ADMIN_AUDIT_TITLE,
  ADMIN_PROGRESSION_AMOUNT,
  ADMIN_PROGRESSION_ARCHIVE,
  ADMIN_PROGRESSION_AUDIT_EMPTY,
  ADMIN_PROGRESSION_BACK,
  ADMIN_PROGRESSION_CAPS_SAVED,
  ADMIN_PROGRESSION_CLAIMS_NOTE,
  ADMIN_PROGRESSION_DAILY_SAVED,
  ADMIN_PROGRESSION_DAILY_TITLE,
  ADMIN_PROGRESSION_ENERGY_FIELDS,
  ADMIN_PROGRESSION_ENERGY_NOTE,
  ADMIN_PROGRESSION_ENERGY_TITLE,
  ADMIN_PROGRESSION_ERROR,
  ADMIN_PROGRESSION_FLAG_OFF,
  ADMIN_PROGRESSION_FLAG_ON,
  ADMIN_PROGRESSION_FLAG_SAVED,
  ADMIN_PROGRESSION_FLAGS_LOADING,
  ADMIN_PROGRESSION_FLAGS_TITLE,
  ADMIN_PROGRESSION_HIGH_IMPACT_FLAGS,
  ADMIN_PROGRESSION_LEVELS_TITLE,
  ADMIN_PROGRESSION_LEVEL_SAVED,
  ADMIN_PROGRESSION_LOAD,
  ADMIN_PROGRESSION_LOADING,
  ADMIN_PROGRESSION_MISSIONS_EMPTY,
  ADMIN_PROGRESSION_MISSIONS_TITLE,
  ADMIN_PROGRESSION_MISSION_ARCHIVED,
  ADMIN_PROGRESSION_MISSION_AUDIENCES,
  ADMIN_PROGRESSION_MISSION_SAVED,
  ADMIN_PROGRESSION_NEED_FIELDS,
  ADMIN_PROGRESSION_PARENT,
  ADMIN_PROGRESSION_PHASE_MIGRATION,
  ADMIN_PROGRESSION_PHASE_TITLE,
  ADMIN_PROGRESSION_POLICY_SAVED,
  ADMIN_PROGRESSION_REASON,
  ADMIN_PROGRESSION_SAVE,
  ADMIN_PROGRESSION_SAVE_CAPS,
  ADMIN_PROGRESSION_SAVE_POLICY,
  ADMIN_PROGRESSION_STARTER_ADJUSTED,
  ADMIN_PROGRESSION_TITLE,
  ADMIN_PROGRESSION_USER_ID,
  ADMIN_PROGRESSION_USER_TITLE,
  ADMIN_PROGRESSION_XP_ADJUSTED,
  ADMIN_PROGRESSION_XP_SAVED,
  ADMIN_PROGRESSION_XP_TITLE,
} from "@/content/adminProgression";
import {
  apiAdminProgressionAdjust,
  apiAdminProgressionArchiveMission,
  apiAdminProgressionLoadConfig,
  apiAdminProgressionLoadEngagementAdmin,
  apiAdminProgressionLoadUser,
  apiAdminProgressionSaveBattleEnergyCaps,
  apiAdminProgressionSaveConfig,
  apiAdminProgressionSaveDailyPolicy,
  apiAdminProgressionSaveDailyReward,
  apiAdminProgressionSaveLevel,
  apiAdminProgressionSaveMission,
  apiAdminProgressionToggleFeatureFlag,
  type AdminBattleEnergyCaps,
  type AdminDailyPolicy,
  type AdminDailyReward,
  type AdminFeatureFlagRow,
  type AdminLevelRow,
  type AdminMissionRow,
  type AdminProgressionAudit,
  type AdminProgressionUser,
  type AdminStarterHistory,
  type AdminXpConfig,
  type AdminXpHistory,
} from "@/features/admin/adminApi";
import { showToast } from "@/lib/toast";
import { useAuthStore } from "@/store/useAuthStore";

const inputClass = "bg-[#0f1218] border border-white/10 rounded-lg px-3 py-2 text-sm text-white";

export default function AdminProgression() {
  const navigate = useNavigate();
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const isAdmin = useAuthStore((state) => state.user?.isAdmin === true);
  const requestIdRef = useRef(0);
  const [ready, setReady] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [config, setConfig] = useState<AdminXpConfig[] | null>(null);
  const [levels, setLevels] = useState<AdminLevelRow[] | null>(null);
  const [engagementFlags, setEngagementFlags] = useState<Record<string, boolean> | null>(null);
  const [flagRows, setFlagRows] = useState<AdminFeatureFlagRow[] | null>(null);
  const [missions, setMissions] = useState<AdminMissionRow[] | null>(null);
  const [dailyRewards, setDailyRewards] = useState<AdminDailyReward[] | null>(null);
  const [dailyPolicy, setDailyPolicy] = useState<AdminDailyPolicy | null>(null);
  const [energyCaps, setEnergyCaps] = useState<AdminBattleEnergyCaps | null>(null);
  const [auditEntries, setAuditEntries] = useState<AdminProgressionAudit[] | null>(null);
  const [lookupUserId, setLookupUserId] = useState("");
  const [userProgression, setUserProgression] = useState<AdminProgressionUser | null>(null);
  const [xpHistory, setXpHistory] = useState<AdminXpHistory[]>([]);
  const [starterHistory, setStarterHistory] = useState<AdminStarterHistory[]>([]);
  const [adjustment, setAdjustment] = useState({ amount: "", reason: "" });

  const stillAdmin = () => useAuthStore.getState().user?.id === userId && useAuthStore.getState().user?.isAdmin === true;

  const reload = async () => {
    if (!userId || !isAdmin) {
      setReady(false);
      setConfig(null);
      setLevels(null);
      setEngagementFlags(null);
      setFlagRows(null);
      setMissions(null);
      setDailyRewards(null);
      setDailyPolicy(null);
      setEnergyCaps(null);
      setAuditEntries(null);
      return;
    }
    const ownerId = userId;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setListLoading(true);
    const [configResult, engagement] = await Promise.all([
      apiAdminProgressionLoadConfig(),
      apiAdminProgressionLoadEngagementAdmin(),
    ]);
    if (requestIdRef.current !== requestId) return;
    if (useAuthStore.getState().user?.id !== ownerId || useAuthStore.getState().user?.isAdmin !== true) {
      setReady(false);
      setListLoading(false);
      return;
    }
    if (configResult.error || !configResult.config || !configResult.levels) {
      const message = configResult.error || ADMIN_PROGRESSION_ERROR;
      setError(message);
      setConfig(null);
      setLevels(null);
      showToast(message);
      setListLoading(false);
      return;
    }
    if (
      engagement.error ||
      !engagement.flags ||
      !engagement.rows ||
      !engagement.missions ||
      !engagement.rewards ||
      !engagement.policy ||
      !engagement.caps ||
      !engagement.entries
    ) {
      const message = engagement.error || ADMIN_PROGRESSION_ERROR;
      setError(message);
      setEngagementFlags(null);
      setFlagRows(null);
      setMissions(null);
      setDailyRewards(null);
      setDailyPolicy(null);
      setEnergyCaps(null);
      setAuditEntries(null);
      showToast(message);
      setListLoading(false);
      return;
    }
    setConfig(configResult.config);
    setLevels(configResult.levels);
    setEngagementFlags(engagement.flags);
    setFlagRows(engagement.rows);
    setMissions(engagement.missions);
    setDailyRewards(engagement.rewards);
    setDailyPolicy(engagement.policy);
    setEnergyCaps(engagement.caps);
    setAuditEntries(engagement.entries);
    setError(null);
    setReady(true);
    setListLoading(false);
  };

  useEffect(() => {
    void reload();
    // Reload when the authenticated admin identity changes; requestId drops stale responses.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- identity-only refresh, not a render loop
  }, [userId, isAdmin]);

  const runBusy = async (work: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await work();
    } finally {
      if (stillAdmin()) setBusy(false);
      else setBusy(false);
    }
  };

  return (
    <div className="min-h-screen elix-page-glass bg-transparent text-white p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="w-7 h-7 text-[#F5F5F7]" />
            {ADMIN_PROGRESSION_TITLE}
          </h1>
          <button type="button" onClick={() => navigate(ADMIN_PROGRESSION_PARENT)} className="text-sm text-white/60">
            {ADMIN_PROGRESSION_BACK}
          </button>
        </div>

        {listLoading && !ready ? <p className="text-sm text-white/50 mb-4">{ADMIN_PROGRESSION_LOADING}</p> : null}
        {error ? (
          <p role="alert" className="text-red-400 text-sm mb-4">
            {error}
          </p>
        ) : null}

        {ready && config && levels && missions && dailyRewards && dailyPolicy && energyCaps && engagementFlags && flagRows && auditEntries ? (
          <>
            <section className="rounded-xl border border-[#D8D9DD]/25 bg-[#E6E9EE]/5 p-4 mb-6 text-sm text-white/70">
              <p className="font-semibold text-[#F5F5F7] mb-1">{ADMIN_PROGRESSION_PHASE_TITLE}</p>
              <p className="mb-2">
                Migrations through <code className="text-white/50">{ADMIN_PROGRESSION_PHASE_MIGRATION}</code>. Coolify:{" "}
                <code className="text-white/50">npm run migrate</code>.
              </p>
              <p className="mb-2">
                Battle Energy affects battle score only. Promo gifts create zero Diamonds. Treasure spawn is server-only.
                Feature flags persist in <code className="text-white/50">engagement_settings</code> (env Neon kill-switch still
                wins).
              </p>
            </section>

            <section className="rounded-xl border border-white/10 p-4 mb-6">
              <h2 className="font-semibold mb-3">{ADMIN_PROGRESSION_FLAGS_TITLE}</h2>
              <ul className="space-y-2">
                {Object.entries(engagementFlags).map(([key, value]) => {
                  const row = flagRows.find((item) => item.key === key);
                  return (
                    <li key={key} className="flex flex-col gap-1 text-xs border-b border-white/5 pb-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-white/70">{key}</span>
                        <button
                          type="button"
                          aria-pressed={value}
                          aria-label={`${key} ${value ? ADMIN_PROGRESSION_FLAG_ON : ADMIN_PROGRESSION_FLAG_OFF}`}
                          disabled={busy}
                          onClick={() => {
                            void runBusy(async () => {
                              const highImpact = (ADMIN_PROGRESSION_HIGH_IMPACT_FLAGS as readonly string[]).includes(key);
                              if (
                                highImpact &&
                                !window.confirm(`Change high-impact flag "${key}"? This affects live economy behavior.`)
                              ) {
                                return;
                              }
                              const reason = window.prompt("Reason for flag change (optional):") || "";
                              const result = await apiAdminProgressionToggleFeatureFlag({
                                [key]: !value,
                                reason,
                                ...(highImpact ? { confirm: true } : {}),
                              });
                              if (!stillAdmin()) return;
                              if (result.error || !result.flags || !result.rows) {
                                showToast(result.error || ADMIN_PROGRESSION_ERROR);
                                return;
                              }
                              setEngagementFlags(result.flags);
                              setFlagRows(result.rows);
                              showToast(ADMIN_PROGRESSION_FLAG_SAVED);
                            });
                          }}
                          className={`px-2 py-1 rounded-full font-bold ${
                            value ? "bg-emerald-500/20 text-emerald-400" : "bg-white/10 text-white/40"
                          }`}
                        >
                          {value ? ADMIN_PROGRESSION_FLAG_ON : ADMIN_PROGRESSION_FLAG_OFF}
                        </button>
                      </div>
                      {row ? (
                        <div className="text-[10px] text-white/35">
                          effective={String(row.effective)} · env={String(row.env_value)} · admin={String(row.admin_value)} ·
                          default={String(row.default_value)}
                          {row.last_changed_at ? ` · changed ${row.last_changed_at}` : ""}
                          {row.reason ? ` · ${row.reason}` : ""}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </section>

            <section className="rounded-xl border border-white/10 p-4 mb-6">
              <h2 className="font-semibold mb-3">{ADMIN_PROGRESSION_MISSIONS_TITLE}</h2>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {missions.map((mission, index) => (
                  <div key={mission.id} className="rounded-lg border border-white/10 p-3 space-y-2">
                    <div className="flex justify-between gap-2 text-xs">
                      <span className="font-semibold text-white">{mission.title}</span>
                      <span className="text-white/40">
                        {mission.scope} · {mission.metric_key}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      <label className="text-[10px] text-white/40">
                        Goal
                        <input
                          type="number"
                          aria-label={`${mission.title} Goal`}
                          className={inputClass}
                          value={mission.goal_count}
                          onChange={(event) =>
                            setMissions((current) =>
                              (current || []).map((row, i) =>
                                i === index ? { ...row, goal_count: Number(event.target.value) || 1 } : row,
                              ),
                            )
                          }
                        />
                      </label>
                      <label className="text-[10px] text-white/40">
                        XP
                        <input
                          type="number"
                          aria-label={`${mission.title} XP`}
                          className={inputClass}
                          value={mission.reward_xp}
                          onChange={(event) =>
                            setMissions((current) =>
                              (current || []).map((row, i) =>
                                i === index ? { ...row, reward_xp: Number(event.target.value) || 0 } : row,
                              ),
                            )
                          }
                        />
                      </label>
                      <label className="text-[10px] text-white/40">
                        Promo coins
                        <input
                          type="number"
                          aria-label={`${mission.title} Promo coins`}
                          className={inputClass}
                          value={mission.reward_promo_coins}
                          onChange={(event) =>
                            setMissions((current) =>
                              (current || []).map((row, i) =>
                                i === index ? { ...row, reward_promo_coins: Number(event.target.value) || 0 } : row,
                              ),
                            )
                          }
                        />
                      </label>
                      <label className="text-[10px] text-white/40">
                        Energy
                        <input
                          type="number"
                          aria-label={`${mission.title} Energy`}
                          className={inputClass}
                          value={mission.reward_energy}
                          onChange={(event) =>
                            setMissions((current) =>
                              (current || []).map((row, i) =>
                                i === index ? { ...row, reward_energy: Number(event.target.value) || 0 } : row,
                              ),
                            )
                          }
                        />
                      </label>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-[10px] text-white/40">
                        Audience
                        <select
                          className={inputClass}
                          aria-label={`${mission.title} Audience`}
                          value={mission.audience || "all_authenticated"}
                          onChange={(event) =>
                            setMissions((current) =>
                              (current || []).map((row, i) =>
                                i === index ? { ...row, audience: event.target.value } : row,
                              ),
                            )
                          }
                        >
                          {ADMIN_PROGRESSION_MISSION_AUDIENCES.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-xs flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={mission.enabled}
                          onChange={(event) =>
                            setMissions((current) =>
                              (current || []).map((row, i) =>
                                i === index ? { ...row, enabled: event.target.checked } : row,
                              ),
                            )
                          }
                        />
                        Enabled
                      </label>
                      <button
                        type="button"
                        disabled={busy}
                        className="ml-auto px-3 py-1.5 rounded-lg bg-[#E6E9EE] text-white text-xs font-semibold disabled:opacity-40"
                        onClick={() => {
                          void runBusy(async () => {
                            const result = await apiAdminProgressionSaveMission(mission.id, {
                              goal_count: mission.goal_count,
                              reward_xp: mission.reward_xp,
                              reward_promo_coins: mission.reward_promo_coins,
                              reward_energy: mission.reward_energy,
                              enabled: mission.enabled,
                              audience: mission.audience || "all_authenticated",
                              sort_order: mission.sort_order,
                            });
                            if (!stillAdmin()) return;
                            if (result.error) showToast(result.error);
                            else showToast(ADMIN_PROGRESSION_MISSION_SAVED);
                          });
                        }}
                      >
                        {ADMIN_PROGRESSION_SAVE}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        className="px-3 py-1.5 rounded-lg bg-white/10 text-xs disabled:opacity-40"
                        onClick={() => {
                          void runBusy(async () => {
                            if (!window.confirm(`Archive mission ${mission.id}?`)) return;
                            const result = await apiAdminProgressionArchiveMission(mission.id);
                            if (!stillAdmin()) return;
                            if (result.error) showToast(result.error);
                            else {
                              showToast(ADMIN_PROGRESSION_MISSION_ARCHIVED);
                              await reload();
                            }
                          });
                        }}
                      >
                        {ADMIN_PROGRESSION_ARCHIVE}
                      </button>
                    </div>
                  </div>
                ))}
                {missions.length === 0 ? <p className="text-xs text-white/40">{ADMIN_PROGRESSION_MISSIONS_EMPTY}</p> : null}
              </div>
            </section>

            <section className="rounded-xl border border-white/10 p-4 mb-6">
              <h2 className="font-semibold mb-3">{ADMIN_PROGRESSION_DAILY_TITLE}</h2>
              <div className="space-y-2">
                {dailyRewards.map((reward, index) => (
                  <div key={reward.streak_day} className="grid grid-cols-[50px_1fr_1fr_1fr_70px] gap-2 items-center">
                    <span className="text-xs">Day {reward.streak_day}</span>
                    <input
                      type="number"
                      aria-label={`Day ${reward.streak_day} XP`}
                      className={inputClass}
                      value={reward.reward_xp}
                      onChange={(event) =>
                        setDailyRewards((current) =>
                          (current || []).map((row, i) =>
                            i === index ? { ...row, reward_xp: Number(event.target.value) || 0 } : row,
                          ),
                        )
                      }
                    />
                    <input
                      type="number"
                      aria-label={`Day ${reward.streak_day} promo`}
                      className={inputClass}
                      value={reward.reward_promo_coins}
                      onChange={(event) =>
                        setDailyRewards((current) =>
                          (current || []).map((row, i) =>
                            i === index ? { ...row, reward_promo_coins: Number(event.target.value) || 0 } : row,
                          ),
                        )
                      }
                    />
                    <input
                      aria-label={`Day ${reward.streak_day} label`}
                      className={inputClass}
                      value={reward.reward_label || ""}
                      onChange={(event) =>
                        setDailyRewards((current) =>
                          (current || []).map((row, i) =>
                            i === index ? { ...row, reward_label: event.target.value } : row,
                          ),
                        )
                      }
                    />
                    <button
                      type="button"
                      disabled={busy}
                      className="py-2 rounded-lg bg-white/10 text-xs disabled:opacity-40"
                      onClick={() => {
                        void runBusy(async () => {
                          const result = await apiAdminProgressionSaveDailyReward(reward);
                          if (!stillAdmin()) return;
                          if (result.error) showToast(result.error);
                          else showToast(ADMIN_PROGRESSION_DAILY_SAVED);
                        });
                      }}
                    >
                      {ADMIN_PROGRESSION_SAVE}
                    </button>
                  </div>
                ))}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <label className="text-white/40">
                  Streak reset
                  <select
                    className={inputClass}
                    aria-label="Streak reset"
                    value={dailyPolicy.streak_reset_policy}
                    onChange={(event) =>
                      setDailyPolicy((policy) =>
                        policy
                          ? {
                              ...policy,
                              streak_reset_policy: event.target.value as "miss_one_day" | "never",
                            }
                          : policy,
                      )
                    }
                  >
                    <option value="miss_one_day">Miss one day</option>
                    <option value="never">Never</option>
                  </select>
                </label>
                <label className="text-white/40 flex items-center gap-2 mt-5">
                  <input
                    type="checkbox"
                    checked={dailyPolicy.active}
                    onChange={(event) =>
                      setDailyPolicy((policy) => (policy ? { ...policy, active: event.target.checked } : policy))
                    }
                  />
                  Active
                </label>
                <label className="text-white/40">
                  Effective start (ISO)
                  <input
                    className={inputClass}
                    aria-label="Effective start (ISO)"
                    value={dailyPolicy.effective_start}
                    onChange={(event) =>
                      setDailyPolicy((policy) =>
                        policy ? { ...policy, effective_start: event.target.value } : policy,
                      )
                    }
                  />
                </label>
                <label className="text-white/40">
                  Effective end (ISO)
                  <input
                    className={inputClass}
                    aria-label="Effective end (ISO)"
                    value={dailyPolicy.effective_end}
                    onChange={(event) =>
                      setDailyPolicy((policy) => (policy ? { ...policy, effective_end: event.target.value } : policy))
                    }
                  />
                </label>
              </div>
              <button
                type="button"
                disabled={busy}
                className="mt-2 px-3 py-2 rounded-lg bg-white/10 text-xs disabled:opacity-40"
                onClick={() => {
                  void runBusy(async () => {
                    const result = await apiAdminProgressionSaveDailyPolicy({
                      streak_reset_policy: dailyPolicy.streak_reset_policy,
                      active: dailyPolicy.active,
                      effective_start: dailyPolicy.effective_start || null,
                      effective_end: dailyPolicy.effective_end || null,
                    });
                    if (!stillAdmin()) return;
                    if (result.error) showToast(result.error);
                    else showToast(ADMIN_PROGRESSION_POLICY_SAVED);
                  });
                }}
              >
                {ADMIN_PROGRESSION_SAVE_POLICY}
              </button>
              <p className="text-[10px] text-white/30 mt-2">{ADMIN_PROGRESSION_CLAIMS_NOTE}</p>
            </section>

            <section className="rounded-xl border border-white/10 p-4 mb-6">
              <h2 className="font-semibold mb-3">{ADMIN_PROGRESSION_ENERGY_TITLE}</h2>
              <p className="text-[10px] text-white/35 mb-2">{ADMIN_PROGRESSION_ENERGY_NOTE}</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-3">
                {ADMIN_PROGRESSION_ENERGY_FIELDS.map((key) => (
                  <label key={key} className="text-[10px] text-white/40">
                    {key}
                    <input
                      type="number"
                      aria-label={key}
                      className={inputClass}
                      value={energyCaps[key]}
                      onChange={(event) =>
                        setEnergyCaps((caps) =>
                          caps ? { ...caps, [key]: Number(event.target.value) || 0 } : caps,
                        )
                      }
                    />
                  </label>
                ))}
                <label className="text-[10px] text-white/40">
                  allowed_boost_values (csv)
                  <input
                    className={inputClass}
                    aria-label="allowed_boost_values (csv)"
                    value={energyCaps.allowed_boost_values.join(",")}
                    onChange={(event) =>
                      setEnergyCaps((caps) =>
                        caps
                          ? {
                              ...caps,
                              allowed_boost_values: event.target.value
                                .split(",")
                                .map((item) => Number(item.trim()))
                                .filter((n) => Number.isFinite(n) && n >= 1),
                            }
                          : caps,
                      )
                    }
                  />
                </label>
                <label className="text-xs flex items-center gap-1 mt-4">
                  <input
                    type="checkbox"
                    checked={energyCaps.enabled}
                    onChange={(event) =>
                      setEnergyCaps((caps) => (caps ? { ...caps, enabled: event.target.checked } : caps))
                    }
                  />
                  Enabled
                </label>
              </div>
              <button
                type="button"
                disabled={busy}
                className="px-3 py-2 rounded-lg bg-[#E6E9EE] text-white text-xs font-semibold disabled:opacity-40"
                onClick={() => {
                  void runBusy(async () => {
                    const result = await apiAdminProgressionSaveBattleEnergyCaps(energyCaps);
                    if (!stillAdmin()) return;
                    if (result.error || !result.caps) showToast(result.error || ADMIN_PROGRESSION_ERROR);
                    else {
                      setEnergyCaps(result.caps);
                      showToast(ADMIN_PROGRESSION_CAPS_SAVED);
                    }
                  });
                }}
              >
                {ADMIN_PROGRESSION_SAVE_CAPS}
              </button>
            </section>

            <section className="rounded-xl border border-white/10 p-4 mb-6">
              <h2 className="font-semibold mb-3">{ADMIN_PROGRESSION_XP_TITLE}</h2>
              <div className="space-y-2">
                {config.map((row, index) => (
                  <div key={row.source} className="grid grid-cols-[1fr_110px_80px_70px] gap-2 items-center">
                    <div>
                      <div className="text-sm">{row.source}</div>
                      <div className="text-xs text-white/40">{row.description}</div>
                    </div>
                    <input
                      type="number"
                      min={0}
                      aria-label={`${row.source} XP`}
                      className={inputClass}
                      value={row.xp_amount}
                      onChange={(event) =>
                        setConfig((current) =>
                          (current || []).map((item, i) =>
                            i === index ? { ...item, xp_amount: Number(event.target.value) || 0 } : item,
                          ),
                        )
                      }
                    />
                    <label className="text-xs flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={row.enabled}
                        onChange={(event) =>
                          setConfig((current) =>
                            (current || []).map((item, i) =>
                              i === index ? { ...item, enabled: event.target.checked } : item,
                            ),
                          )
                        }
                      />
                      Enabled
                    </label>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        void runBusy(async () => {
                          const result = await apiAdminProgressionSaveConfig(row);
                          if (!stillAdmin()) return;
                          if (result.error) showToast(result.error);
                          else {
                            showToast(ADMIN_PROGRESSION_XP_SAVED);
                            await reload();
                          }
                        });
                      }}
                      className="py-2 rounded-lg bg-[#E6E9EE] text-white text-xs font-semibold disabled:opacity-40"
                    >
                      {ADMIN_PROGRESSION_SAVE}
                    </button>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-xl border border-white/10 p-4 mb-6">
              <h2 className="font-semibold mb-3">{ADMIN_PROGRESSION_LEVELS_TITLE}</h2>
              <div className="max-h-80 overflow-y-auto space-y-2">
                {levels.map((row, index) => (
                  <div key={row.level} className="grid grid-cols-[60px_140px_1fr_1fr_70px] gap-2 items-center">
                    <span className="text-sm">Level {row.level}</span>
                    <input
                      type="number"
                      aria-label={`Level ${row.level} XP`}
                      className={inputClass}
                      value={row.total_xp_required}
                      onChange={(event) =>
                        setLevels((current) =>
                          (current || []).map((item, i) =>
                            i === index ? { ...item, total_xp_required: Number(event.target.value) || 1 } : item,
                          ),
                        )
                      }
                    />
                    <input
                      className={inputClass}
                      placeholder="Title"
                      aria-label={`Level ${row.level} Title`}
                      value={row.title || ""}
                      onChange={(event) =>
                        setLevels((current) =>
                          (current || []).map((item, i) =>
                            i === index ? { ...item, title: event.target.value } : item,
                          ),
                        )
                      }
                    />
                    <input
                      className={inputClass}
                      placeholder="Badge code"
                      aria-label={`Level ${row.level} Badge code`}
                      value={row.badge_code || ""}
                      onChange={(event) =>
                        setLevels((current) =>
                          (current || []).map((item, i) =>
                            i === index ? { ...item, badge_code: event.target.value } : item,
                          ),
                        )
                      }
                    />
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        void runBusy(async () => {
                          const result = await apiAdminProgressionSaveLevel(row);
                          if (!stillAdmin()) return;
                          if (result.error) showToast(result.error);
                          else {
                            showToast(ADMIN_PROGRESSION_LEVEL_SAVED);
                            await reload();
                          }
                        });
                      }}
                      className="py-2 rounded-lg bg-white/10 text-xs disabled:opacity-40"
                    >
                      {ADMIN_PROGRESSION_SAVE}
                    </button>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-xl border border-white/10 p-4">
              <h2 className="font-semibold mb-3 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-[#F5F5F7]" />
                {ADMIN_PROGRESSION_USER_TITLE}
              </h2>
              <div className="flex gap-2 mb-4">
                <input
                  className={`${inputClass} flex-1`}
                  placeholder={ADMIN_PROGRESSION_USER_ID}
                  aria-label={ADMIN_PROGRESSION_USER_ID}
                  value={lookupUserId}
                  onChange={(event) => setLookupUserId(event.target.value)}
                />
                <button
                  type="button"
                  onClick={() => {
                    void (async () => {
                      if (!lookupUserId.trim()) return;
                      const result = await apiAdminProgressionLoadUser(lookupUserId.trim());
                      if (!stillAdmin()) return;
                      if (result.error || !result.progression) {
                        showToast(result.error || ADMIN_PROGRESSION_ERROR);
                        setUserProgression(null);
                        return;
                      }
                      setUserProgression(result.progression);
                      setXpHistory(result.xp_history);
                      setStarterHistory(result.starter_history);
                    })();
                  }}
                  className="px-4 rounded-lg bg-white/10 text-sm"
                >
                  {ADMIN_PROGRESSION_LOAD}
                </button>
              </div>
              {userProgression ? (
                <>
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    <div className="rounded-lg bg-white/5 p-3">
                      <div className="text-xs text-white/40">Starter Coins</div>
                      <div className="font-bold flex items-center gap-1">
                        <Coins className="w-4 h-4 text-[#D9A62E]" />
                        {userProgression.starter_coin_balance.toLocaleString()}
                      </div>
                    </div>
                    <div className="rounded-lg bg-white/5 p-3">
                      <div className="text-xs text-white/40">Total XP</div>
                      <div className="font-bold">{userProgression.total_xp.toLocaleString()}</div>
                    </div>
                    <div className="rounded-lg bg-white/5 p-3">
                      <div className="text-xs text-white/40">Level</div>
                      <div className="font-bold">{userProgression.current_level}</div>
                    </div>
                  </div>
                  <div className="grid md:grid-cols-[140px_1fr_auto_auto] gap-2 mb-5">
                    <input
                      type="number"
                      className={inputClass}
                      placeholder={ADMIN_PROGRESSION_AMOUNT}
                      aria-label={ADMIN_PROGRESSION_AMOUNT}
                      value={adjustment.amount}
                      onChange={(event) => setAdjustment({ ...adjustment, amount: event.target.value })}
                    />
                    <input
                      className={inputClass}
                      placeholder={ADMIN_PROGRESSION_REASON}
                      aria-label={ADMIN_PROGRESSION_REASON}
                      value={adjustment.reason}
                      onChange={(event) => setAdjustment({ ...adjustment, reason: event.target.value })}
                    />
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        void runBusy(async () => {
                          const amount = Number(adjustment.amount);
                          if (!lookupUserId.trim() || !Number.isInteger(amount) || !adjustment.reason.trim()) {
                            showToast(ADMIN_PROGRESSION_NEED_FIELDS);
                            return;
                          }
                          const result = await apiAdminProgressionAdjust("xp-adjustments", {
                            user_id: lookupUserId.trim(),
                            amount_delta: amount,
                            reason: adjustment.reason.trim(),
                            idempotency_key: crypto.randomUUID(),
                          });
                          if (!stillAdmin()) return;
                          if (result.error) showToast(result.error);
                          else {
                            showToast(ADMIN_PROGRESSION_XP_ADJUSTED);
                            setAdjustment({ amount: "", reason: "" });
                            const loaded = await apiAdminProgressionLoadUser(lookupUserId.trim());
                            if (loaded.progression) {
                              setUserProgression(loaded.progression);
                              setXpHistory(loaded.xp_history);
                              setStarterHistory(loaded.starter_history);
                            }
                          }
                        });
                      }}
                      className="px-3 rounded-lg bg-white/10 text-xs disabled:opacity-40"
                    >
                      {ADMIN_PROGRESSION_ADJUST_XP}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        void runBusy(async () => {
                          const amount = Number(adjustment.amount);
                          if (!lookupUserId.trim() || !Number.isInteger(amount) || !adjustment.reason.trim()) {
                            showToast(ADMIN_PROGRESSION_NEED_FIELDS);
                            return;
                          }
                          const result = await apiAdminProgressionAdjust("starter-adjustments", {
                            user_id: lookupUserId.trim(),
                            amount_delta: amount,
                            reason: adjustment.reason.trim(),
                            idempotency_key: crypto.randomUUID(),
                          });
                          if (!stillAdmin()) return;
                          if (result.error) showToast(result.error);
                          else {
                            showToast(ADMIN_PROGRESSION_STARTER_ADJUSTED);
                            setAdjustment({ amount: "", reason: "" });
                            const loaded = await apiAdminProgressionLoadUser(lookupUserId.trim());
                            if (loaded.progression) {
                              setUserProgression(loaded.progression);
                              setXpHistory(loaded.xp_history);
                              setStarterHistory(loaded.starter_history);
                            }
                          }
                        });
                      }}
                      className="px-3 rounded-lg bg-[#E6E9EE] text-white text-xs font-semibold disabled:opacity-40"
                    >
                      {ADMIN_PROGRESSION_ADJUST_STARTER}
                    </button>
                  </div>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <h3 className="text-sm font-semibold mb-2">XP history</h3>
                      <div className="max-h-64 overflow-y-auto text-xs space-y-1">
                        {xpHistory.map((row) => (
                          <div key={row.id} className="border-b border-white/5 py-1">
                            {row.xp_amount > 0 ? "+" : ""}
                            {String(row.xp_amount)} XP · {row.source} · {row.created_at}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold mb-2">Starter Coin history</h3>
                      <div className="max-h-64 overflow-y-auto text-xs space-y-1">
                        {starterHistory.map((row) => (
                          <div key={row.id} className="border-b border-white/5 py-1">
                            {row.amount_delta > 0 ? "+" : ""}
                            {String(row.amount_delta)} · {row.kind} · balance {String(row.balance_after)}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              ) : null}
            </section>

            <section className="rounded-xl border border-white/10 p-4 mb-6">
              <h2 className="font-semibold mb-3">{ADMIN_PROGRESSION_ADMIN_AUDIT_TITLE}</h2>
              <div className="max-h-64 overflow-y-auto text-[10px] space-y-1 text-white/50">
                {auditEntries.length === 0 ? (
                  <p>{ADMIN_PROGRESSION_AUDIT_EMPTY}</p>
                ) : (
                  auditEntries.map((row) => (
                    <div key={row.id} className="border-b border-white/5 py-1">
                      {row.created_at} · {row.admin_user_id} · {row.action} · {row.target}
                    </div>
                  ))
                )}
              </div>
            </section>
          </>
        ) : !listLoading && !error ? (
          <p className="text-xs text-white/40">{ADMIN_PROGRESSION_FLAGS_LOADING}</p>
        ) : null}
      </div>
    </div>
  );
}
