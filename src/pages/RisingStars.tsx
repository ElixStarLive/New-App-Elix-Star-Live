import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiRequest } from "@/lib/apiClient";
import { isRecord } from "@/lib/isRecord";
import { PageScaffold } from "@/components/PageScaffold";
import { RISING_STARS_EXIT_TO } from "@/lib/settingsNav";

export default function RisingStars() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Array<{ id: string; title: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void apiRequest<unknown>("/api/rising-stars").then((res) => {
      if (res.error) {
        setError(res.error.message);
        return;
      }
      const list = Array.isArray(res.data) ? res.data : isRecord(res.data) && Array.isArray(res.data.items) ? res.data.items : [];
      const next: Array<{ id: string; title: string }> = [];
      for (const raw of list) {
        if (!isRecord(raw) || typeof raw.id !== "string") continue;
        next.push({ id: raw.id, title: typeof raw.title === "string" ? raw.title : "Challenge" });
      }
      setRows(next);
    });
  }, []);
  return (
    <PageScaffold title="Rising Stars" onClose={() => navigate(RISING_STARS_EXIT_TO, { replace: true })}>
      {error ? <p className="px-4 text-rose-300 text-sm">{error}</p> : null}
      {rows.map((r) => (
        <button key={r.id} type="button" className="w-full flex items-center gap-3 text-left px-4 py-3 border-b border-white/10" onClick={() => navigate(`/rising-stars/challenge/${r.id}`)}>
          <span className="royce-glow-disc" style={{ width: 36, height: 36 }} aria-hidden>
            ★
          </span>
          <span className="text-[15px]">{r.title}</span>
        </button>
      ))}
      {rows.length === 0 && !error ? <p className="text-white/40 text-sm text-center py-10">No challenges yet</p> : null}
    </PageScaffold>
  );
}
