import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "@/lib/apiClient";
import { apiListBlockedUsers, apiUnblockUser, isBlockedUsersSessionFailure } from "./blockedUsersApi";

vi.mock("@/lib/apiClient", () => ({
  apiRequest: vi.fn(),
}));

const request = vi.mocked(apiRequest);
const targetId = "22222222-2222-4222-8222-222222222222";

describe("PAGE-044 blocked-users API", () => {
  beforeEach(() => {
    request.mockReset();
  });

  it("treats only unauthenticated session codes as expiry", () => {
    expect(isBlockedUsersSessionFailure(401, "unauthenticated")).toBe(true);
    expect(isBlockedUsersSessionFailure(401, "session_expired")).toBe(true);
    expect(isBlockedUsersSessionFailure(401, "invalid_credentials")).toBe(false);
    expect(isBlockedUsersSessionFailure(0, undefined)).toBe(false);
  });

  it("reads GET /api/blocked-users from the data array only", async () => {
    request.mockResolvedValueOnce({
      data: {
        data: [
          {
            blocked_user_id: targetId,
            username: "maya",
            display_name: "Maya",
            avatar_url: "https://cdn.example/m.png",
            created_at: "2026-08-21T00:00:00.000Z",
          },
        ],
      },
      error: null,
    });
    await expect(apiListBlockedUsers()).resolves.toEqual({
      ok: true,
      rows: [
        {
          blocked_user_id: targetId,
          username: "maya",
          display_name: "Maya",
          avatar_url: "https://cdn.example/m.png",
          created_at: "2026-08-21T00:00:00.000Z",
        },
      ],
    });
    expect(request).toHaveBeenCalledWith("/api/blocked-users");
  });

  it("does not convert a failed list into an empty success", async () => {
    request.mockResolvedValueOnce({
      data: null,
      error: { message: "offline", status: 0 },
    });
    await expect(apiListBlockedUsers()).resolves.toEqual({
      ok: false,
      error: "offline",
      sessionExpired: false,
    });

    request.mockResolvedValueOnce({ data: { users: [] }, error: null });
    await expect(apiListBlockedUsers()).resolves.toEqual({
      ok: false,
      error: "Failed to load blocked users",
      sessionExpired: false,
    });
  });

  it("posts only the target id to POST /api/unblock-user", async () => {
    request.mockResolvedValueOnce({ data: { success: true }, error: null });
    await expect(apiUnblockUser(targetId)).resolves.toEqual({ ok: true });
    expect(request).toHaveBeenCalledWith("/api/unblock-user", {
      method: "POST",
      body: JSON.stringify({ blockedUserId: targetId }),
    });

    request.mockResolvedValueOnce({
      data: null,
      error: { message: "Failed to unblock user", status: 500 },
    });
    await expect(apiUnblockUser(targetId)).resolves.toEqual({
      ok: false,
      error: "Failed to unblock user",
      sessionExpired: false,
    });
  });
});
