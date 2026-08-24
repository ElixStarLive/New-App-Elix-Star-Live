import { engagementRewardWalletResponseSchema, type EngagementRewardWallet } from "@shared/contracts";
import { apiRequest } from "@/lib/apiClient";

export type EngagementRewardWalletApiFailure = {
  ok: false;
  error: string;
  sessionExpired: boolean;
  disabled: boolean;
};

export function isEngagementRewardWalletSessionFailure(status: number, code?: string): boolean {
  return status === 401 && (code === "unauthenticated" || code === "session_expired");
}

export async function apiEngagementRewardWallet(): Promise<
  { ok: true; wallet: EngagementRewardWallet } | EngagementRewardWalletApiFailure
> {
  const { data, error } = await apiRequest<unknown>("/api/engagement/wallet");
  if (error) {
    return {
      ok: false,
      error: error.message || "Could not load reward wallet",
      sessionExpired: isEngagementRewardWalletSessionFailure(error.status, error.code),
      disabled: error.status === 404 || error.code === "ENGAGEMENT_HUB_DISABLED",
    };
  }
  const parsed = engagementRewardWalletResponseSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, error: "Could not load reward wallet", sessionExpired: false, disabled: false };
  }
  return { ok: true, wallet: parsed.data.wallet };
}
