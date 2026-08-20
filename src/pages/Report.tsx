import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { reportBodySchema } from "@shared/contracts";
import { apiRequest } from "@/lib/apiClient";
import { PageScaffold } from "@/components/PageScaffold";
import { FEED_HOME } from "@/lib/settingsNav";
import { showToast } from "@/lib/toast";

export default function Report() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [reason, setReason] = useState("spam");
  const [details, setDetails] = useState("");
  const [targetId, setTargetId] = useState(params.get("targetId") || params.get("userId") || "");

  return (
    <PageScaffold title="Report" onClose={() => navigate(FEED_HOME, { replace: true })}>
      <form
        className="p-4 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          const kindRaw = params.get("targetKind") || "user";
          const targetKind =
            kindRaw === "video" || kindRaw === "comment" || kindRaw === "live" || kindRaw === "message" || kindRaw === "user"
              ? kindRaw
              : "user";
          const parsed = reportBodySchema.safeParse({
            targetKind,
            targetId,
            reason,
            details,
          });
          if (!parsed.success) {
            showToast("Invalid report");
            return;
          }
          void apiRequest("/api/reports", { method: "POST", body: JSON.stringify(parsed.data) }).then((r) => {
            if (r.error) showToast(r.error.message);
            else navigate(FEED_HOME, { replace: true });
          });
        }}
      >
        <input value={targetId} onChange={(e) => setTargetId(e.target.value)} placeholder="User / content id" className="w-full bg-white/10 border border-white/10 rounded-xl px-3 py-3" />
        <select value={reason} onChange={(e) => setReason(e.target.value)} className="w-full bg-white/10 border border-white/10 rounded-xl px-3 py-3">
          <option value="spam">Spam</option>
          <option value="harassment">Harassment</option>
          <option value="hate">Hate</option>
          <option value="other">Other</option>
        </select>
        <textarea value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Details" className="w-full min-h-[90px] bg-white/10 border border-white/10 rounded-xl px-3 py-3" />
        <button type="submit" className="w-full border border-[#D8D9DD]/40 rounded-xl py-3 font-bold">Submit</button>
      </form>
    </PageScaffold>
  );
}
