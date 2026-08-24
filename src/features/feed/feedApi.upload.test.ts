import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/apiClient", () => ({
  apiRequest: vi.fn(),
  apiUploadForm: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  apiUrl: (path: string) => `https://www.elixstarlive.co.uk${path}`,
}));

vi.mock("@/lib/sessionToken", () => ({
  getSessionToken: () => "test-token",
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => true },
}));

import { apiRequest } from "@/lib/apiClient";

const apiRequestMock = vi.mocked(apiRequest);

describe("PAGE-007 engagement production contract", () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
  });

  it("unlikes with POST /unlike not DELETE /like", async () => {
    apiRequestMock.mockResolvedValue({ data: { ok: true }, error: null });
    const { apiUnlikeVideo } = await import("./feedApi");
    const result = await apiUnlikeVideo("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(result).toEqual({ ok: true });
    expect(apiRequestMock).toHaveBeenCalledWith(
      "/api/videos/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/unlike",
      { method: "POST" },
    );
  });

  it("unsaves with POST /unsave not DELETE /save", async () => {
    apiRequestMock.mockResolvedValue({ data: { ok: true }, error: null });
    const { apiUnsaveVideo } = await import("./feedApi");
    const result = await apiUnsaveVideo("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(result).toEqual({ ok: true });
    expect(apiRequestMock).toHaveBeenCalledWith(
      "/api/videos/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/unsave",
      { method: "POST" },
    );
  });
});
