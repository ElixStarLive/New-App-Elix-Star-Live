import { deviceTokenMutationSchema } from "@shared/contracts";
import { apiRequest } from "@/lib/apiClient";

export type DeviceTokenPlatform = "android" | "ios" | "web";

function isSessionFailure(status: number, code?: string): boolean {
  return status === 401 && (code === "unauthenticated" || code === "session_expired");
}

export async function apiRegisterDeviceToken(
  token: string,
  platform: DeviceTokenPlatform,
): Promise<{ ok: true } | { ok: false; error: string; sessionExpired: boolean }> {
  const { data, error } = await apiRequest<unknown>("/api/device-tokens", {
    method: "POST",
    body: JSON.stringify({ token, platform }),
  });
  if (error) {
    return {
      ok: false,
      error: error.message || "Could not register device token",
      sessionExpired: isSessionFailure(error.status, error.code),
    };
  }
  const parsed = deviceTokenMutationSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, error: "Could not register device token", sessionExpired: false };
  }
  return { ok: true };
}

export async function apiDeleteDeviceToken(
  platform: DeviceTokenPlatform,
): Promise<{ ok: true } | { ok: false; error: string; sessionExpired: boolean }> {
  const { data, error } = await apiRequest<unknown>("/api/device-tokens", {
    method: "DELETE",
    body: JSON.stringify({ platform }),
  });
  if (error) {
    return {
      ok: false,
      error: error.message || "Could not unregister device token",
      sessionExpired: isSessionFailure(error.status, error.code),
    };
  }
  const parsed = deviceTokenMutationSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, error: "Could not unregister device token", sessionExpired: false };
  }
  return { ok: true };
}
