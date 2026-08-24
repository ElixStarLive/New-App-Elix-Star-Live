import { Capacitor } from "@capacitor/core";
import { apiDeleteDeviceToken, apiRegisterDeviceToken, type DeviceTokenPlatform } from "./deviceTokenApi";

let registerLock = false;
let unregisterLock = false;

export function resetDeviceTokenLocksForTests(): void {
  registerLock = false;
  unregisterLock = false;
}

export function currentNativePushPlatform(): DeviceTokenPlatform | null {
  if (!Capacitor.isNativePlatform()) return null;
  const name = Capacitor.getPlatform();
  if (name === "ios") return "ios";
  if (name === "android") return "android";
  return null;
}

export async function registerCurrentDeviceToken(token: string): Promise<{ ok: true } | { ok: false; error: string; sessionExpired: boolean }> {
  const platform = currentNativePushPlatform();
  if (!platform) {
    return { ok: false, error: "Push token registration is native-only", sessionExpired: false };
  }
  if (registerLock) return { ok: false, error: "Register already in progress", sessionExpired: false };
  registerLock = true;
  try {
    return await apiRegisterDeviceToken(token, platform);
  } finally {
    registerLock = false;
  }
}

export async function unregisterCurrentDeviceToken(): Promise<void> {
  const platform = currentNativePushPlatform();
  if (!platform || unregisterLock) return;
  unregisterLock = true;
  try {
    await apiDeleteDeviceToken(platform);
  } finally {
    unregisterLock = false;
  }
}
