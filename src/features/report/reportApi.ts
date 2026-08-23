import { reportResponseSchema, type ReportReason, type ReportTargetType } from "@shared/contracts";
import { apiRequest } from "@/lib/apiClient";

export type ReportApiFailure = {
  ok: false;
  error: string;
  sessionExpired: boolean;
};

export function isReportSessionFailure(status: number, code?: string): boolean {
  return status === 401 && (code === "unauthenticated" || code === "session_expired");
}

export async function apiCreateReport(body: {
  targetType: ReportTargetType;
  targetId: string;
  reason: ReportReason;
  details: string;
}): Promise<{ ok: true; id: string } | ReportApiFailure> {
  const { data, error } = await apiRequest<unknown>("/api/report", {
    method: "POST",
    body: JSON.stringify({
      targetType: body.targetType,
      targetId: body.targetId,
      reason: body.reason,
      details: body.details,
    }),
  });
  if (error) {
    return {
      ok: false,
      error: error.message || "Failed to submit report. Please try again.",
      sessionExpired: isReportSessionFailure(error.status, error.code),
    };
  }
  const parsed = reportResponseSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, error: "Failed to submit report. Please try again.", sessionExpired: false };
  }
  return { ok: true, id: parsed.data.id };
}
