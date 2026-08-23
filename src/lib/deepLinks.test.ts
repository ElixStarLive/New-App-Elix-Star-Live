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

  it("routes custom-scheme and https live/video/user links", async () => {
    const { navigateFromDeepLinkUrl } = await import("./deepLinks");
    const navigate = vi.fn();

    navigateFromDeepLinkUrl("elixstar://video/vid-1", navigate);
    expect(navigate).toHaveBeenLastCalledWith("/video/vid-1");

    navigateFromDeepLinkUrl("elixstar:///video/vid-1", navigate);
    expect(navigate).toHaveBeenLastCalledWith("/video/vid-1");

    navigateFromDeepLinkUrl("elixstar://user/user-1", navigate);
    expect(navigate).toHaveBeenLastCalledWith("/profile/user-1");

    navigateFromDeepLinkUrl("elixstar://live/host-1", navigate);
    expect(navigate).toHaveBeenLastCalledWith("/live/host-1");

    navigateFromDeepLinkUrl("https://www.elixstarlive.co.uk/watch/host-1", navigate);
    expect(navigate).toHaveBeenLastCalledWith("/watch/host-1");

    navigateFromDeepLinkUrl("https://elixstarlive.co.uk/hashtag/music", navigate);
    expect(navigate).toHaveBeenLastCalledWith("/hashtag/music");
  });

  it("opens Rising Stars hub without a challenge id", async () => {
    const { navigateFromDeepLinkUrl } = await import("./deepLinks");
    const navigate = vi.fn();

    navigateFromDeepLinkUrl("elixstar://rising-stars", navigate);
    expect(navigate).toHaveBeenLastCalledWith("/rising-stars");

    navigateFromDeepLinkUrl("elixstar://risingstars/ch-9", navigate);
    expect(navigate).toHaveBeenLastCalledWith("/rising-stars/challenge/ch-9");

    navigateFromDeepLinkUrl("https://www.elixstarlive.co.uk/rising-stars", navigate);
    expect(navigate).toHaveBeenLastCalledWith("/rising-stars");

    navigateFromDeepLinkUrl("https://www.elixstarlive.co.uk/rising-stars/challenge/ch-9", navigate);
    expect(navigate).toHaveBeenLastCalledWith("/rising-stars/challenge/ch-9");
  });

  it("falls through unknown custom schemes to For You", async () => {
    const { navigateFromDeepLinkUrl } = await import("./deepLinks");
    const navigate = vi.fn();
    navigateFromDeepLinkUrl("elixstar://unknown", navigate);
    expect(navigate).toHaveBeenLastCalledWith("/feed");
    navigateFromDeepLinkUrl("not-a-url", navigate);
    expect(navigate).toHaveBeenLastCalledWith("/feed");
  });
});
