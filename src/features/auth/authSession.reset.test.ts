import { beforeEach, describe, expect, it, vi } from "vitest";
import { authResetPassword } from "./authSession";

vi.mock("@/lib/apiClient", () => ({
  apiRequest: vi.fn(),
}));

import { apiRequest } from "@/lib/apiClient";

const apiRequestMock = vi.mocked(apiRequest);

describe("authResetPassword", () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
  });

  it("does not call the API when the token is missing", async () => {
    const result = await authResetPassword("   ", "password12");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("Invalid or missing reset link. Please request a new password reset.");
    expect(apiRequestMock).not.toHaveBeenCalled();
  });

  it("does not call the API when the password is too short", async () => {
    const result = await authResetPassword("fresh-reset-token-value", "short");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("Password must be at least 8 characters.");
    expect(apiRequestMock).not.toHaveBeenCalled();
  });

  it("posts password then token in the body, never in the URL", async () => {
    apiRequestMock.mockResolvedValue({ data: { ok: true }, error: null });
    const result = await authResetPassword("  fresh-reset-token-value  ", "password12");
    expect(result.ok).toBe(true);
    expect(apiRequestMock).toHaveBeenCalledWith("/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ password: "password12", token: "fresh-reset-token-value" }),
    });
    expect(apiRequestMock.mock.calls[0]?.[0]).not.toContain("fresh-reset-token-value");
    expect(apiRequestMock.mock.calls[0]?.[0]).not.toContain("password12");
  });

  it("uses the OLD fallback when the API error has no message", async () => {
    apiRequestMock.mockResolvedValue({
      data: null,
      error: { message: "", status: 500 },
    });
    const result = await authResetPassword("fresh-reset-token-value", "password12");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("Password reset is not available at this time.");
  });

  it("does not treat a network failure as a completed reset", async () => {
    apiRequestMock.mockResolvedValue({
      data: null,
      error: { message: "Network error", status: 0 },
    });
    const result = await authResetPassword("fresh-reset-token-value", "password12");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("Network error");
  });
});
