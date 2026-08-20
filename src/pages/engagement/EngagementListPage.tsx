import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiRequest } from "@/lib/apiClient";
import { isRecord } from "@/lib/isRecord";
import { PageScaffold } from "@/components/PageScaffold";
import { ENGAGEMENT_HOME } from "@/lib/settingsNav";
import { showToast } from "@/lib/toast";

export function EngagementListPage({
  title,
  path,
  claimPath,
}: {
  title: string;
  path: string;
  claimPath?: (id: string) => string;
}) {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Array<{ id: string; title: string; detail: string; claimable: boolean }>>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    void apiRequest<unknown>(path).then((res) => {
      if (res.error) {
        setError(res.error.message);
        return;
      }
      const list = Array.isArray(res.data) ? res.data : isRecord(res.data) && Array.isArray(res.data.items) ? res.data.items : [];
      const next: Array<{ id: string; title: string; detail: string; claimable: boolean }> = [];
      for (const raw of list) {
        if (!isRecord(raw) || typeof raw.id !== "string") continue;
        next.push({
          id: raw.id,
          title: typeof raw.title === "string" ? raw.title : title,
          detail: typeof raw.detail === "string" ? raw.detail : "",
          claimable: raw.claimable === true,
        });
      }
      setRows(next);
    });
  }, [path, title]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <PageScaffold title={title} onClose={() => navigate(ENGAGEMENT_HOME, { replace: true })}>
      {error ? <p className="px-4 text-rose-300 text-sm">{error}</p> : null}
      <div className="px-3 py-2 space-y-2">
        {rows.map((r) => (
          <button
            key={r.id}
            type="button"
            className="w-full text-left border border-white/10 rounded-xl p-3"
            onClick={() => {
              if (!claimPath || !r.claimable) return;
              void apiRequest(claimPath(r.id), { method: "POST" }).then((res) => {
                if (res.error) showToast(res.error.message);
                else {
                  showToast("Claimed");
                  refresh();
                }
              });
            }}
          >
            <p className="font-semibold text-sm">{r.title}</p>
            <p className="text-[12px] text-white/50">{r.detail}</p>
          </button>
        ))}
        {rows.length === 0 && !error ? <p className="text-white/40 text-sm text-center py-8">Nothing here yet</p> : null}
      </div>
    </PageScaffold>
  );
}
