import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiDownloadVoiceOnlyVideo } from "./feedApi";

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

vi.mock("@/store/useAuthStore", () => ({
  useAuthStore: {
    getState: () => ({ user: { id: "37c3c371-b5c2-4e50-908f-8a7225ba7ba2" } }),
  },
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => true },
}));

describe("apiDownloadVoiceOnlyVideo", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("GETs /api/videos/:id/download, never the raw media URL", async () => {
    const blob = new Blob([new Uint8Array([0, 1, 2])], { type: "video/mp4" });
    const fetchMock = vi.fn(async () =>
      new Response(blob, {
        status: 200,
        headers: {
          "Content-Type": "video/mp4",
          "Content-Disposition": 'attachment; filename="video_vid.mp4"',
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const result = await apiDownloadVoiceOnlyVideo("22222222-2222-4222-8222-222222222222");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.filename).toBe("video_vid.mp4");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://www.elixstarlive.co.uk/api/videos/22222222-2222-4222-8222-222222222222/download",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({ Authorization: "Bearer test-token" }),
      }),
    );
  });
});
