import {
  engagementMissionClaimResponseSchema,
  engagementMissionsResponseSchema,
  type EngagementMission,
} from "@shared/contracts";
import { apiRequest } from "@/lib/apiClient";

export type EngagementMissionsApiFailure = {
  ok: false;
  error: string;
  sessionExpired: boolean;
  disabled: boolean;
};

export function isEngagementMissionsSessionFailure(status: number, code?: string): boolean {
  return status === 401 && (code === "unauthenticated" || code === "session_expired");
}

function failure(error: { message?: string; status: number; code?: string }): EngagementMissionsApiFailure {
  return {
    ok: false,
    error: error.message || "Could not load missions",
    sessionExpired: isEngagementMissionsSessionFailure(error.status, error.code),
    disabled: error.status === 404 || error.code === "ENGAGEMENT_HUB_DISABLED",
  };
}

export async function apiEngagementMissions(): Promise<
  { ok: true; missions: EngagementMission[] } | EngagementMissionsApiFailure
> {
  const { data, error } = await apiRequest<unknown>("/api/engagement/missions");
  if (error) return failure(error);
  const parsed = engagementMissionsResponseSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, error: "Could not load missions", sessionExpired: false, disabled: false };
  }
  return { ok: true, missions: parsed.data.missions };
}

export async function apiEngagementMissionClaim(
  missionId: string,
): Promise<{ ok: true; alreadyClaimed?: boolean } | EngagementMissionsApiFailure> {
  const { data, error } = await apiRequest<unknown>(
    `/api/engagement/missions/${encodeURIComponent(missionId)}/claim`,
    { method: "POST" },
  );
  if (error) {
    return {
      ok: false,
      error: error.message || "Claim failed",
      sessionExpired: isEngagementMissionsSessionFailure(error.status, error.code),
      disabled: error.status === 404 || error.code === "ENGAGEMENT_HUB_DISABLED",
    };
  }
  const parsed = engagementMissionClaimResponseSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, error: "Claim failed", sessionExpired: false, disabled: false };
  }
  return parsed.data;
}
