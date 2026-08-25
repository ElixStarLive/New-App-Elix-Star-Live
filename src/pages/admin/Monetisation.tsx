import { useEffect, useRef, useState } from "react";
import { Banknote } from "lucide-react";
import {
  ADMIN_MONETISATION_AUDIT_REASON,
  ADMIN_MONETISATION_DASHBOARD_TITLE,
  ADMIN_MONETISATION_ERROR,
  ADMIN_MONETISATION_FORYOU_TITLE,
  ADMIN_MONETISATION_FORYOU_UNAVAILABLE,
  ADMIN_MONETISATION_FRAUD_EMPTY,
  ADMIN_MONETISATION_FRAUD_TITLE,
  ADMIN_MONETISATION_GIFT_CREATOR,
  ADMIN_MONETISATION_GIFT_HOURS,
  ADMIN_MONETISATION_GIFT_PLATFORM,
  ADMIN_MONETISATION_GIFTS_TITLE,
  ADMIN_MONETISATION_INVALID_VALUE,
  ADMIN_MONETISATION_LOADING,
  ADMIN_MONETISATION_MILESTONES,
  ADMIN_MONETISATION_REASON_DEFAULT,
  ADMIN_MONETISATION_RECONCILE_TITLE,
  ADMIN_MONETISATION_REPORT_TITLE,
  ADMIN_MONETISATION_REWARDS_TITLE,
  ADMIN_MONETISATION_SAVE,
  ADMIN_MONETISATION_SAVE_FAILED,
  ADMIN_MONETISATION_SAVED,
  ADMIN_MONETISATION_TITLE,
  ADMIN_MONETISATION_WITHDRAWALS_EMPTY,
  ADMIN_MONETISATION_WITHDRAWALS_TITLE,
  parseMonetisationIntegerInput,
} from "@/content/adminMonetisation";
import {
  apiAdminPatchMonetisationConfig,
  apiFetchAdminMonetisation,
  type AdminMonetisation,
  type AdminMonetisationConfigField,
} from "@/features/admin/adminApi";
import { showToast } from "@/lib/toast";
import { useAuthStore } from "@/store/useAuthStore";

function MonetisationField({
  label,
  value,
  disabled,
  onSave,
}: {
  label: string;
  value: number;
  disabled: boolean;
  onSave: (next: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => {
    setDraft(String(value));
  }, [value]);
  return (
    <label className="block bg-white/5 border border-white/10 rounded-lg p-3">
      <span className="text-white/50 text-xs uppercase">{label}</span>
      <div className="flex gap-2 mt-1">
        <input
          aria-label={label}
          className="flex-1 bg-black/40 border border-white/10 rounded px-2 py-1.5 tabular-nums min-w-0"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button
          type="button"
          disabled={disabled}
          className="px-2 py-1 rounded bg-[#E6E9EE] text-white elix-accent text-xs font-bold"
          onClick={() => {
            const parsed = parseMonetisationIntegerInput(draft);
            if (parsed == null) {
              showToast(ADMIN_MONETISATION_INVALID_VALUE);
              return;
            }
            onSave(parsed);
          }}
        >
          {ADMIN_MONETISATION_SAVE}
        </button>
      </div>
    </label>
  );
}

export default function AdminMonetisation() {
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const isAdmin = useAuthStore((state) => state.user?.isAdmin === true);
  const [page, setPage] = useState<AdminMonetisation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [reason, setReason] = useState(ADMIN_MONETISATION_REASON_DEFAULT);
  const [pendingField, setPendingField] = useState<AdminMonetisationConfigField | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!isAdmin || !userId) {
      setPage(null);
      setError(null);
      setReady(false);
      setListLoading(false);
      return;
    }
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const ownerId = userId;
    setPage(null);
    setError(null);
    setListLoading(true);
    void apiFetchAdminMonetisation().then((result) => {
      if (requestIdRef.current !== requestId) return;
      if (useAuthStore.getState().user?.id !== ownerId) return;
      if (useAuthStore.getState().user?.isAdmin !== true) {
        setPage(null);
        setError(null);
        setListLoading(false);
        setReady(false);
        return;
      }
      if (result.error || !result.data) {
        setPage(null);
        setError(result.error || ADMIN_MONETISATION_ERROR);
        setListLoading(false);
        setReady(true);
        return;
      }
      setPage(result.data);
      setError(null);
      setListLoading(false);
      setReady(true);
    });
  }, [isAdmin, userId]);

  const saveField = async (field: AdminMonetisationConfigField, value: number) => {
    if (pendingField) return;
    if (useAuthStore.getState().user?.isAdmin !== true) return;
    setPendingField(field);
    const result = await apiAdminPatchMonetisationConfig(field, value, reason);
    if (useAuthStore.getState().user?.isAdmin !== true) {
      setPendingField(null);
      return;
    }
    if (!result.ok) {
      showToast(ADMIN_MONETISATION_SAVE_FAILED);
      setPendingField(null);
      return;
    }
    setPage((current) => (current ? { ...current, config: result.config } : current));
    const refresh = await apiFetchAdminMonetisation();
    if (useAuthStore.getState().user?.isAdmin !== true) {
      setPendingField(null);
      return;
    }
    if (!refresh.error && refresh.data) {
      setPage(refresh.data);
      setError(null);
    }
    showToast(ADMIN_MONETISATION_SAVED);
    setPendingField(null);
  };

  if (!isAdmin || !userId) {
    return null;
  }

  if (!ready && listLoading) {
    return (
      <div className="min-h-screen elix-page-glass bg-transparent flex items-center justify-center text-white" aria-busy="true">
        {ADMIN_MONETISATION_LOADING}
      </div>
    );
  }

  return (
    <div className="min-h-screen elix-page-glass bg-transparent text-white p-6">
      <div className="max-w-7xl mx-auto space-y-8">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Banknote className="w-8 h-8" />
          {ADMIN_MONETISATION_TITLE}
        </h1>

        {error ? (
          <p role="alert" className="text-sm text-rose-300">
            {error}
          </p>
        ) : listLoading || !page ? (
          <p className="text-white" aria-busy="true">
            {ADMIN_MONETISATION_LOADING}
          </p>
        ) : (
          <>
            <label className="block text-sm text-white/70">
              {ADMIN_MONETISATION_AUDIT_REASON}
              <input
                className="mt-1 w-full max-w-xl bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white text-sm"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </label>

            <section className="space-y-3">
              <h2 className="text-xl font-bold">{ADMIN_MONETISATION_GIFTS_TITLE}</h2>
              <div className="grid md:grid-cols-2 gap-3 text-sm">
                <MonetisationField
                  label={ADMIN_MONETISATION_GIFT_CREATOR}
                  value={page.config.giftCreatorPct}
                  disabled={pendingField != null}
                  onSave={(value) => void saveField("giftCreatorPct", value)}
                />
                <MonetisationField
                  label={ADMIN_MONETISATION_GIFT_PLATFORM}
                  value={page.config.giftPlatformPct}
                  disabled={pendingField != null}
                  onSave={(value) => void saveField("giftPlatformPct", value)}
                />
                <MonetisationField
                  label={ADMIN_MONETISATION_GIFT_HOURS}
                  value={page.config.giftSettlementHours}
                  disabled={pendingField != null}
                  onSave={(value) => void saveField("giftSettlementHours", value)}
                />
              </div>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-bold">{ADMIN_MONETISATION_REWARDS_TITLE}</h2>
              <div className="rounded-lg border border-white/10 p-3 text-xs space-y-1">
                <p className="font-bold text-white/80">{ADMIN_MONETISATION_MILESTONES}</p>
              </div>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-bold">{ADMIN_MONETISATION_DASHBOARD_TITLE}</h2>
              <pre className="text-xs bg-black/40 border border-white/10 rounded-lg p-3 overflow-auto max-h-72">
                {JSON.stringify(page.dashboard, null, 2)}
              </pre>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-bold">{ADMIN_MONETISATION_REPORT_TITLE}</h2>
              <pre className="text-xs bg-black/40 border border-white/10 rounded-lg p-3 overflow-auto max-h-64">
                {JSON.stringify(page.report, null, 2)}
              </pre>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-bold">{ADMIN_MONETISATION_RECONCILE_TITLE}</h2>
              <pre className="text-xs bg-black/40 border border-white/10 rounded-lg p-3 overflow-auto max-h-48">
                {JSON.stringify([], null, 2)}
              </pre>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-bold">{ADMIN_MONETISATION_FRAUD_TITLE}</h2>
              <p className="text-white/40 text-sm">{ADMIN_MONETISATION_FRAUD_EMPTY}</p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-bold">{ADMIN_MONETISATION_FORYOU_TITLE}</h2>
              <p className="text-white/40 text-sm">{ADMIN_MONETISATION_FORYOU_UNAVAILABLE}</p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-bold">{ADMIN_MONETISATION_WITHDRAWALS_TITLE}</h2>
              <div className="space-y-2">
                {page.withdrawals.length === 0 ? (
                  <p className="text-white/40 text-sm">{ADMIN_MONETISATION_WITHDRAWALS_EMPTY}</p>
                ) : (
                  page.withdrawals.map((row) => (
                    <div
                      key={row.id}
                      className="flex flex-wrap items-center gap-2 border border-white/10 rounded-lg p-3 text-sm"
                    >
                      <span className="font-mono text-xs">{row.id}</span>
                      <span>{row.userId}</span>
                      <span className="tabular-nums">{row.amountPence}p</span>
                      <span>{row.status}</span>
                    </div>
                  ))
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
