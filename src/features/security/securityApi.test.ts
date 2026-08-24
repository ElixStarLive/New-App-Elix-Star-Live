import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "@/lib/apiClient";
import {
  apiDisableTwoFactor,
  apiEnrollTwoFactor,
  apiGetTwoFactorStatus,
  apiVerifyTwoFactor,
  isSecuritySessionFailure,
} from "./securityApi";

vi.mock("@/lib/apiClient", () => ({
  apiRequest: vi.fn(),
}));

const request = vi.mocked(apiRequest);

describe("PAGE-042 security API", () => {
  beforeEach(() => {
    request.mockReset();
  });

  it("treats only unauthenticated session codes as expiry", () => {
    expect(isSecuritySessionFailure(401, "unauthenticated")).toBe(true);
    expect(isSecuritySessionFailure(401, "session_expired")).toBe(true);
    expect(isSecuritySessionFailure(401, "invalid_credentials")).toBe(false);
    expect(isSecuritySessionFailure(401, "requires_2fa")).toBe(false);
    expect(isSecuritySessionFailure(0, undefined)).toBe(false);
  });

  it("reads enabled from GET /api/auth/2fa/status and does not invent disabled", async () => {
    request.mockResolvedValueOnce({ data: { enabled: true }, error: null });
    await expect(apiGetTwoFactorStatus()).resolves.toEqual({ ok: true, enabled: true });
    expect(request).toHaveBeenCalledWith("/api/auth/2fa/status");

    request.mockResolvedValueOnce({ data: { enabled: false, enrolled: true }, error: null });
    await expect(apiGetTwoFactorStatus()).resolves.toEqual({ ok: true, enabled: false });

    request.mockResolvedValueOnce({
      data: null,
      error: { message: "offline", status: 0 },
    });
    await expect(apiGetTwoFactorStatus()).resolves.toEqual({
      ok: false,
      error: "offline",
      sessionExpired: false,
    });

    request.mockResolvedValueOnce({ data: { enrolled: true }, error: null });
    await expect(apiGetTwoFactorStatus()).resolves.toEqual({
      ok: false,
      error: "Could not load 2FA status",
      sessionExpired: false,
    });
  });

  it("starts enrollment and keeps only the server secret", async () => {
    request.mockResolvedValueOnce({ data: { secret: "server-secret-value" }, error: null });
    await expect(apiEnrollTwoFactor()).resolves.toEqual({ ok: true, secret: "server-secret-value" });
    expect(request).toHaveBeenCalledWith("/api/auth/2fa/enroll", { method: "POST", body: "{}" });
  });

  it("requires server-enabled after verify and server-disabled after disable", async () => {
    request.mockResolvedValueOnce({ data: { ok: true, enabled: true }, error: null });
    await expect(apiVerifyTwoFactor("123456")).resolves.toEqual({ ok: true, enabled: true });
    expect(request).toHaveBeenCalledWith("/api/auth/2fa/verify", {
      method: "POST",
      body: JSON.stringify({ code: "123456" }),
    });

    request.mockResolvedValueOnce({ data: { ok: true }, error: null });
    await expect(apiVerifyTwoFactor("123456")).resolves.toEqual({
      ok: false,
      error: "Invalid code — 2FA was not enabled",
      sessionExpired: false,
    });

    request.mockResolvedValueOnce({ data: { ok: true, enabled: false }, error: null });
    await expect(apiDisableTwoFactor("654321")).resolves.toEqual({ ok: true, enabled: false });

    request.mockResolvedValueOnce({
      data: null,
      error: { message: "Invalid authenticator code", status: 401, code: "invalid_credentials" },
    });
    await expect(apiDisableTwoFactor("000000")).resolves.toEqual({
      ok: false,
      error: "Invalid authenticator code",
      sessionExpired: false,
    });
  });
});
