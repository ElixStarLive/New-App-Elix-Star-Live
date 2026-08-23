import { beforeEach, describe, expect, it, vi } from "vitest";
import { authGetMe, authLoginWithPassword, displayLoginError } from "./authSession";

vi.mock("@/lib/apiClient", () => ({
  apiRequest: vi.fn(),
}));

import { apiRequest } from "@/lib/apiClient";

const apiRequestMock = vi.mocked(apiRequest);

const productionLoginBody = {
  user: {
    id: "00000000-0000-4000-8000-000000000001",
    email: "andrei@example.com",
    user_metadata: { username: "andrei", full_name: "Andrei", avatar_url: "" },
    email_confirmed_at: "2026-08-01T00:00:00.000Z",
    created_at: "2026-08-01T00:00:00.000Z",
  },
  session: { access_token: "prod-tok", accessToken: "prod-tok" },
  profile_meta: {
    is_admin: false,
    is_creator: false,
    banned_until: null,
    starter_coin_balance: 50000,
    total_xp: 0,
    level: 0,
  },
};

describe("authLoginWithPassword", () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
  });

  it("sends email (username allowed) and password, never totp", async () => {
    apiRequestMock.mockResolvedValue({
      data: productionLoginBody,
      error: null,
    });
    const result = await authLoginWithPassword("andrei", "secret-password");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.token).toBe("prod-tok");
      expect(result.user.username).toBe("andrei");
      expect(result.user.displayName).toBe("Andrei");
      expect(result.user.email).toBe("andrei@example.com");
      expect(result.user.emailConfirmed).toBe(true);
    }
    expect(apiRequestMock).toHaveBeenCalledWith("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "andrei", password: "secret-password" }),
    });
    expect(String(apiRequestMock.mock.calls[0]?.[1]?.body)).not.toContain("totp");
  });

  it("returns the server error for wrong credentials", async () => {
    apiRequestMock.mockResolvedValue({
      data: null,
      error: { message: "Invalid login credentials.", status: 401, code: "invalid_credentials" },
    });
    const result = await authLoginWithPassword("andrei", "wrong");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Invalid login credentials.");
    }
  });

  it("does not treat empty fields as success", async () => {
    const result = await authLoginWithPassword("", "");
    expect(result.ok).toBe(false);
    expect(apiRequestMock).not.toHaveBeenCalled();
  });

  it("accepts the production session.access_token body", async () => {
    apiRequestMock.mockResolvedValue({
      data: productionLoginBody,
      error: null,
    });
    const result = await authLoginWithPassword("andrei@example.com", "secret-password");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.token).toBe("prod-tok");
    }
  });

  it("rejects a { token, user } login body", async () => {
    apiRequestMock.mockResolvedValue({
      data: {
        token: "tok",
        user: {
          id: "00000000-0000-4000-8000-000000000001",
          username: "andrei",
          displayName: "Andrei",
          avatarUrl: null,
          bio: "",
          isVerified: false,
          followerCount: 0,
          followingCount: 0,
          email: "andrei@example.com",
          isAdmin: false,
          emailConfirmed: true,
        },
      },
      error: null,
    });
    const result = await authLoginWithPassword("andrei@example.com", "secret-password");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Invalid login response from server.");
    }
  });

  it("does not treat a network failure as success", async () => {
    apiRequestMock.mockResolvedValue({
      data: null,
      error: { message: "Network error", status: 0 },
    });
    const result = await authLoginWithPassword("andrei", "secret-password");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Network error");
    }
  });
});

describe("displayLoginError", () => {
  it("maps invalid credentials to the login copy", () => {
    expect(displayLoginError("Invalid login credentials.")).toBe(
      "Incorrect email/username or password.",
    );
  });

  it("maps confirm-email failures to the login copy", () => {
    expect(
      displayLoginError("Please confirm your email before logging in. Check your inbox or request a new confirmation email."),
    ).toBe("Please verify your email address before logging in.");
  });

  it("passes through suspended and other server failures", () => {
    expect(displayLoginError("Account suspended.")).toBe("Account suspended.");
  });

  it("maps network failures to the login copy", () => {
    expect(displayLoginError("Network error")).toBe("Cannot reach backend. Try again later.");
    expect(displayLoginError("Failed to fetch")).toBe("Cannot reach backend. Try again later.");
    expect(displayLoginError("Request timed out")).toBe("Cannot reach backend. Try again later.");
  });
});

describe("authGetMe", () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
  });

  it("accepts the production login/me body and returns the session token", async () => {
    apiRequestMock.mockResolvedValue({
      data: productionLoginBody,
      error: null,
    });
    const result = await authGetMe();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.token).toBe("prod-tok");
      expect(result.user.username).toBe("andrei");
      expect(result.user.isAdmin).toBe(false);
    }
    expect(apiRequestMock).toHaveBeenCalledWith("/api/auth/me");
  });

  it("rejects a bare { user } session body", async () => {
    apiRequestMock.mockResolvedValue({
      data: {
        user: {
          id: "00000000-0000-4000-8000-000000000001",
          username: "andrei",
          displayName: "Andrei",
          avatarUrl: null,
          bio: "",
          isVerified: false,
          followerCount: 0,
          followingCount: 0,
          email: "andrei@example.com",
          isAdmin: false,
          emailConfirmed: true,
        },
      },
      error: null,
    });
    const result = await authGetMe();
    expect(result.ok).toBe(false);
  });
});
