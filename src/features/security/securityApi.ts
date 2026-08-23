import {
  twoFactorEnrollSchema,
  twoFactorMutationSchema,
  twoFactorStatusSchema,
} from "@shared/contracts";
import { apiRequest } from "@/lib/apiClient";

export type SecurityApiFailure = {
  ok: false;
  error: string;
  sessionExpired: boolean;
};

export function isSecuritySessionFailure(status: number, code?: string): boolean {
  return status === 401 && (code === "unauthenticated" || code === "session_expired");
}

function failure(error: { message: string; status: number; code?: string }, fallback: string): SecurityApiFailure {
  return {
    ok: false,
    error: error.message || fallback,
    sessionExpired: isSecuritySessionFailure(error.status, error.code),
  };
}

export async function apiGetTwoFactorStatus(): Promise<{ ok: true; enabled: boolean } | SecurityApiFailure> {
  const { data, error } = await apiRequest<unknown>("/api/auth/2fa/status");
  if (error) return failure(error, "Could not load 2FA status");
  const parsed = twoFactorStatusSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, error: "Could not load 2FA status", sessionExpired: false };
  }
  return { ok: true, enabled: parsed.data.enabled };
}

export async function apiEnrollTwoFactor(): Promise<{ ok: true; secret: string } | SecurityApiFailure> {
  const { data, error } = await apiRequest<unknown>("/api/auth/2fa/enroll", {
    method: "POST",
    body: "{}",
  });
  if (error) return failure(error, "Could not start 2FA enrollment");
  const parsed = twoFactorEnrollSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, error: "Could not start 2FA enrollment", sessionExpired: false };
  }
  return { ok: true, secret: parsed.data.secret };
}

export async function apiVerifyTwoFactor(
  code: string,
): Promise<{ ok: true; enabled: true } | SecurityApiFailure> {
  const { data, error } = await apiRequest<unknown>("/api/auth/2fa/verify", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
  if (error) return failure(error, "Invalid code — 2FA was not enabled");
  const parsed = twoFactorMutationSchema.safeParse(data);
  if (!parsed.success || parsed.data.enabled !== true) {
    return { ok: false, error: "Invalid code — 2FA was not enabled", sessionExpired: false };
  }
  return { ok: true, enabled: true };
}

export async function apiDisableTwoFactor(
  code: string,
): Promise<{ ok: true; enabled: false } | SecurityApiFailure> {
  const { data, error } = await apiRequest<unknown>("/api/auth/2fa/disable", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
  if (error) return failure(error, "Could not disable 2FA");
  const parsed = twoFactorMutationSchema.safeParse(data);
  if (!parsed.success || parsed.data.enabled !== false) {
    return { ok: false, error: "Could not disable 2FA", sessionExpired: false };
  }
  return { ok: true, enabled: false };
}
