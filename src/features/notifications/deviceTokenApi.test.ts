import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "@/lib/apiClient";
import { apiDeleteDeviceToken, apiRegisterDeviceToken } from "./deviceTokenApi";

vi.mock("@/lib/apiClient", () => ({
  apiRequest: vi.fn(),
}));

const request = vi.mocked(apiRequest);

describe("PAGE-043 device token API", () => {
  beforeEach(() => {
    request.mockReset();
  });

  it("registers and deletes on /api/device-tokens without a client userId", async () => {
    request.mockResolvedValueOnce({ data: { ok: true }, error: null });
    await expect(apiRegisterDeviceToken("real-device-token", "android")).resolves.toEqual({ ok: true });
    expect(request).toHaveBeenCalledWith("/api/device-tokens", {
      method: "POST",
      body: JSON.stringify({ token: "real-device-token", platform: "android" }),
    });

    request.mockResolvedValueOnce({ data: { ok: true }, error: null });
    await expect(apiDeleteDeviceToken("android")).resolves.toEqual({ ok: true });
    expect(request).toHaveBeenCalledWith("/api/device-tokens", {
      method: "DELETE",
      body: JSON.stringify({ platform: "android" }),
    });
  });

  it("does not treat a failed register or delete as success", async () => {
    request.mockResolvedValueOnce({
      data: null,
      error: { message: "offline", status: 0 },
    });
    await expect(apiRegisterDeviceToken("real-device-token", "ios")).resolves.toEqual({
      ok: false,
      error: "offline",
      sessionExpired: false,
    });

    request.mockResolvedValueOnce({
      data: null,
      error: { message: "Sign in required", status: 401, code: "unauthenticated" },
    });
    await expect(apiDeleteDeviceToken("ios")).resolves.toEqual({
      ok: false,
      error: "Sign in required",
      sessionExpired: true,
    });
  });
});
