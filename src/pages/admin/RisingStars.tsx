import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Trophy } from "lucide-react";
import {
  ADMIN_RISING_STARS_ADD_CATEGORY,
  ADMIN_RISING_STARS_ADD_REGION,
  ADMIN_RISING_STARS_AUDIT,
  ADMIN_RISING_STARS_BACK,
  ADMIN_RISING_STARS_CATEGORY_CREATED,
  ADMIN_RISING_STARS_CHALLENGE_CREATED,
  ADMIN_RISING_STARS_CHALLENGES,
  ADMIN_RISING_STARS_CHALLENGES_ERROR,
  ADMIN_RISING_STARS_CREATE_CHALLENGE,
  ADMIN_RISING_STARS_CREATE_SEASON,
  ADMIN_RISING_STARS_DEFAULT_CATEGORY,
  ADMIN_RISING_STARS_DEFAULT_REGION,
  ADMIN_RISING_STARS_DEFAULT_REGION_CODES,
  ADMIN_RISING_STARS_EMPTY_CHALLENGES,
  ADMIN_RISING_STARS_ERROR,
  ADMIN_RISING_STARS_LOADING,
  ADMIN_RISING_STARS_NEED_SEASON_CATEGORY,
  ADMIN_RISING_STARS_OPEN,
  ADMIN_RISING_STARS_PARENT,
  ADMIN_RISING_STARS_REGION_CREATED,
  ADMIN_RISING_STARS_SEASON_CREATED,
  ADMIN_RISING_STARS_SEASON_STATUSES,
  ADMIN_RISING_STARS_SEASON_TOOLS,
  ADMIN_RISING_STARS_SELECT_SEASON,
  ADMIN_RISING_STARS_SNAPSHOT_FINAL,
  ADMIN_RISING_STARS_SNAPSHOT_QUALIFIER,
  ADMIN_RISING_STARS_TITLE,
  ADMIN_RISING_STARS_VOTING,
} from "@/content/adminRisingStars";
import {
  apiAdminRisingStarsCreateCategory,
  apiAdminRisingStarsCreateChallenge,
  apiAdminRisingStarsCreateRegion,
  apiAdminRisingStarsCreateSeason,
  apiAdminRisingStarsLoadChallenges,
  apiAdminRisingStarsReload,
  apiAdminRisingStarsSetChallengeStatus,
  apiAdminRisingStarsSnapshot,
  type AdminRisingStarsAudit,
  type AdminRisingStarsChallenge,
  type AdminRisingStarsSeason,
} from "@/features/admin/adminApi";
import { showToast } from "@/lib/toast";
import { useAuthStore } from "@/store/useAuthStore";

function datetimeLocalToIso(value: string): string | null {
  if (!value.trim()) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export default function AdminRisingStars() {
  const navigate = useNavigate();
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const isAdmin = useAuthStore((state) => state.user?.isAdmin === true);
  const [seasons, setSeasons] = useState<AdminRisingStarsSeason[] | null>(null);
  const [selectedSeasonId, setSelectedSeasonId] = useState("");
  const [challenges, setChallenges] = useState<AdminRisingStarsChallenge[] | null>(null);
  const [audit, setAudit] = useState<AdminRisingStarsAudit[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [challengeError, setChallengeError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [challengesLoading, setChallengesLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const requestIdRef = useRef(0);
  const challengeRequestIdRef = useRef(0);

  const [seasonForm, setSeasonForm] = useState({
    slug: "",
    title: "",
    description: "",
    starts_at: "",
    ends_at: "",
    status: "draft",
  });
  const [categoryForm, setCategoryForm] = useState({
    slug: ADMIN_RISING_STARS_DEFAULT_CATEGORY.slug,
    title: ADMIN_RISING_STARS_DEFAULT_CATEGORY.title,
  });
  const [regionForm, setRegionForm] = useState({
    slug: ADMIN_RISING_STARS_DEFAULT_REGION.slug,
    title: ADMIN_RISING_STARS_DEFAULT_REGION.title,
  });
  const [challengeForm, setChallengeForm] = useState({
    category_id: "",
    region_id: "",
    week_index: 1,
    title: "",
    sound_track_id: "",
    opens_at: "",
    closes_at: "",
    status: "scheduled",
  });

  useEffect(() => {
    if (!isAdmin || !userId) {
      setSeasons(null);
      setChallenges(null);
      setAudit(null);
      setError(null);
      setChallengeError(null);
      setReady(false);
      setListLoading(false);
      return;
    }
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const ownerId = userId;
    setError(null);
    setListLoading(true);
    void apiAdminRisingStarsReload().then((result) => {
      if (requestIdRef.current !== requestId) return;
      if (useAuthStore.getState().user?.id !== ownerId) return;
      if (useAuthStore.getState().user?.isAdmin !== true) {
        setSeasons(null);
        setAudit(null);
        setError(null);
        setListLoading(false);
        setReady(false);
        return;
      }
      if (result.error || !result.seasons || !result.audit) {
        setSeasons(null);
        setAudit(null);
        setChallenges(null);
        const message = result.error || ADMIN_RISING_STARS_ERROR;
        setError(message);
        showToast(message);
        setListLoading(false);
        setReady(true);
        return;
      }
      setSeasons(result.seasons);
      setAudit(result.audit);
      setError(null);
      setSelectedSeasonId((current) => current || result.seasons?.[0]?.id || "");
      setListLoading(false);
      setReady(true);
    });
  }, [isAdmin, userId]);

  useEffect(() => {
    if (!isAdmin || !userId || !selectedSeasonId) {
      if (!selectedSeasonId) {
        setChallenges(null);
        setChallengeError(null);
        setChallengesLoading(false);
      }
      return;
    }
    const requestId = challengeRequestIdRef.current + 1;
    challengeRequestIdRef.current = requestId;
    const ownerId = userId;
    setChallengeError(null);
    setChallengesLoading(true);
    void apiAdminRisingStarsLoadChallenges(selectedSeasonId).then((result) => {
      if (challengeRequestIdRef.current !== requestId) return;
      if (useAuthStore.getState().user?.id !== ownerId) return;
      if (useAuthStore.getState().user?.isAdmin !== true) {
        setChallenges(null);
        setChallengesLoading(false);
        return;
      }
      if (result.error || !result.challenges) {
        setChallenges(null);
        const message = result.error || ADMIN_RISING_STARS_CHALLENGES_ERROR;
        setChallengeError(message);
        showToast(message);
        setChallengesLoading(false);
        return;
      }
      setChallenges(result.challenges);
      setChallengeError(null);
      setChallengesLoading(false);
    });
  }, [isAdmin, userId, selectedSeasonId]);

  if (!isAdmin || !userId) {
    return null;
  }

  if (!ready && listLoading) {
    return (
      <div className="min-h-screen elix-page-glass bg-transparent flex items-center justify-center text-white" aria-busy="true">
        {ADMIN_RISING_STARS_LOADING}
      </div>
    );
  }

  const stillAdmin = () =>
    useAuthStore.getState().user?.id === userId && useAuthStore.getState().user?.isAdmin === true;

  const reload = async () => {
    const ownerId = userId;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const result = await apiAdminRisingStarsReload();
    if (requestIdRef.current !== requestId) return;
    if (useAuthStore.getState().user?.id !== ownerId || useAuthStore.getState().user?.isAdmin !== true) {
      setSeasons(null);
      setAudit(null);
      setReady(false);
      return;
    }
    if (result.error || !result.seasons || !result.audit) {
      setSeasons(null);
      setAudit(null);
      const message = result.error || ADMIN_RISING_STARS_ERROR;
      setError(message);
      showToast(message);
      return;
    }
    setSeasons(result.seasons);
    setAudit(result.audit);
    setError(null);
    setSelectedSeasonId((current) => {
      if (current && result.seasons?.some((season) => season.id === current)) return current;
      return result.seasons?.[0]?.id || "";
    });
  };

  const reloadChallenges = async (seasonId: string) => {
    const ownerId = userId;
    const requestId = challengeRequestIdRef.current + 1;
    challengeRequestIdRef.current = requestId;
    setChallengesLoading(true);
    const result = await apiAdminRisingStarsLoadChallenges(seasonId);
    if (challengeRequestIdRef.current !== requestId) return;
    if (useAuthStore.getState().user?.id !== ownerId || useAuthStore.getState().user?.isAdmin !== true) {
      setChallenges(null);
      setChallengesLoading(false);
      return;
    }
    if (result.error || !result.challenges) {
      setChallenges(null);
      const message = result.error || ADMIN_RISING_STARS_CHALLENGES_ERROR;
      setChallengeError(message);
      showToast(message);
      setChallengesLoading(false);
      return;
    }
    setChallenges(result.challenges);
    setChallengeError(null);
    setChallengesLoading(false);
  };

  const createSeason = async () => {
    if (busy) return;
    const startsAt = datetimeLocalToIso(seasonForm.starts_at);
    const endsAt = datetimeLocalToIso(seasonForm.ends_at);
    if (!startsAt || !endsAt) {
      showToast(ADMIN_RISING_STARS_ERROR);
      return;
    }
    setBusy(true);
    const result = await apiAdminRisingStarsCreateSeason({
      slug: seasonForm.slug,
      title: seasonForm.title,
      description: seasonForm.description,
      starts_at: startsAt,
      ends_at: endsAt,
      status: seasonForm.status,
    });
    if (!stillAdmin()) {
      setBusy(false);
      setSeasons(null);
      setReady(false);
      return;
    }
    if (!result.ok) {
      showToast(result.error);
      setBusy(false);
      return;
    }
    showToast(ADMIN_RISING_STARS_SEASON_CREATED);
    await reload();
    setBusy(false);
  };

  const createCategory = async () => {
    if (busy || !selectedSeasonId) return;
    setBusy(true);
    const result = await apiAdminRisingStarsCreateCategory({
      season_id: selectedSeasonId,
      slug: categoryForm.slug,
      title: categoryForm.title,
    });
    if (!stillAdmin()) {
      setBusy(false);
      setSeasons(null);
      setReady(false);
      return;
    }
    if (!result.ok) {
      showToast(result.error);
      setBusy(false);
      return;
    }
    setChallengeForm((form) => ({ ...form, category_id: result.category.id }));
    showToast(ADMIN_RISING_STARS_CATEGORY_CREATED);
    setBusy(false);
  };

  const createRegion = async () => {
    if (busy || !selectedSeasonId) return;
    setBusy(true);
    const result = await apiAdminRisingStarsCreateRegion({
      season_id: selectedSeasonId,
      slug: regionForm.slug,
      title: regionForm.title,
      country_codes: [...ADMIN_RISING_STARS_DEFAULT_REGION_CODES],
    });
    if (!stillAdmin()) {
      setBusy(false);
      setSeasons(null);
      setReady(false);
      return;
    }
    if (!result.ok) {
      showToast(result.error);
      setBusy(false);
      return;
    }
    setChallengeForm((form) => ({ ...form, region_id: result.region.id }));
    showToast(ADMIN_RISING_STARS_REGION_CREATED);
    setBusy(false);
  };

  const createChallenge = async () => {
    if (busy) return;
    if (!selectedSeasonId || !challengeForm.category_id) {
      showToast(ADMIN_RISING_STARS_NEED_SEASON_CATEGORY);
      return;
    }
    const opensAt = datetimeLocalToIso(challengeForm.opens_at);
    const closesAt = datetimeLocalToIso(challengeForm.closes_at);
    if (!opensAt || !closesAt) {
      showToast(ADMIN_RISING_STARS_ERROR);
      return;
    }
    setBusy(true);
    const result = await apiAdminRisingStarsCreateChallenge({
      season_id: selectedSeasonId,
      category_id: challengeForm.category_id,
      region_id: challengeForm.region_id || null,
      week_index: Number(challengeForm.week_index) || 1,
      title: challengeForm.title,
      sound_track_id: challengeForm.sound_track_id,
      opens_at: opensAt,
      closes_at: closesAt,
      status: challengeForm.status,
    });
    if (!stillAdmin()) {
      setBusy(false);
      setSeasons(null);
      setReady(false);
      return;
    }
    if (!result.ok) {
      showToast(result.error);
      setBusy(false);
      return;
    }
    showToast(ADMIN_RISING_STARS_CHALLENGE_CREATED);
    await reloadChallenges(selectedSeasonId);
    await reload();
    setBusy(false);
  };

  const setStatus = async (id: string, status: string) => {
    if (busy) return;
    setBusy(true);
    const result = await apiAdminRisingStarsSetChallengeStatus(id, status);
    if (!stillAdmin()) {
      setBusy(false);
      setSeasons(null);
      setReady(false);
      return;
    }
    if (!result.ok) {
      showToast(result.error);
      setBusy(false);
      return;
    }
    await reloadChallenges(selectedSeasonId);
    setBusy(false);
  };

  const snapshot = async (id: string, phase: "qualifier" | "final") => {
    if (busy) return;
    setBusy(true);
    const result = await apiAdminRisingStarsSnapshot(id, phase, phase === "qualifier" ? 10 : 0);
    if (!stillAdmin()) {
      setBusy(false);
      setSeasons(null);
      setReady(false);
      return;
    }
    if (!result.ok) {
      showToast(result.error);
      setBusy(false);
      return;
    }
    showToast(`${phase} snapshot saved`);
    await reloadChallenges(selectedSeasonId);
    setBusy(false);
  };

  const inputClass =
    "w-full bg-[#0f1218] border border-white/10 rounded-lg px-3 py-2 text-sm text-white mb-2";

  return (
    <div className="min-h-screen elix-page-glass bg-transparent text-white p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Trophy className="w-7 h-7 text-[#F5F5F7]" aria-hidden="true" />
            {ADMIN_RISING_STARS_TITLE}
          </h1>
          <button
            type="button"
            onClick={() => navigate(ADMIN_RISING_STARS_PARENT, { replace: true })}
            className="text-sm text-white/60"
          >
            {ADMIN_RISING_STARS_BACK}
          </button>
        </div>

        {error ? (
          <p role="alert" className="text-red-400 text-sm mb-4">
            {error}
          </p>
        ) : null}

        <div className="grid md:grid-cols-2 gap-6 mb-8">
          <section className="rounded-xl border border-white/10 p-4">
            <h2 className="font-semibold mb-3">{ADMIN_RISING_STARS_CREATE_SEASON}</h2>
            <input
              className={inputClass}
              placeholder="slug (uk-rising-music)"
              aria-label="slug (uk-rising-music)"
              value={seasonForm.slug}
              onChange={(event) => setSeasonForm({ ...seasonForm, slug: event.target.value })}
            />
            <input
              className={inputClass}
              placeholder="title"
              aria-label="title"
              value={seasonForm.title}
              onChange={(event) => setSeasonForm({ ...seasonForm, title: event.target.value })}
            />
            <input
              className={inputClass}
              placeholder="description"
              aria-label="description"
              value={seasonForm.description}
              onChange={(event) => setSeasonForm({ ...seasonForm, description: event.target.value })}
            />
            <input
              className={inputClass}
              type="datetime-local"
              aria-label="starts_at"
              value={seasonForm.starts_at}
              onChange={(event) => setSeasonForm({ ...seasonForm, starts_at: event.target.value })}
            />
            <input
              className={inputClass}
              type="datetime-local"
              aria-label="ends_at"
              value={seasonForm.ends_at}
              onChange={(event) => setSeasonForm({ ...seasonForm, ends_at: event.target.value })}
            />
            <select
              className={inputClass}
              aria-label="season status"
              value={seasonForm.status}
              onChange={(event) => setSeasonForm({ ...seasonForm, status: event.target.value })}
            >
              {ADMIN_RISING_STARS_SEASON_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={busy}
              onClick={() => void createSeason()}
              className="w-full py-2 rounded-lg bg-[#E6E9EE] text-white font-semibold disabled:opacity-40"
            >
              {ADMIN_RISING_STARS_CREATE_SEASON}
            </button>
          </section>

          <section className="rounded-xl border border-white/10 p-4">
            <h2 className="font-semibold mb-3">{ADMIN_RISING_STARS_SEASON_TOOLS}</h2>
            <select
              className={inputClass}
              aria-label={ADMIN_RISING_STARS_SELECT_SEASON}
              value={selectedSeasonId}
              onChange={(event) => setSelectedSeasonId(event.target.value)}
            >
              <option value="">{ADMIN_RISING_STARS_SELECT_SEASON}</option>
              {(seasons ?? []).map((season) => (
                <option key={season.id} value={season.id}>
                  {season.title} ({season.status})
                </option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div>
                <input
                  className={inputClass}
                  placeholder="category slug"
                  aria-label="category slug"
                  value={categoryForm.slug}
                  onChange={(event) => setCategoryForm({ ...categoryForm, slug: event.target.value })}
                />
                <input
                  className={inputClass}
                  placeholder="category title"
                  aria-label="category title"
                  value={categoryForm.title}
                  onChange={(event) => setCategoryForm({ ...categoryForm, title: event.target.value })}
                />
                <button
                  type="button"
                  disabled={busy || !selectedSeasonId}
                  onClick={() => void createCategory()}
                  className="w-full py-2 rounded-lg bg-white/10 text-sm disabled:opacity-40"
                >
                  {ADMIN_RISING_STARS_ADD_CATEGORY}
                </button>
              </div>
              <div>
                <input
                  className={inputClass}
                  placeholder="region slug"
                  aria-label="region slug"
                  value={regionForm.slug}
                  onChange={(event) => setRegionForm({ ...regionForm, slug: event.target.value })}
                />
                <input
                  className={inputClass}
                  placeholder="region title"
                  aria-label="region title"
                  value={regionForm.title}
                  onChange={(event) => setRegionForm({ ...regionForm, title: event.target.value })}
                />
                <button
                  type="button"
                  disabled={busy || !selectedSeasonId}
                  onClick={() => void createRegion()}
                  className="w-full py-2 rounded-lg bg-white/10 text-sm disabled:opacity-40"
                >
                  {ADMIN_RISING_STARS_ADD_REGION}
                </button>
              </div>
            </div>
            <input
              className={inputClass}
              placeholder="category_id (uuid)"
              aria-label="category_id (uuid)"
              value={challengeForm.category_id}
              onChange={(event) => setChallengeForm({ ...challengeForm, category_id: event.target.value })}
            />
            <input
              className={inputClass}
              placeholder="region_id optional"
              aria-label="region_id optional"
              value={challengeForm.region_id}
              onChange={(event) => setChallengeForm({ ...challengeForm, region_id: event.target.value })}
            />
            <input
              className={inputClass}
              placeholder="challenge title"
              aria-label="challenge title"
              value={challengeForm.title}
              onChange={(event) => setChallengeForm({ ...challengeForm, title: event.target.value })}
            />
            <input
              className={inputClass}
              placeholder="Epidemic sound_track_id"
              aria-label="Epidemic sound_track_id"
              value={challengeForm.sound_track_id}
              onChange={(event) =>
                setChallengeForm({
                  ...challengeForm,
                  sound_track_id: event.target.value,
                })
              }
            />
            <input
              className={inputClass}
              type="number"
              placeholder="week_index"
              aria-label="week_index"
              value={challengeForm.week_index}
              onChange={(event) =>
                setChallengeForm({
                  ...challengeForm,
                  week_index: Number(event.target.value) || 1,
                })
              }
            />
            <input
              className={inputClass}
              type="datetime-local"
              aria-label="opens_at"
              value={challengeForm.opens_at}
              onChange={(event) =>
                setChallengeForm({
                  ...challengeForm,
                  opens_at: event.target.value,
                })
              }
            />
            <input
              className={inputClass}
              type="datetime-local"
              aria-label="closes_at"
              value={challengeForm.closes_at}
              onChange={(event) =>
                setChallengeForm({
                  ...challengeForm,
                  closes_at: event.target.value,
                })
              }
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => void createChallenge()}
              className="w-full py-2 rounded-lg bg-[#E6E9EE] text-white font-semibold disabled:opacity-40"
            >
              {ADMIN_RISING_STARS_CREATE_CHALLENGE}
            </button>
          </section>
        </div>

        <section className="rounded-xl border border-white/10 p-4 mb-8">
          <h2 className="font-semibold mb-3">{ADMIN_RISING_STARS_CHALLENGES}</h2>
          {challengeError ? (
            <p role="alert" className="text-red-400 text-sm">
              {challengeError}
            </p>
          ) : challengesLoading || (challenges == null && Boolean(selectedSeasonId)) ? (
            <p className="text-sm text-white/50" aria-busy="true">
              {ADMIN_RISING_STARS_LOADING}
            </p>
          ) : !challenges || challenges.length === 0 ? (
            <p className="text-sm text-white/50">{ADMIN_RISING_STARS_EMPTY_CHALLENGES}</p>
          ) : (
            <div className="space-y-3">
              {challenges.map((challenge) => (
                <div
                  key={challenge.id}
                  className="flex flex-wrap items-center gap-2 border border-white/10 rounded-lg p-3"
                >
                  <div className="flex-1 min-w-[180px]">
                    <div className="font-medium break-words">{challenge.title}</div>
                    <div className="text-xs text-white/50 break-words">
                      week {challenge.week_index} · {challenge.status} · sound {challenge.sound_track_id}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    className="px-2 py-1 text-xs rounded bg-white/10 disabled:opacity-40"
                    onClick={() => void setStatus(challenge.id, "open")}
                  >
                    {ADMIN_RISING_STARS_OPEN}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    className="px-2 py-1 text-xs rounded bg-white/10 disabled:opacity-40"
                    onClick={() => void setStatus(challenge.id, "voting")}
                  >
                    {ADMIN_RISING_STARS_VOTING}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    className="px-2 py-1 text-xs rounded bg-white/10 disabled:opacity-40"
                    onClick={() => void snapshot(challenge.id, "qualifier")}
                  >
                    {ADMIN_RISING_STARS_SNAPSHOT_QUALIFIER}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    className="px-2 py-1 text-xs rounded bg-white/10 disabled:opacity-40"
                    onClick={() => void snapshot(challenge.id, "final")}
                  >
                    {ADMIN_RISING_STARS_SNAPSHOT_FINAL}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-white/10 p-4">
          <h2 className="font-semibold mb-3">{ADMIN_RISING_STARS_AUDIT}</h2>
          <div className="space-y-2 max-h-80 overflow-y-auto text-xs">
            {(audit ?? []).map((row) => (
              <div key={row.id} className="border-b border-white/5 pb-2 break-words">
                <span className="text-[#F5F5F7]">{row.action}</span> {row.entity_type} {row.entity_id || ""} ·{" "}
                {row.created_at || ""}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
