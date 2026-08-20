import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetchAdminReports, apiResolveReport, type AdminReportRow } from "@/features/admin/adminApi";
import { PageScaffold } from "@/components/PageScaffold";
import { showToast } from "@/lib/toast";

export default function AdminReports() {
  const navigate = useNavigate();
  const [reports, setReports] = useState<AdminReportRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void apiFetchAdminReports().then((res) => {
      if (res.error) setError(res.error);
      else setReports(res.reports);
    });
  }, []);
  return (
    <PageScaffold title="Reports" onClose={() => navigate("/admin", { replace: true })}>
      {error ? <p className="px-4 text-rose-300 text-sm">{error}</p> : null}
      <div className="px-3 py-2">
        {reports.map((r) => (
          <div key={r.id} className="py-2 border-b border-white/10 text-sm flex items-center gap-2">
            <span className="flex-1 min-w-0 truncate">{r.targetKind} {r.targetId} · {r.reason} · {r.status}</span>
            {r.status !== "resolved" ? (
              <button
                type="button"
                className="text-xs border border-white/20 rounded-full px-3 py-1 shrink-0"
                onClick={() => {
                  void apiResolveReport(r.id).then((res) => {
                    if (!res.ok) showToast(res.error);
                    else setReports((prev) => prev.map((row) => (row.id === r.id ? { ...row, status: "resolved" } : row)));
                  });
                }}
              >
                Resolve
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </PageScaffold>
  );
}
