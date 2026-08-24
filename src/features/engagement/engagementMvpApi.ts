import {
  engagementMvpResponseSchema,
  type EngagementMvpPeriod,
  type EngagementMvpResponse,
} from "@shared/contracts";
import { apiRequest } from "@/lib/apiClient";

export type EngagementMvpApiFailure = {
  ok: false;
  error: string;
  sessionExpired: boolean;
  disabled: boolean;
};

export function isEngagementMvpSessionFailure(status: number, code?: string): boolean {
  return status === 401 && (code === "unauthenticated" || code === "session_expired");
}

export async function apiEngagementMvp(
  period: EngagementMvpPeriod,
): Promise<{ ok: true; board: EngagementMvpResponse } | EngagementMvpApiFailure> {
  const { data, error } = await apiRequest<unknown>(
    `/api/engagement/mvp?period=${encodeURIComponent(period)}`,
  );
  if (error) {
    return {
      ok: false,
      error: error.message || "Could not load MVP board",
      sessionExpired: isEngagementMvpSessionFailure(error.status, error.code),
      disabled: error.status === 404 || error.code === "ENGAGEMENT_HUB_DISABLED",
    };
  }
  const parsed = engagementMvpResponseSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, error: "Could not load MVP board", sessionExpired: false, disabled: false };
  }
  return { ok: true, board: parsed.data };
}
