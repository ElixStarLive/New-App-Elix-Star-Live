import { describe, expect, it, vi } from "vitest";

vi.mock("@capacitor/app", () => ({
  App: {
    addListener: vi.fn(async () => ({ remove: async () => undefined })),
    minimizeApp: vi.fn(async () => undefined),
  },
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => false },
}));

describe("PAGE-006 deepLinks", () => {
  it("exports useDeepLinks owner", async () => {
    const mod = await import("./deepLinks");
    expect(typeof mod.useDeepLinks).toBe("function");
  });
});
