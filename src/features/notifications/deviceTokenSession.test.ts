import { beforeEach, describe, expect, it, vi } from "vitest";

const isNativePlatform = vi.fn();
const getPlatform = vi.fn();
const apiRegisterDeviceToken = vi.fn();
const apiDeleteDeviceToken = vi.fn();

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => isNativePlatform(),
    getPlatform: () => getPlatform(),
  },
}));

vi.mock("./deviceTokenApi", () => ({
  apiRegisterDeviceToken: (...args: [string, "android" | "ios" | "web"]) => apiRegisterDeviceToken(...args),
  apiDeleteDeviceToken: (platform: "android" | "ios" | "web") => apiDeleteDeviceToken(platform),
}));

describe("PAGE-043 device token session", () => {
  beforeEach(() => {
    vi.resetModules();
    isNativePlatform.mockReset();
    getPlatform.mockReset();
    apiRegisterDeviceToken.mockReset();
    apiDeleteDeviceToken.mockReset();
  });

  it("registers and unregisters the current native platform only", async () => {
    isNativePlatform.mockReturnValue(true);
    getPlatform.mockReturnValue("android");
    apiRegisterDeviceToken.mockResolvedValue({ ok: true });
    apiDeleteDeviceToken.mockResolvedValue({ ok: true });
    const session = await import("./deviceTokenSession");
    session.resetDeviceTokenLocksForTests();
    await expect(session.registerCurrentDeviceToken("token-a")).resolves.toEqual({ ok: true });
    expect(apiRegisterDeviceToken).toHaveBeenCalledWith("token-a", "android");
    await session.unregisterCurrentDeviceToken();
    expect(apiDeleteDeviceToken).toHaveBeenCalledWith("android");
  });

  it("sends one unregister when logout is tapped rapidly", async () => {
    isNativePlatform.mockReturnValue(true);
    getPlatform.mockReturnValue("ios");
    let resolveDelete: ((value: { ok: true }) => void) | undefined;
    apiDeleteDeviceToken.mockImplementation(
      () =>
        new Promise<{ ok: true }>((resolve) => {
          resolveDelete = resolve;
        }),
    );
    const session = await import("./deviceTokenSession");
    session.resetDeviceTokenLocksForTests();
    const first = session.unregisterCurrentDeviceToken();
    const second = session.unregisterCurrentDeviceToken();
    resolveDelete?.({ ok: true });
    await first;
    await second;
    expect(apiDeleteDeviceToken).toHaveBeenCalledTimes(1);
  });

  it("does not invent a web token", async () => {
    isNativePlatform.mockReturnValue(false);
    getPlatform.mockReturnValue("web");
    const session = await import("./deviceTokenSession");
    session.resetDeviceTokenLocksForTests();
    await expect(session.registerCurrentDeviceToken("token-a")).resolves.toEqual({
      ok: false,
      error: "Push token registration is native-only",
      sessionExpired: false,
    });
    await session.unregisterCurrentDeviceToken();
    expect(apiRegisterDeviceToken).not.toHaveBeenCalled();
    expect(apiDeleteDeviceToken).not.toHaveBeenCalled();
  });
});
