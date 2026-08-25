import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle, Eye, Flag, XCircle } from "lucide-react";
import {
  ADMIN_REPORTS_EMPTY,
  ADMIN_REPORTS_ERROR,
  ADMIN_REPORTS_FILTER_ALL,
  ADMIN_REPORTS_FILTER_PENDING,
  ADMIN_REPORTS_HOME,
  ADMIN_REPORTS_LOADING,
  ADMIN_REPORTS_NO_ACTION,
  ADMIN_REPORTS_NO_DETAILS,
  ADMIN_REPORTS_REMOVE,
  ADMIN_REPORTS_REPORTED_BY,
  ADMIN_REPORTS_RESOLVE_FAILURE,
  ADMIN_REPORTS_RESOLVE_SUCCESS,
  ADMIN_REPORTS_TITLE,
  ADMIN_REPORTS_UNKNOWN_REPORTER,
  ADMIN_REPORTS_VIEW,
  ADMIN_REPORTS_WARN,
  countQueuedAdminReports,
  formatAdminReportCreated,
  formatAdminReportReason,
  isAdminReportQueueStatus,
  type AdminReportAction,
  type AdminReportsFilter,
} from "@/content/adminReports";
import { apiAdminListReports, apiAdminResolveReport, type AdminReportRow } from "@/features/admin/adminApi";
import { containerReturnState } from "@/lib/settingsNav";
import { showToast } from "@/lib/toast";
import { useAuthStore } from "@/store/useAuthStore";

export default function AdminReports() {
  const navigate = useNavigate();
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const isAdmin = useAuthStore((state) => state.user?.isAdmin === true);
  const [filter, setFilter] = useState<AdminReportsFilter>("pending");
  const [reports, setReports] = useState<AdminReportRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [pendingIds, setPendingIds] = useState<Record<string, true>>({});
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!isAdmin || !userId) {
      setReports(null);
      setError(null);
      setReady(false);
      setListLoading(false);
      return;
    }
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const ownerId = userId;
    setReports(null);
    setError(null);
    setListLoading(true);
    void apiAdminListReports(filter).then((result) => {
      if (requestIdRef.current !== requestId) return;
      if (useAuthStore.getState().user?.id !== ownerId) return;
      if (useAuthStore.getState().user?.isAdmin !== true) {
        setReports(null);
        setError(null);
        setListLoading(false);
        setReady(false);
        return;
      }
      if (result.error || !result.reports) {
        setReports(null);
        setError(result.error || ADMIN_REPORTS_ERROR);
        setListLoading(false);
        setReady(true);
        return;
      }
      setReports(result.reports);
      setError(null);
      setListLoading(false);
      setReady(true);
    });
  }, [filter, isAdmin, userId]);

  const openReportTarget = useCallback(
    (targetType: string, targetId: string) => {
      const state = containerReturnState(ADMIN_REPORTS_HOME);
      if (targetType === "video") navigate(`/video/${targetId}`, { state });
      else if (targetType === "user" || targetType === "profile") navigate(`/profile/${targetId}`, { state });
      else if (targetType === "stream" || targetType === "live") navigate(`/live/${targetId}`, { state });
      else navigate(`/video/${targetId}`, { state });
    },
    [navigate],
  );

  const setPending = (reportId: string, pending: boolean) => {
    setPendingIds((current) => {
      if (pending) return { ...current, [reportId]: true };
      const next = { ...current };
      delete next[reportId];
      return next;
    });
  };

  const handleResolve = async (reportId: string, action: AdminReportAction) => {
    if (pendingIds[reportId]) return;
    setPending(reportId, true);
    const result = await apiAdminResolveReport(reportId, action);
    if (useAuthStore.getState().user?.isAdmin !== true) {
      setPending(reportId, false);
      return;
    }
    if (!result.ok) {
      showToast(ADMIN_REPORTS_RESOLVE_FAILURE);
      setPending(reportId, false);
      return;
    }
    setReports((current) => {
      if (!current) return current;
      if (filter === "pending" && !isAdminReportQueueStatus(result.report.status)) {
        return current.filter((row) => row.id !== reportId);
      }
      return current.map((row) => (row.id === reportId ? result.report : row));
    });
    showToast(ADMIN_REPORTS_RESOLVE_SUCCESS);
    setPending(reportId, false);
  };

  if (!ready && listLoading) {
    return (
      <div className="min-h-screen elix-page-glass bg-transparent flex items-center justify-center text-white" aria-busy="true">
        {ADMIN_REPORTS_LOADING}
      </div>
    );
  }

  const queuedCount = reports ? countQueuedAdminReports(reports) : 0;

  return (
    <div className="min-h-screen elix-page-glass bg-transparent text-white p-6">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-6 flex items-center gap-3">
          <Flag className="w-8 h-8 text-white/70" />
          {ADMIN_REPORTS_TITLE}
        </h1>

        <div className="mb-6 flex gap-4">
          <button
            type="button"
            onClick={() => setFilter("pending")}
            aria-pressed={filter === "pending"}
            className={`px-4 py-2 rounded-lg font-semibold ${
              filter === "pending" ? "bg-[#E6E9EE] text-white elix-accent" : "bg-[rgba(255,255,255,0.06)] text-white"
            }`}
          >
            {ADMIN_REPORTS_FILTER_PENDING} ({queuedCount})
          </button>
          <button
            type="button"
            onClick={() => setFilter("all")}
            aria-pressed={filter === "all"}
            className={`px-4 py-2 rounded-lg font-semibold ${
              filter === "all" ? "bg-[#E6E9EE] text-white elix-accent" : "bg-[rgba(255,255,255,0.06)] text-white"
            }`}
          >
            {ADMIN_REPORTS_FILTER_ALL}
          </button>
        </div>

        {error ? (
          <p role="alert" className="text-sm text-rose-300 mb-6">
            {error}
          </p>
        ) : listLoading || !reports ? (
          <p className="text-white" aria-busy="true">
            {ADMIN_REPORTS_LOADING}
          </p>
        ) : (
          <div className="space-y-4">
            {reports.map((report) => (
              <div key={report.id} className="bg-transparent rounded-lg p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="px-3 py-1 bg-white/25 rounded-full text-xs font-bold">
                        {formatAdminReportReason(report.reason)}
                      </span>
                      <span className="text-gray-400 text-sm">{report.targetType}</span>
                    </div>
                    <p className="text-gray-300 mb-2 break-words">{report.details || ADMIN_REPORTS_NO_DETAILS}</p>
                    <p className="text-gray-500 text-sm">
                      {ADMIN_REPORTS_REPORTED_BY} {report.reporter?.username || ADMIN_REPORTS_UNKNOWN_REPORTER} •{" "}
                      {formatAdminReportCreated(report.createdAt)}
                    </p>
                  </div>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-bold shrink-0 ${
                      isAdminReportQueueStatus(report.status)
                        ? "bg-[#E6E9EE]"
                        : report.status === "resolved" || report.status === "actioned"
                          ? "bg-[#E6E9EE]"
                          : "bg-[rgba(255,255,255,0.06)]"
                    }`}
                  >
                    {report.status}
                  </span>
                </div>

                {isAdminReportQueueStatus(report.status) ? (
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      disabled={Boolean(pendingIds[report.id])}
                      onClick={() => void handleResolve(report.id, "removed")}
                      className="px-4 py-2 bg-white/25 rounded hover:bg-white/30 flex items-center gap-2"
                    >
                      <XCircle className="w-4 h-4" />
                      {ADMIN_REPORTS_REMOVE}
                    </button>
                    <button
                      type="button"
                      disabled={Boolean(pendingIds[report.id])}
                      onClick={() => void handleResolve(report.id, "warned")}
                      className="px-4 py-2 bg-[#E6E9EE] rounded hover:bg-[#E6E9EE] flex items-center gap-2"
                    >
                      <Flag className="w-4 h-4" />
                      {ADMIN_REPORTS_WARN}
                    </button>
                    <button
                      type="button"
                      disabled={Boolean(pendingIds[report.id])}
                      onClick={() => void handleResolve(report.id, "no_action")}
                      className="px-4 py-2 bg-[rgba(255,255,255,0.06)] rounded hover:bg-[rgba(255,255,255,0.06)] flex items-center gap-2"
                    >
                      <CheckCircle className="w-4 h-4" />
                      {ADMIN_REPORTS_NO_ACTION}
                    </button>
                    <button
                      type="button"
                      onClick={() => openReportTarget(report.targetType, report.targetId)}
                      className="px-4 py-2 bg-[#E6E9EE] rounded hover:bg-[#E6E9EE] flex items-center gap-2"
                    >
                      <Eye className="w-4 h-4" />
                      {ADMIN_REPORTS_VIEW}
                    </button>
                  </div>
                ) : null}
              </div>
            ))}

            {reports.length === 0 ? (
              <div className="text-center py-12 text-gray-400">{ADMIN_REPORTS_EMPTY}</div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
