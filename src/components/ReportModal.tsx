import { useEffect, useMemo, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Ban, Check, EyeOff, Flag, MessageSquare, UserMinus } from "lucide-react";
import { apiCreateReport } from "@/features/report/reportApi";
import {
  MODAL_REPORT_REASONS,
  contentTypeLabel,
  reportModalTargetId,
  type ReportContentType,
} from "@/features/report/reportReasons";
import { createReportSession } from "@/features/report/reportSession";
import { showToast } from "@/lib/toast";
import { useAuthStore } from "@/store/useAuthStore";

const REASON_ICONS = {
  alert: AlertTriangle,
  ban: Ban,
  message: MessageSquare,
  eye: EyeOff,
  flag: Flag,
  user: UserMinus,
} as const;

export type ReportModalProps = {
  isOpen: boolean;
  onClose: () => void;
  videoId: string;
  contentType: ReportContentType;
  contentId?: string;
};

export default function ReportModal({ isOpen, onClose, videoId, contentType, contentId }: ReportModalProps) {
  const userId = useAuthStore((state) => state.user?.id ?? null);
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

  useEffect(() => {
    if (!isOpen) session.resetForm();
  }, [isOpen, session]);

  if (!isOpen) return null;

  const close = () => {
    session.resetForm();
    onClose();
  };

  if (view.kind === "success") {
    return createPortal(
      <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 100100 }} onClick={close}>
        <div
          className="bg-[rgba(0,0,0,0.35)] rounded-2xl p-6 max-w-sm w-full text-center"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <div className="w-8 h-8 bg-[#FFFFFF] rounded-full flex items-center justify-center">
              <Check className="w-5 h-5 text-white" strokeWidth={2} />
            </div>
          </div>
          <h3 className="text-white font-semibold mb-2">Report Submitted</h3>
          <p className="text-white/60 text-sm">
            Thank you for helping keep our community safe. We'll review your report and take appropriate action.
          </p>
        </div>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div className="fixed inset-0 flex items-end justify-center" style={{ zIndex: 100100 }}>
      <div className="absolute inset-0 bg-black/60 pointer-events-auto" onClick={close} />
      <div
        className="relative w-full max-w-[480px] z-10 elix-panel elix-live-sheet backdrop-blur-md rounded-t-2xl p-4 pb-safe flex flex-col gap-1 border border-black pointer-events-auto h-[40vh] max-h-[40vh] overflow-y-auto bottom-sheet-above-nav [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-white/5 [&::-webkit-scrollbar-thumb]:bg-[#E6E9EE]/50 [&::-webkit-scrollbar-thumb]:rounded-full"
        style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.25) transparent" }}
      >
        <div className="flex justify-center mb-2">
          <div className="w-10 h-1 bg-white/20 rounded-full" />
        </div>
        <div className="flex items-center gap-2 mb-1 ml-[4mm]">
          <div className="relative w-9 h-9 rounded-full bg-[rgba(0,0,0,0.35)] overflow-hidden flex items-center justify-center flex-shrink-0">
            <Flag className="relative z-[2] w-4 h-4 text-white/60" strokeWidth={1.8} />
          </div>
          <h3 className="text-white font-bold text-[13px] whitespace-nowrap">Report {contentTypeLabel(contentType)}</h3>
        </div>
        <div className="flex flex-col gap-0.5 ml-[4mm]">
          {MODAL_REPORT_REASONS.map((reason) => {
            const Icon = REASON_ICONS[reason.icon];
            const selected = view.reason === reason.id;
            return (
              <button
                key={reason.id}
                type="button"
                onClick={() => session.setReason(reason.id)}
                className={`w-full px-3 py-2 flex items-center justify-between rounded-lg transition-colors ${
                  selected ? "bg-white/5" : "hover:bg-white/[0.03]"
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <div
                    className={`relative w-9 h-9 rounded-full bg-[rgba(0,0,0,0.35)] overflow-hidden flex items-center justify-center flex-shrink-0 shrink-0 ${
                      selected ? "opacity-100" : ""
                    }`}
                  >
                    <Icon className={`relative z-[2] w-4 h-4 ${reason.color}`} strokeWidth={1.8} />
                  </div>
                  <span className="text-white/80 text-xs font-medium truncate">{reason.title}</span>
                </div>
                <div
                  className={`w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0 ${
                    selected ? "border-[#D8D9DD] bg-[#E6E9EE]" : "border-white/20"
                  }`}
                >
                  {selected ? <Check className="w-2.5 h-2.5 text-black" strokeWidth={3} /> : null}
                </div>
              </button>
            );
          })}
        </div>
        <div className="relative mt-2 ml-[4mm]">
          <textarea
            value={view.details}
            onChange={(event) => session.setDetails(event.target.value)}
            className="w-full bg-[rgba(0,0,0,0.35)]/40 border border-white/10 text-white rounded-lg p-2.5 text-xs focus:outline-none focus:border-white/20 resize-none leading-snug peer"
            rows={2}
            maxLength={500}
          />
          <span
            className={`absolute left-2.5 top-2.5 text-xs text-white/40 pointer-events-none transition-opacity ${
              view.details ? "opacity-0" : ""
            }`}
          >
            Additional details (optional)...
          </span>
        </div>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={close}
            className="flex-1 py-2.5 bg-white/5 text-white/70 font-semibold text-xs rounded-lg hover:bg-white/10 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              void session.submit(contentType, reportModalTargetId(videoId, contentType, contentId));
            }}
            disabled={view.kind === "submitting" || !view.reason}
            className="flex-1 py-2.5 bg-transparent border border-[#D8D9DD]/40 text-[#F5F5F7] font-bold text-xs rounded-lg hover:bg-white/10 disabled:opacity-40 transition"
          >
            {view.kind === "submitting" ? "Submitting..." : "Submit"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
