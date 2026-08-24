import {
  engagementDailyLoginClaimResponseSchema,
  engagementDailyLoginResponseSchema,
  type EngagementDailyLoginClaimResponse,
  type EngagementDailyLoginState,
} from "@shared/contracts";
import { apiRequest } from "@/lib/apiClient";

export type EngagementDailyLoginApiFailure = {
  ok: false;
  error: string;
  sessionExpired: boolean;
  disabled: boolean;
};

export function isEngagementDailyLoginSessionFailure(status: number, code?: string): boolean {
  return status === 401 && (code === "unauthenticated" || code === "session_expired");
}

function failure(error: { message?: string; status: number; code?: string }): EngagementDailyLoginApiFailure {
  return {
    ok: false,
    error: error.message || "Could not load daily login",
    sessionExpired: isEngagementDailyLoginSessionFailure(error.status, error.code),
    disabled: error.status === 404 || error.code === "ENGAGEMENT_HUB_DISABLED",
  };
}

export async function apiEngagementDailyLogin(): Promise<
  { ok: true; daily: EngagementDailyLoginState } | EngagementDailyLoginApiFailure
> {
  const { data, error } = await apiRequest<unknown>("/api/engagement/daily-login");
  if (error) return failure(error);
  const parsed = engagementDailyLoginResponseSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, error: "Could not load daily login", sessionExpired: false, disabled: false };
  }
  return { ok: true, daily: parsed.data.daily };
}

export async function apiEngagementDailyLoginClaim(): Promise<
  { ok: true } & EngagementDailyLoginClaimResponse | EngagementDailyLoginApiFailure
> {
  const { data, error } = await apiRequest<unknown>("/api/engagement/daily-login/claim", {
    method: "POST",
  });
  if (error) {
    return {
      ok: false,
      error: error.message || "Claim failed",
      sessionExpired: isEngagementDailyLoginSessionFailure(error.status, error.code),
      disabled: error.status === 404 || error.code === "ENGAGEMENT_HUB_DISABLED",
    };
  }
  const parsed = engagementDailyLoginClaimResponseSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, error: "Claim failed", sessionExpired: false, disabled: false };
  }
  return parsed.data;
}
