import { beforeEach, describe, expect, it, vi } from "vitest";
import { authLoginWithPassword } from "./authSession";

vi.mock("@/lib/apiClient", () => ({
  apiRequest: vi.fn(),
}));

import { apiRequest } from "@/lib/apiClient";

const apiRequestMock = vi.mocked(apiRequest);

describe("authLoginWithPassword", () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
  });

  it("sends email (username allowed) and password, never totp", async () => {
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
    const result = await authLoginWithPassword("andrei", "secret-password");
    expect(result.ok).toBe(true);
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

  it("reads production login session.access_token and user_metadata", async () => {
    apiRequestMock.mockResolvedValue({
      data: {
        user: {
          id: "00000000-0000-4000-8000-000000000001",
          email: "andrei@example.com",
          user_metadata: { username: "andrei", full_name: "Andrei", avatar_url: "" },
          email_confirmed_at: "2026-08-01T00:00:00.000Z",
          created_at: "2026-08-01T00:00:00.000Z",
        },
        session: { access_token: "prod-tok", accessToken: "prod-tok" },
      },
      error: null,
    });
    const result = await authLoginWithPassword("andrei@example.com", "secret-password");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.token).toBe("prod-tok");
      expect(result.user.username).toBe("andrei");
      expect(result.user.displayName).toBe("Andrei");
      expect(result.user.emailConfirmed).toBe(true);
    }
  });

  it("accepts production user ids that are not UUIDs", async () => {
    apiRequestMock.mockResolvedValue({
      data: {
        user: {
          id: "elix-user-1",
          email: "andrei@example.com",
          user_metadata: { username: "andrei", full_name: "Andrei", avatar_url: "" },
          email_confirmed_at: "2026-08-01T00:00:00.000Z",
          created_at: "2026-08-01T00:00:00.000Z",
        },
        session: { access_token: "prod-tok" },
        profile_meta: { is_admin: false },
      },
      error: null,
    });
    const result = await authLoginWithPassword("andrei@example.com", "secret-password");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.user.id).toBe("elix-user-1");
      expect(result.token).toBe("prod-tok");
    }
  });

  it("parses a string JSON login body", async () => {
    apiRequestMock.mockResolvedValue({
      data: JSON.stringify({
        user: {
          id: "elix-user-1",
          email: "andrei@example.com",
          user_metadata: { username: "andrei", full_name: "Andrei", avatar_url: "" },
          email_confirmed_at: "2026-08-01T00:00:00.000Z",
        },
        session: { access_token: "prod-tok" },
      }),
      error: null,
    });
    const result = await authLoginWithPassword("andrei@example.com", "secret-password");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.token).toBe("prod-tok");
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
