import { beforeEach, describe, expect, it, vi } from "vitest";

const isNativePlatform = vi.fn();
const getPlatform = vi.fn();
const register = vi.fn();
const requestPermissions = vi.fn();
const addListener = vi.fn();
const notificationsEnabled = vi.fn(() => true);
const userId = vi.fn(() => "user-a");
const registerCurrentDeviceToken = vi.fn(async (_token: string) => ({ ok: true as const }));
const unregisterCurrentDeviceToken = vi.fn(async () => undefined);

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => isNativePlatform(),
    getPlatform: () => getPlatform(),
  },
}));

vi.mock("@capacitor/push-notifications", () => ({
  PushNotifications: {
    requestPermissions: () => requestPermissions(),
    register: () => register(),
    addListener: (...args: unknown[]) => addListener(...args),
  },
}));

vi.mock("@/store/useSettingsStore", () => ({
  useSettingsStore: {
    getState: () => ({ notificationsEnabled: notificationsEnabled() }),
  },
}));

vi.mock("@/store/useAuthStore", () => ({
  useAuthStore: {
    getState: () => ({
      user: userId() ? { id: userId() } : null,
      checkUser: async () => undefined,
    }),
  },
}));

vi.mock("@/features/notifications/deviceTokenSession", () => ({
  registerCurrentDeviceToken: (token: string) => registerCurrentDeviceToken(token),
  unregisterCurrentDeviceToken: () => unregisterCurrentDeviceToken(),
}));

describe("registerPushToken", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    isNativePlatform.mockReset();
    getPlatform.mockReset();
    register.mockReset();
    requestPermissions.mockReset();
    addListener.mockReset();
    registerCurrentDeviceToken.mockReset();
    unregisterCurrentDeviceToken.mockReset();
    notificationsEnabled.mockReturnValue(true);
    userId.mockReturnValue("user-a");
    requestPermissions.mockResolvedValue({ receive: "granted" });
    addListener.mockResolvedValue({ remove: () => undefined });
    register.mockResolvedValue(undefined);
  });

  it("skips Android FCM register when VITE_ANDROID_FCM_ENABLED is not true (no Firebase crash)", async () => {
    isNativePlatform.mockReturnValue(true);
    getPlatform.mockReturnValue("android");
    vi.stubEnv("VITE_ANDROID_FCM_ENABLED", "");
    const { registerPushToken, resetPushRegisterForTests } = await import("./pushRegister");
    resetPushRegisterForTests();
    await registerPushToken();
    expect(requestPermissions).not.toHaveBeenCalled();
    expect(register).not.toHaveBeenCalled();
  });

  it("registers Android FCM when VITE_ANDROID_FCM_ENABLED=true", async () => {
    isNativePlatform.mockReturnValue(true);
    getPlatform.mockReturnValue("android");
    vi.stubEnv("VITE_ANDROID_FCM_ENABLED", "true");
    const { registerPushToken, resetPushRegisterForTests } = await import("./pushRegister");
    resetPushRegisterForTests();
    await registerPushToken();
    expect(requestPermissions).toHaveBeenCalledTimes(1);
    expect(register).toHaveBeenCalledTimes(1);
    expect(addListener).toHaveBeenCalled();
  });

  it("registers iOS APNs through Capacitor PushNotifications", async () => {
    isNativePlatform.mockReturnValue(true);
    getPlatform.mockReturnValue("ios");
    const { registerPushToken, resetPushRegisterForTests } = await import("./pushRegister");
    resetPushRegisterForTests();
    await registerPushToken();
    expect(requestPermissions).toHaveBeenCalledTimes(1);
    expect(register).toHaveBeenCalledTimes(1);
  });

  it("does not request permission when the local preference is off", async () => {
    isNativePlatform.mockReturnValue(true);
    getPlatform.mockReturnValue("ios");
    notificationsEnabled.mockReturnValue(false);
    const { registerPushToken, resetPushRegisterForTests } = await import("./pushRegister");
    resetPushRegisterForTests();
    await registerPushToken();
    expect(requestPermissions).not.toHaveBeenCalled();
    expect(register).not.toHaveBeenCalled();
  });

  it("does not register a fake token when permission is denied", async () => {
    isNativePlatform.mockReturnValue(true);
    getPlatform.mockReturnValue("android");
    vi.stubEnv("VITE_ANDROID_FCM_ENABLED", "true");
    requestPermissions.mockResolvedValue({ receive: "denied" });
    const { registerPushToken, resetPushRegisterForTests } = await import("./pushRegister");
    resetPushRegisterForTests();
    await registerPushToken();
    expect(register).not.toHaveBeenCalled();
  });

  it("unregisters the current platform token on disable", async () => {
    isNativePlatform.mockReturnValue(true);
    getPlatform.mockReturnValue("android");
    const { unregisterPushToken } = await import("./pushRegister");
    await unregisterPushToken();
    expect(unregisterCurrentDeviceToken).toHaveBeenCalledTimes(1);
  });

  it("no-ops unregister on web", async () => {
    isNativePlatform.mockReturnValue(false);
    getPlatform.mockReturnValue("web");
    const { unregisterPushToken } = await import("./pushRegister");
    await unregisterPushToken();
    expect(unregisterCurrentDeviceToken).not.toHaveBeenCalled();
  });
});
