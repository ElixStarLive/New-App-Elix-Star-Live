import { engagementAchievementsResponseSchema, type EngagementAchievement } from "@shared/contracts";
import { apiRequest } from "@/lib/apiClient";

export type EngagementAchievementsApiFailure = {
  ok: false;
  error: string;
  sessionExpired: boolean;
  disabled: boolean;
};

export function isEngagementAchievementsSessionFailure(status: number, code?: string): boolean {
  return status === 401 && (code === "unauthenticated" || code === "session_expired");
}

export async function apiEngagementAchievements(): Promise<
  { ok: true; achievements: EngagementAchievement[] } | EngagementAchievementsApiFailure
> {
  const { data, error } = await apiRequest<unknown>("/api/engagement/achievements");
  if (error) {
    return {
      ok: false,
      error: error.message || "Could not load achievements",
      sessionExpired: isEngagementAchievementsSessionFailure(error.status, error.code),
      disabled: error.status === 404 || error.code === "ENGAGEMENT_HUB_DISABLED",
    };
  }
  const parsed = engagementAchievementsResponseSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, error: "Could not load achievements", sessionExpired: false, disabled: false };
  }
  return { ok: true, achievements: parsed.data.achievements };
}
