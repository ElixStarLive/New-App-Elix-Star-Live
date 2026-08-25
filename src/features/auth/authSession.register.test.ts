import { beforeEach, describe, expect, it, vi } from "vitest";
import { authRegister } from "./authSession";

vi.mock("@/lib/apiClient", () => ({
  apiRequest: vi.fn(),
}));

import { apiRequest } from "@/lib/apiClient";

const apiRequestMock = vi.mocked(apiRequest);

const sessionUser = {
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
};

describe("authRegister", () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
  });

  it("posts consent-attested register body and never puts the password in the URL", async () => {
    apiRequestMock.mockResolvedValue({
      data: {
        user: {
          id: sessionUser.id,
          email: sessionUser.email,
          user_metadata: { username: "andrei", full_name: "Andrei", avatar_url: "" },
          email_confirmed_at: "2026-08-01T00:00:00.000Z",
          created_at: "2026-08-01T00:00:00.000Z",
        },
        session: { access_token: "tok" },
        profile_meta: {
          is_admin: false,
          is_creator: false,
          banned_until: null,
          starter_coin_balance: 50000,
          total_xp: 0,
          level: 0,
        },
        needsEmailConfirmation: false,
        confirmation_email_sent: false,
        welcome_message: "Welcome! You received 50,000 Starter Coins to explore gifts and support creators.",
      },
      error: null,
    });
    const result = await authRegister({
      email: "andrei@example.com",
      password: "secret-password",
      username: "andrei",
      ageConfirmed13Plus: true,
      consentVersion: "2026-07-21",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.token).toBe("tok");
      expect(result.welcomeMessage).toContain("50,000");
    }
    expect(apiRequestMock).toHaveBeenCalledWith("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({
        email: "andrei@example.com",
        password: "secret-password",
        username: "andrei",
        displayName: "andrei",
        ageConfirmed13Plus: true,
        consentVersion: "2026-07-21",
      }),
    });
    expect(apiRequestMock.mock.calls[0]?.[0]).not.toContain("password");
  });

  it("does not treat confirmation-required as an authenticated session", async () => {
    apiRequestMock.mockResolvedValue({
      data: {
        user: {
          id: sessionUser.id,
          email: sessionUser.email,
          user_metadata: { username: "andrei", full_name: "Andrei", avatar_url: "" },
          email_confirmed_at: "",
          created_at: "2026-08-01T00:00:00.000Z",
        },
        session: null,
        needsEmailConfirmation: true,
        confirmation_email_sent: true,
        welcome_message: "Check your email to confirm your account before signing in.",
      },
      error: null,
    });
    const result = await authRegister({
      email: "andrei@example.com",
      password: "secret-password",
      ageConfirmed13Plus: true,
      consentVersion: "2026-07-21",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.token).toBeNull();
      expect(result.needsEmailConfirmation).toBe(true);
      expect(result.confirmationEmailSent).toBe(true);
    }
  });

  it("surfaces network failure without faking success", async () => {
    apiRequestMock.mockResolvedValue({
      data: null,
      error: { message: "Network error", status: 0 },
    });
    const result = await authRegister({
      email: "andrei@example.com",
      password: "secret-password",
      ageConfirmed13Plus: true,
      consentVersion: "2026-07-21",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Network error");
    }
  });

  it("rejects a { token, user } register body instead of mapping it", async () => {
    apiRequestMock.mockResolvedValue({
      data: {
        token: "tok",
        user: sessionUser,
        needsEmailConfirmation: false,
        confirmationEmailSent: false,
        welcomeMessage: "Welcome! You received 50,000 Starter Coins to explore gifts and support creators.",
      },
      error: null,
    });
    const result = await authRegister({
      email: "andrei@example.com",
      password: "secret-password",
      ageConfirmed13Plus: true,
      consentVersion: "2026-07-21",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Invalid registration response from server.");
    }
  });
});
