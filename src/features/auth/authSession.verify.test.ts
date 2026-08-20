import { beforeEach, describe, expect, it, vi } from "vitest";
import { authVerifyEmail } from "./authSession";

vi.mock("@/lib/apiClient", () => ({
  apiRequest: vi.fn(),
}));

import { apiRequest } from "@/lib/apiClient";

const apiRequestMock = vi.mocked(apiRequest);

describe("authVerifyEmail", () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
  });

  it("does not call the API when the token is missing", async () => {
    const result = await authVerifyEmail("   ");
    expect(result.ok).toBe(false);
    expect(apiRequestMock).not.toHaveBeenCalled();
  });

  it("posts the token in the body, never in the URL", async () => {
    apiRequestMock.mockResolvedValue({
      data: { ok: true, alreadyConfirmed: false },
      error: null,
    });
    const result = await authVerifyEmail("verify-token-value");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.alreadyConfirmed).toBe(false);
    expect(apiRequestMock).toHaveBeenCalledWith("/api/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ token: "verify-token-value" }),
    });
    expect(apiRequestMock.mock.calls[0]?.[0]).not.toContain("verify-token-value");
  });

  it("does not treat a network failure as verified", async () => {
    apiRequestMock.mockResolvedValue({
      data: null,
      error: { message: "Network error", status: 0 },
    });
    const result = await authVerifyEmail("verify-token-value");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("Network error");
  });
});
