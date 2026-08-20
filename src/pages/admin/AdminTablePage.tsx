import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetchAdminTable } from "@/features/admin/adminApi";
import { PageScaffold } from "@/components/PageScaffold";
import { asString, isRecord } from "@/lib/isRecord";

export function AdminTablePage({ title, path }: { title: string; path: string }) {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void apiFetchAdminTable(path).then((res) => {
      if (res.error) setError(res.error);
      else setRows(res.rows);
    });
  }, [path]);

  return (
    <PageScaffold title={title} onClose={() => navigate("/admin", { replace: true })}>
      {error ? <p className="px-4 text-rose-300 text-sm">{error}</p> : null}
      <div className="px-3 py-2 space-y-2">
        {rows.map((row, i) => (
          <div key={asString(row.id, String(i))} className="border border-white/10 rounded-xl p-3 text-[12px] space-y-1">
            {Object.entries(row).slice(0, 6).map(([k, v]) => (
              <p key={k}><span className="text-white/40">{k}: </span>{isRecord(v) ? JSON.stringify(v) : String(v)}</p>
            ))}
          </div>
        ))}
      </div>
    </PageScaffold>
  );
}
