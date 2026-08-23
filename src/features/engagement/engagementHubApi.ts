import { engagementHubResponseSchema, type EngagementHub } from "@shared/contracts";
import { apiRequest } from "@/lib/apiClient";

export type EngagementHubApiFailure = {
  ok: false;
  error: string;
  sessionExpired: boolean;
  disabled: boolean;
};

export function isEngagementHubSessionFailure(status: number, code?: string): boolean {
  return status === 401 && (code === "unauthenticated" || code === "session_expired");
}

export async function apiEngagementHub(): Promise<{ ok: true; hub: EngagementHub } | EngagementHubApiFailure> {
  const { data, error } = await apiRequest<unknown>("/api/engagement/hub");
  if (error) {
    return {
      ok: false,
      error: error.message || "Could not load Engagement Hub",
      sessionExpired: isEngagementHubSessionFailure(error.status, error.code),
      disabled: error.status === 404 || error.code === "ENGAGEMENT_HUB_DISABLED",
    };
  }
  const parsed = engagementHubResponseSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, error: "Could not load Engagement Hub", sessionExpired: false, disabled: false };
  }
  return { ok: true, hub: parsed.data.hub };
}
