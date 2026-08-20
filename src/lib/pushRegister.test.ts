import { beforeEach, describe, expect, it, vi } from "vitest";

const isNativePlatform = vi.fn();
const getPlatform = vi.fn();
const register = vi.fn();
const requestPermissions = vi.fn();
const addListener = vi.fn();

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

describe("registerPushToken", () => {
  beforeEach(() => {
    vi.resetModules();
    isNativePlatform.mockReset();
    getPlatform.mockReset();
    register.mockReset();
    requestPermissions.mockReset();
    addListener.mockReset();
  });

  it("does not register Android push without Firebase", async () => {
    isNativePlatform.mockReturnValue(true);
    getPlatform.mockReturnValue("android");
    const { registerPushToken } = await import("./pushRegister");
    await registerPushToken();
    expect(register).not.toHaveBeenCalled();
    expect(requestPermissions).not.toHaveBeenCalled();
  });
});
