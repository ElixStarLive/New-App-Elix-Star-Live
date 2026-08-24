import { engagementFanLevelResponseSchema, type EngagementFanLevel } from "@shared/contracts";
import { apiRequest } from "@/lib/apiClient";

export type EngagementFanLevelApiFailure = {
  ok: false;
  error: string;
  sessionExpired: boolean;
  disabled: boolean;
};

export function isEngagementFanLevelSessionFailure(status: number, code?: string): boolean {
  return status === 401 && (code === "unauthenticated" || code === "session_expired");
}

export async function apiEngagementFanLevel(): Promise<
  { ok: true; fanLevel: EngagementFanLevel } | EngagementFanLevelApiFailure
> {
  const { data, error } = await apiRequest<unknown>("/api/engagement/fan-level");
  if (error) {
    return {
      ok: false,
      error: error.message || "Could not load fan level",
      sessionExpired: isEngagementFanLevelSessionFailure(error.status, error.code),
      disabled: error.status === 404 || error.code === "ENGAGEMENT_HUB_DISABLED",
    };
  }
  const parsed = engagementFanLevelResponseSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, error: "Could not load fan level", sessionExpired: false, disabled: false };
  }
  return { ok: true, fanLevel: parsed.data.fan_level };
}
