import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { CheckCircle, Flag } from "lucide-react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import SettingsOptionSheet from "@/components/SettingsOptionSheet";
import { apiCreateReport } from "@/features/report/reportApi";
import { PAGE_REPORT_REASONS, parseReportSearch } from "@/features/report/reportReasons";
import { createReportSession } from "@/features/report/reportSession";
import { FEED_HOME, exitToFromLocationState } from "@/lib/settingsNav";
import { showToast } from "@/lib/toast";
import { useAuthStore } from "@/store/useAuthStore";

export const REPORT_HOME = "/report";

export default function Report() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const parsed = useMemo(() => parseReportSearch(searchParams), [searchParams]);
  const reasons = PAGE_REPORT_REASONS[parsed.contentType];

  const session = useMemo(
    () =>
      createReportSession({
        getAccountId: () => useAuthStore.getState().user?.id ?? null,
        createReport: apiCreateReport,
        toast: showToast,
        onSessionExpired: () => {
          void useAuthStore.getState().checkUser();
        },
      }),
    [],
  );
  const view = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);

  useEffect(() => {
    session.bindAccount(userId);
  }, [session, userId]);

  const exit = useCallback(() => {
    navigate(exitToFromLocationState(location.state, FEED_HOME), { replace: true });
  }, [navigate, location.state]);

  if (view.kind === "success") {
    return (
      <SettingsOptionSheet onClose={exit} title="Report">
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="text-center">
            <div className="w-20 h-20 bg-[#FFFFFF] rounded-full mx-auto mb-4 flex items-center justify-center">
              <CheckCircle className="w-10 h-10 text-white" />
            </div>
            <h2 className="text-2xl font-bold mb-2 text-white">Report Submitted</h2>
            <p className="text-[#8B9099]">Thank you for helping keep our community safe.</p>
          </div>
        </div>
      </SettingsOptionSheet>
    );
  }

  return (
    <SettingsOptionSheet onClose={exit} title={parsed.isGeneralSupport ? "Report a problem" : `Report ${parsed.contentType}`}>
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-3 pt-2 pb-[3mm]">
        <div className="text-center mb-6 px-1">
          <div className="w-16 h-16 rounded-full mx-auto mb-3 flex items-center justify-center border border-white/10">
            <Flag className="w-8 h-8 text-[#E6E9EE]" />
          </div>
          <h2 className="text-xl font-bold mb-2 text-white">Why are you reporting this?</h2>
          <p className="text-sm text-[#8B9099]">Your report is anonymous and helps us maintain a safe community</p>
        </div>

        <div className="space-y-2 mb-6">
          {reasons.map((reason) => (
            <button
              key={reason.id}
              type="button"
              onClick={() => session.setReason(reason.id)}
              className={`w-full text-left px-4 py-4 rounded-xl transition border ${
                view.reason === reason.id ? "border-[#D8D9DD] bg-white/10" : "border-white/10 active:bg-white/5"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[#E6E9EE]">{reason.label}</span>
                {view.reason === reason.id ? (
                  <div className="w-6 h-6 bg-[#FFFFFF] rounded-full flex items-center justify-center">
                    <CheckCircle className="w-4 h-4 text-black" />
                  </div>
                ) : null}
              </div>
            </button>
          ))}
        </div>

        <div className="mb-6 px-1">
          <label className="block text-sm font-semibold mb-2 text-[#C8CDD5]">Additional details (optional)</label>
          <textarea
            value={view.details}
            onChange={(event) => session.setDetails(event.target.value)}
            placeholder="Provide more context to help us understand the issue..."
            maxLength={500}
            rows={4}
            className="w-full rounded-xl px-4 py-3 outline-none text-white placeholder:text-[#8B9099] bg-transparent border border-white/10 focus:border-[#D8D9DD] transition resize-none"
          />
          <div className="text-xs text-[#8B9099] mt-1 text-right">{view.details.length}/500</div>
        </div>

        <button
          type="button"
          onClick={() => {
            void session.submit(parsed.targetType, parsed.targetId);
          }}
          disabled={!view.reason || view.kind === "submitting"}
          className="w-full py-4 bg-white/20 text-white rounded-xl font-bold disabled:opacity-40 disabled:cursor-not-allowed active:opacity-90 transition"
        >
          {view.kind === "submitting" ? "Submitting..." : "Submit Report"}
        </button>
      </div>
    </SettingsOptionSheet>
  );
}
