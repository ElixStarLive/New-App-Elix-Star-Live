import { beforeEach, describe, expect, it, vi } from "vitest";
import { authDeleteAccount, authLogout } from "./authSession";

vi.mock("@/lib/apiClient", () => ({
  apiRequest: vi.fn(),
}));

import { apiRequest } from "@/lib/apiClient";

const apiRequestMock = vi.mocked(apiRequest);

describe("PAGE-040 auth logout and delete", () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
  });

  it("posts logout to /api/auth/logout", async () => {
    apiRequestMock.mockResolvedValue({ data: { ok: true }, error: null });
    await expect(authLogout()).resolves.toEqual({ ok: true });
    expect(apiRequestMock).toHaveBeenCalledWith("/api/auth/logout", { method: "POST" });
  });

  it("returns the server logout error", async () => {
    apiRequestMock.mockResolvedValue({
      data: null,
      error: { message: "Network offline", status: 0, code: "network" },
    });
    await expect(authLogout()).resolves.toEqual({ ok: false, error: "Network offline" });
  });

  it("posts delete to /api/auth/delete without a target user id", async () => {
    apiRequestMock.mockResolvedValue({ data: { ok: true }, error: null });
    await expect(authDeleteAccount()).resolves.toEqual({ ok: true });
    expect(apiRequestMock).toHaveBeenCalledWith("/api/auth/delete", { method: "POST" });
    expect(apiRequestMock.mock.calls[0]?.[1]).not.toHaveProperty("body");
  });

  it("returns the server delete error", async () => {
    apiRequestMock.mockResolvedValue({
      data: null,
      error: { message: "Session expired", status: 401, code: "unauthenticated" },
    });
    await expect(authDeleteAccount()).resolves.toEqual({ ok: false, error: "Session expired" });
  });
});
