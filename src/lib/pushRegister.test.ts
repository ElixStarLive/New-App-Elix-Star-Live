import { beforeEach, describe, expect, it, vi } from "vitest";

const isNativePlatform = vi.fn();
const getPlatform = vi.fn();
const register = vi.fn();
const requestPermissions = vi.fn();
const addListener = vi.fn();
const notificationsEnabled = vi.fn(() => true);
const userId = vi.fn(() => "user-a");

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
  registerCurrentDeviceToken: vi.fn(),
}));

describe("registerPushToken", () => {
  beforeEach(() => {
    vi.resetModules();
    isNativePlatform.mockReset();
    getPlatform.mockReset();
    register.mockReset();
    requestPermissions.mockReset();
    addListener.mockReset();
    notificationsEnabled.mockReturnValue(true);
    userId.mockReturnValue("user-a");
  });

  it("does not register Android push without Firebase", async () => {
    isNativePlatform.mockReturnValue(true);
    getPlatform.mockReturnValue("android");
    const { registerPushToken } = await import("./pushRegister");
    await registerPushToken();
    expect(register).not.toHaveBeenCalled();
    expect(requestPermissions).not.toHaveBeenCalled();
  });

  it("does not request permission when the local preference is off", async () => {
    isNativePlatform.mockReturnValue(true);
    getPlatform.mockReturnValue("ios");
    notificationsEnabled.mockReturnValue(false);
    const { registerPushToken } = await import("./pushRegister");
    await registerPushToken();
    expect(requestPermissions).not.toHaveBeenCalled();
    expect(register).not.toHaveBeenCalled();
  });

  it("does not register a fake token when permission is denied", async () => {
    isNativePlatform.mockReturnValue(true);
    getPlatform.mockReturnValue("ios");
    requestPermissions.mockResolvedValue({ receive: "denied" });
    const { registerPushToken } = await import("./pushRegister");
    await registerPushToken();
    expect(register).not.toHaveBeenCalled();
  });
});
