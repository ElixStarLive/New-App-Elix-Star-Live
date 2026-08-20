import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiRequest } from "@/lib/apiClient";
import { isRecord } from "@/lib/isRecord";
import { PageScaffold } from "@/components/PageScaffold";
import { ENGAGEMENT_HOME } from "@/lib/settingsNav";
import { showToast } from "@/lib/toast";

export default function EngagementDailyLogin() {
  const navigate = useNavigate();
  const [title, setTitle] = useState("Daily login");
  const [detail, setDetail] = useState("");
  const [claimable, setClaimable] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    void apiRequest<unknown>("/api/engagement/daily-login").then((res) => {
      if (res.error) {
        setError(res.error.message);
        return;
      }
      const list = isRecord(res.data) && Array.isArray(res.data.items) ? res.data.items : [];
      const first = list[0];
      if (isRecord(first)) {
        setTitle(typeof first.title === "string" ? first.title : "Daily login");
        setDetail(typeof first.detail === "string" ? first.detail : "");
        setClaimable(first.claimable === true);
      }
    });
  };

  useEffect(() => {
    refresh();
  }, []);

  return (
    <PageScaffold title="Daily login" onClose={() => navigate(ENGAGEMENT_HOME, { replace: true })}>
      {error ? <p className="px-4 text-rose-300 text-sm">{error}</p> : null}
      <div className="px-4 py-3 space-y-3">
        <div className="border border-white/10 rounded-xl p-3">
          <p className="font-semibold text-sm">{title}</p>
          <p className="text-[12px] text-white/50">{detail}</p>
        </div>
        {claimable ? (
          <button
            type="button"
            className="w-full border border-[#D8D9DD]/40 rounded-xl py-3 font-bold"
            onClick={() => {
              void apiRequest("/api/engagement/daily-login/claim", { method: "POST" }).then((res) => {
                if (res.error) showToast(res.error.message);
                else {
                  showToast("Claimed");
                  refresh();
                }
              });
            }}
          >
            Claim today
          </button>
        ) : null}
      </div>
    </PageScaffold>
  );
}
