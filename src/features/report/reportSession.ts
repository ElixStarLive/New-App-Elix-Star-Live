import type { ReportReason, ReportTargetType } from "@shared/contracts";
import type { ReportApiFailure } from "./reportApi";

export type ReportViewKind = "form" | "submitting" | "success" | "error";

export type ReportView = {
  kind: ReportViewKind;
  reason: ReportReason | "";
  details: string;
  error: string | null;
};

export const REPORT_SUBMIT_ERROR = "Failed to submit report. Please try again.";

type ReportDeps = {
  getAccountId: () => string | null;
  createReport: (body: {
    targetType: ReportTargetType;
    targetId: string;
    reason: ReportReason;
    details: string;
  }) => Promise<{ ok: true; id: string } | ReportApiFailure>;
  toast: (message: string) => void;
  onSessionExpired: () => void;
};

const emptyView: ReportView = {
  kind: "form",
  reason: "",
  details: "",
  error: null,
};

export function createReportSession(deps: ReportDeps) {
  let view: ReportView = { ...emptyView };
  let generation = 0;
  let accountId: string | null = null;
  let submitting = false;
  const listeners = new Set<() => void>();

  const emit = () => {
    for (const listener of listeners) listener();
  };

  const assign = (next: Partial<ReportView>) => {
    view = { ...view, ...next };
    emit();
  };

  const resetForAccount = (nextAccountId: string | null) => {
    if (nextAccountId === accountId) return;
    accountId = nextAccountId;
    submitting = false;
    generation += 1;
    view = { ...emptyView };
    emit();
  };

  return {
    getSnapshot: () => view,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    bindAccount: (nextAccountId: string | null) => {
      resetForAccount(nextAccountId);
    },
    resetForm: () => {
      submitting = false;
      generation += 1;
      view = { ...emptyView };
      emit();
    },
    setReason: (reason: ReportReason) => {
      if (view.kind === "submitting" || view.kind === "success") return;
      assign({ reason, error: null, kind: "form" });
    },
    setDetails: (details: string) => {
      if (view.kind === "submitting" || view.kind === "success") return;
      assign({ details: details.slice(0, 500), error: null, kind: "form" });
    },
    submit: async (targetType: ReportTargetType, targetId: string) => {
      if (submitting || view.kind === "success") return false;
      if (!view.reason) {
        deps.toast("Please select a reason");
        return false;
      }
      if (!targetId.trim()) {
        deps.toast("Cannot submit report — missing content reference.");
        return false;
      }
      const expectedAccountId = accountId;
      if (!expectedAccountId || deps.getAccountId() !== expectedAccountId) {
        deps.toast("Please sign in to submit a report.");
        return false;
      }
      const gen = generation;
      submitting = true;
      assign({ kind: "submitting", error: null });
      const result = await deps.createReport({
        targetType,
        targetId: targetId.trim(),
        reason: view.reason,
        details: view.details.trim(),
      });
      submitting = false;
      if (gen !== generation || deps.getAccountId() !== expectedAccountId) return false;
      if (!result.ok) {
        if (result.sessionExpired) deps.onSessionExpired();
        assign({ kind: "error", error: result.error || REPORT_SUBMIT_ERROR });
        deps.toast(result.error || REPORT_SUBMIT_ERROR);
        return false;
      }
      assign({ kind: "success", error: null });
      return true;
    },
  };
}

export type ReportSession = ReturnType<typeof createReportSession>;
