import { beforeEach, describe, expect, it, vi } from "vitest";
import { authForgotPassword } from "./authSession";

vi.mock("@/lib/apiClient", () => ({
  apiRequest: vi.fn(),
}));

import { apiRequest } from "@/lib/apiClient";

const apiRequestMock = vi.mocked(apiRequest);

describe("authForgotPassword", () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
  });

  it("does not call the API when the email is empty", async () => {
    const result = await authForgotPassword("   ");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("Email is required.");
    expect(apiRequestMock).not.toHaveBeenCalled();
  });

  it("posts the trimmed email and never a token or password", async () => {
    apiRequestMock.mockResolvedValue({ data: { ok: true }, error: null });
    const result = await authForgotPassword("  Andrei@Example.com  ");
    expect(result.ok).toBe(true);
    expect(apiRequestMock).toHaveBeenCalledWith("/api/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email: "Andrei@Example.com" }),
    });
    expect(String(apiRequestMock.mock.calls[0]?.[1]?.body)).not.toContain("token");
    expect(String(apiRequestMock.mock.calls[0]?.[1]?.body)).not.toContain("password");
  });

  it("does not treat a network failure as email sent", async () => {
    apiRequestMock.mockResolvedValue({
      data: null,
      error: { message: "Network error", status: 0 },
    });
    const result = await authForgotPassword("andrei@example.com");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("Network error");
  });

  it("surfaces server rate-limit and mail-not-configured errors", async () => {
    apiRequestMock.mockResolvedValue({
      data: null,
      error: { message: "Too many reset requests. Please try again later.", status: 429, code: "rate_limited" },
    });
    const limited = await authForgotPassword("andrei@example.com");
    expect(limited.ok).toBe(false);
    if (!limited.ok) expect(limited.error).toBe("Too many reset requests. Please try again later.");

    apiRequestMock.mockResolvedValue({
      data: null,
      error: {
        message: "Email service is not configured. Please contact support.",
        status: 501,
        code: "unavailable",
      },
    });
    const noMail = await authForgotPassword("andrei@example.com");
    expect(noMail.ok).toBe(false);
    if (!noMail.ok) expect(noMail.error).toBe("Email service is not configured. Please contact support.");
  });
});
