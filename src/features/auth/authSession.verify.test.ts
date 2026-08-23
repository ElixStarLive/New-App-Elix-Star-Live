import { beforeEach, describe, expect, it, vi } from "vitest";
import { authVerifyEmail } from "./authSession";

vi.mock("@/lib/apiClient", () => ({
  apiRequest: vi.fn(),
}));

import { apiRequest } from "@/lib/apiClient";

const apiRequestMock = vi.mocked(apiRequest);

const loginBody = {
  user: {
    id: "11111111-1111-4111-8111-111111111111",
    email: "verify@example.com",
    user_metadata: { username: "verify", full_name: "Verify", avatar_url: "" },
    email_confirmed_at: "2026-08-23T00:00:00.000Z",
    created_at: "2026-08-23T00:00:00.000Z",
  },
  session: { access_token: "access-token-value", accessToken: "access-token-value" },
  profile_meta: {
    is_admin: false,
    is_creator: false,
    banned_until: null,
    starter_coin_balance: 0,
    total_xp: 0,
    level: 0,
  },
  already_confirmed: false,
};

describe("authVerifyEmail", () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
  });

  it("does not call the API when the token is missing", async () => {
    const result = await authVerifyEmail("   ");
    expect(result.ok).toBe(false);
    expect(apiRequestMock).not.toHaveBeenCalled();
  });

  it("posts the token in the body and returns a session (frozen OLD)", async () => {
    apiRequestMock.mockResolvedValue({
      data: loginBody,
      error: null,
    });
    const result = await authVerifyEmail("verify-token-value");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.kind).toBe("session");
      expect(result.accessToken).toBe("access-token-value");
      expect(result.alreadyConfirmed).toBe(false);
    }
    expect(apiRequestMock).toHaveBeenCalledWith("/api/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ token: "verify-token-value" }),
    });
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
