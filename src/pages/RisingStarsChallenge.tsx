import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiRequest } from "@/lib/apiClient";
import { isRecord } from "@/lib/isRecord";
import { PageScaffold } from "@/components/PageScaffold";
import { RISING_STARS_HOME } from "@/lib/settingsNav";
import { showToast } from "@/lib/toast";

export default function RisingStarsChallenge() {
  const { challengeId } = useParams();
  const navigate = useNavigate();
  const [title, setTitle] = useState("Challenge");
  const [error, setError] = useState<string | null>(null);
  const [entries, setEntries] = useState<Array<{ id: string; title: string; detail: string }>>([]);

  const refresh = useCallback(() => {
    if (!challengeId) return;
    void apiRequest<unknown>(`/api/rising-stars/${encodeURIComponent(challengeId)}`).then((res) => {
      if (res.error) {
        setError(res.error.message);
        return;
      }
      if (isRecord(res.data) && typeof res.data.title === "string") setTitle(res.data.title);
      const list = isRecord(res.data) && Array.isArray(res.data.items) ? res.data.items : [];
      const next: Array<{ id: string; title: string; detail: string }> = [];
      for (const raw of list) {
        if (!isRecord(raw) || typeof raw.id !== "string") continue;
        next.push({
          id: raw.id,
          title: typeof raw.title === "string" ? raw.title : "Entry",
          detail: typeof raw.detail === "string" ? raw.detail : "",
        });
      }
      setEntries(next);
    });
  }, [challengeId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <PageScaffold title={title} onClose={() => navigate(RISING_STARS_HOME, { replace: true })}>
      {error ? <p className="px-4 text-rose-300 text-sm">{error}</p> : null}
      <div className="px-4 py-3 space-y-2">
        <button
          type="button"
          className="w-full border border-[#D8D9DD]/40 rounded-xl py-3 font-bold"
          onClick={() => {
            if (!challengeId) return;
            void apiRequest(`/api/rising-stars/${encodeURIComponent(challengeId)}/enter`, {
              method: "POST",
              body: JSON.stringify({}),
            }).then((res) => {
              if (res.error) showToast(res.error.message);
              else {
                showToast("Entered");
                refresh();
              }
            });
          }}
        >
          Enter challenge
        </button>
        {entries.map((row) => (
          <button
            key={row.id}
            type="button"
            className="w-full text-left border border-white/10 rounded-xl p-3"
            onClick={() => {
              if (!challengeId) return;
              void apiRequest(`/api/rising-stars/${encodeURIComponent(challengeId)}/vote`, {
                method: "POST",
                body: JSON.stringify({ entryId: row.id }),
              }).then((res) => {
                if (res.error) showToast(res.error.message);
                else refresh();
              });
            }}
          >
            <p className="font-semibold text-sm">{row.title}</p>
            <p className="text-[12px] text-white/50">{row.detail}</p>
          </button>
        ))}
      </div>
    </PageScaffold>
  );
}
