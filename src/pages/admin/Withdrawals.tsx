import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Wallet } from "lucide-react";
import {
  ADMIN_WITHDRAWAL_ACTION_LABELS,
  ADMIN_WITHDRAWAL_TABS,
  ADMIN_WITHDRAWALS_ACTION_FAILED,
  ADMIN_WITHDRAWALS_BACK,
  ADMIN_WITHDRAWALS_EMPTY,
  ADMIN_WITHDRAWALS_ERROR,
  ADMIN_WITHDRAWALS_LOADING,
  ADMIN_WITHDRAWALS_NOTE_LABEL,
  ADMIN_WITHDRAWALS_NOTE_PLACEHOLDER,
  ADMIN_WITHDRAWALS_NOTE_REQUIRED,
  ADMIN_WITHDRAWALS_SUBTITLE,
  ADMIN_WITHDRAWALS_TITLE,
  ADMIN_WITHDRAWALS_UPDATED,
  actionRequiresAdminNote,
  adminWithdrawalTabLabel,
  formatAdminWithdrawalCreator,
  formatAdminWithdrawalPence,
  formatAdminWithdrawalStatus,
  type AdminWithdrawalAction,
  type AdminWithdrawalTab,
} from "@/content/adminWithdrawals";
import {
  apiAdminWithdrawalAction,
  apiFetchAdminWithdrawals,
  type AdminWithdrawalRow,
} from "@/features/admin/adminApi";
import { showToast } from "@/lib/toast";
import { useAuthStore } from "@/store/useAuthStore";

export default function AdminWithdrawals() {
  const navigate = useNavigate();
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const isAdmin = useAuthStore((state) => state.user?.isAdmin === true);
  const [status, setStatus] = useState<AdminWithdrawalTab>("pending");
  const [rows, setRows] = useState<AdminWithdrawalRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!isAdmin || !userId) {
      setRows(null);
      setError(null);
      setReady(false);
      setListLoading(false);
      return;
    }
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const ownerId = userId;
    setError(null);
    setListLoading(true);
    void apiFetchAdminWithdrawals(status).then((result) => {
      if (requestIdRef.current !== requestId) return;
      if (useAuthStore.getState().user?.id !== ownerId) return;
      if (useAuthStore.getState().user?.isAdmin !== true) {
        setRows(null);
        setError(null);
        setListLoading(false);
        setReady(false);
        return;
      }
      if (result.error || !result.data) {
        setRows(null);
        const message = result.error || ADMIN_WITHDRAWALS_ERROR;
        setError(message);
        showToast(message);
        setListLoading(false);
        setReady(true);
        return;
      }
      setRows(result.data);
      setError(null);
      setListLoading(false);
      setReady(true);
    });
  }, [isAdmin, userId, status]);

  if (!isAdmin || !userId) {
    return null;
  }

  if (!ready && listLoading) {
    return (
      <div className="min-h-screen elix-page-glass bg-transparent flex items-center justify-center text-white" aria-busy="true">
        {ADMIN_WITHDRAWALS_LOADING}
      </div>
    );
  }

  const act = async (id: string, action: AdminWithdrawalAction) => {
    if (busyId) return;
    if (actionRequiresAdminNote(action) && !note.trim()) {
      showToast(ADMIN_WITHDRAWALS_NOTE_REQUIRED);
      return;
    }
    const ownerId = userId;
    setBusyId(id);
    const result = await apiAdminWithdrawalAction(id, action, note);
    if (useAuthStore.getState().user?.id !== ownerId || useAuthStore.getState().user?.isAdmin !== true) {
      setBusyId(null);
      setRows(null);
      setReady(false);
      return;
    }
    setBusyId(null);
    if (!result.ok) {
      showToast(result.error || ADMIN_WITHDRAWALS_ACTION_FAILED);
      return;
    }
    setNote("");
    showToast(ADMIN_WITHDRAWALS_UPDATED);
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setListLoading(true);
    const refreshed = await apiFetchAdminWithdrawals(status);
    if (requestIdRef.current !== requestId) return;
    if (useAuthStore.getState().user?.id !== ownerId || useAuthStore.getState().user?.isAdmin !== true) {
      setRows(null);
      setReady(false);
      return;
    }
    if (refreshed.error || !refreshed.data) {
      setRows(null);
      const message = refreshed.error || ADMIN_WITHDRAWALS_ERROR;
      setError(message);
      showToast(message);
      setListLoading(false);
      return;
    }
    setRows(refreshed.data);
    setError(null);
    setListLoading(false);
  };

  return (
    <div className="min-h-screen elix-page-glass bg-transparent text-white p-6">
      <div className="max-w-5xl mx-auto">
        <button type="button" className="text-white/50 text-sm mb-4" onClick={() => navigate("/admin", { replace: true })}>
          {ADMIN_WITHDRAWALS_BACK}
        </button>
        <h1 className="text-2xl font-bold mb-2 flex items-center gap-2">
          <Wallet className="w-7 h-7 text-[#F5F5F7]" />
          {ADMIN_WITHDRAWALS_TITLE}
        </h1>
        <p className="text-sm text-white/50 mb-4">{ADMIN_WITHDRAWALS_SUBTITLE}</p>

        <div className="flex flex-wrap gap-2 mb-4">
          {ADMIN_WITHDRAWAL_TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              aria-pressed={status === tab}
              onClick={() => setStatus(tab)}
              className={`px-3 py-1 rounded-full text-xs font-semibold ${
                status === tab ? "bg-[#E6E9EE] text-white elix-accent" : "bg-white/10 text-white/70"
              }`}
            >
              {adminWithdrawalTabLabel(tab)}
            </button>
          ))}
        </div>

        <label className="block text-xs text-white/50 mb-1" htmlFor="admin-withdrawal-note">
          {ADMIN_WITHDRAWALS_NOTE_LABEL}
        </label>
        <input
          id="admin-withdrawal-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          className="w-full mb-4 bg-white/10 border border-white/10 rounded-xl px-3 py-2 text-sm"
          placeholder={ADMIN_WITHDRAWALS_NOTE_PLACEHOLDER}
        />

        {error ? (
          <p role="alert" className="text-red-400 text-sm">
            {error}
          </p>
        ) : listLoading || !rows ? (
          <p className="text-white/50" aria-busy="true">
            {ADMIN_WITHDRAWALS_LOADING}
          </p>
        ) : rows.length === 0 ? (
          <p className="text-white/40 text-sm">{ADMIN_WITHDRAWALS_EMPTY}</p>
        ) : (
          <ul className="space-y-3">
            {rows.map((row) => (
              <li key={row.id} className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                <div className="flex flex-wrap justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <p className="font-semibold break-words">{formatAdminWithdrawalCreator(row)}</p>
                    <p className="text-xs text-white/40 break-all">{row.id}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[#F5F5F7] font-bold tabular-nums">{formatAdminWithdrawalPence(row.amount_pence)}</p>
                    <p className="text-xs text-white/50">{formatAdminWithdrawalStatus(row.status)}</p>
                  </div>
                </div>
                {row.processed_by ? (
                  <p className="text-[11px] text-white/35 mb-2 break-words">
                    By {row.processed_by}
                    {row.processed_at ? ` · ${new Date(row.processed_at).toLocaleString()}` : ""}
                    {row.admin_note ? ` · ${row.admin_note}` : ""}
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  {row.status === "pending" ? (
                    <>
                      <ActionButton
                        disabled={busyId === row.id}
                        onClick={() => void act(row.id, "review")}
                        label={ADMIN_WITHDRAWAL_ACTION_LABELS.review}
                      />
                      <ActionButton
                        disabled={busyId === row.id}
                        onClick={() => void act(row.id, "approve")}
                        label={ADMIN_WITHDRAWAL_ACTION_LABELS.approve}
                      />
                      <ActionButton
                        disabled={busyId === row.id}
                        onClick={() => void act(row.id, "reject")}
                        label={ADMIN_WITHDRAWAL_ACTION_LABELS.reject}
                      />
                      <ActionButton
                        disabled={busyId === row.id}
                        onClick={() => void act(row.id, "cancel")}
                        label={ADMIN_WITHDRAWAL_ACTION_LABELS.cancel}
                      />
                    </>
                  ) : null}
                  {row.status === "under_review" ? (
                    <>
                      <ActionButton
                        disabled={busyId === row.id}
                        onClick={() => void act(row.id, "approve")}
                        label={ADMIN_WITHDRAWAL_ACTION_LABELS.approve}
                      />
                      <ActionButton
                        disabled={busyId === row.id}
                        onClick={() => void act(row.id, "reject")}
                        label={ADMIN_WITHDRAWAL_ACTION_LABELS.reject}
                      />
                      <ActionButton
                        disabled={busyId === row.id}
                        onClick={() => void act(row.id, "cancel")}
                        label={ADMIN_WITHDRAWAL_ACTION_LABELS.cancel}
                      />
                    </>
                  ) : null}
                  {row.status === "approved" ? (
                    <ActionButton
                      disabled={busyId === row.id}
                      onClick={() => void act(row.id, "mark-paid")}
                      label={ADMIN_WITHDRAWAL_ACTION_LABELS["mark-paid"]}
                    />
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ActionButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white/10 hover:bg-white/15 disabled:opacity-40"
    >
      {label}
    </button>
  );
}
