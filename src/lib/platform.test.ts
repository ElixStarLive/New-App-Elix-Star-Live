// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getPlatform, browserOpen, nativeShare } = vi.hoisted(() => ({
  getPlatform: vi.fn(() => "web"),
  browserOpen: vi.fn(async () => undefined),
  nativeShare: vi.fn(async () => undefined),
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: { getPlatform, isNativePlatform: () => getPlatform() !== "web" },
}));

vi.mock("@capacitor/browser", () => ({ Browser: { open: browserOpen } }));
vi.mock("@capacitor/share", () => ({ Share: { share: nativeShare } }));

type PlatformModule = typeof import("./platform");

async function loadPlatform(name: "web" | "ios" | "android"): Promise<PlatformModule> {
  getPlatform.mockReturnValue(name);
  vi.resetModules();
  return import("./platform");
}

describe("platform flags and payment method", () => {
  it("describes the web runtime", async () => {
    const { platform, getPaymentMethod } = await loadPlatform("web");
    expect(platform).toMatchObject({ isNative: false, isIOS: false, isAndroid: false, isWeb: true, name: "web" });
    expect(getPaymentMethod()).toBe("web");
  });

  it("uses Apple IAP on iOS and Google Play on Android", async () => {
    const ios = await loadPlatform("ios");
    expect(ios.platform).toMatchObject({ isNative: true, isIOS: true, isWeb: false });
    expect(ios.getPaymentMethod()).toBe("apple-iap");

    const android = await loadPlatform("android");
    expect(android.platform).toMatchObject({ isNative: true, isAndroid: true });
    expect(android.getPaymentMethod()).toBe("google-play");
  });
});

describe("openExternalLink", () => {
  const open = vi.fn();

  beforeEach(() => {
    open.mockReset();
    vi.spyOn(window, "open").mockImplementation(open);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("opens a new noopener tab on the web", async () => {
    const { openExternalLink } = await loadPlatform("web");
    openExternalLink("https://example.com");
    expect(open).toHaveBeenCalledWith("https://example.com", "_blank", "noopener");
  });

  it("hands the url to the system browser on native", async () => {
    const { openExternalLink } = await loadPlatform("ios");
    openExternalLink("https://example.com");
    expect(open).toHaveBeenCalledWith("https://example.com", "_system");
  });
});

describe("openStripeHostedUrl", () => {
  const open = vi.fn();

  beforeEach(() => {
    open.mockReset();
    browserOpen.mockClear();
    vi.spyOn(window, "open").mockImplementation(open);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects anything that is not https", async () => {
    const { openStripeHostedUrl } = await loadPlatform("web");
    await expect(openStripeHostedUrl("http://checkout.stripe.com/x")).rejects.toThrow("Invalid Stripe URL");
    await expect(openStripeHostedUrl("javascript:alert(1)")).rejects.toThrow("Invalid Stripe URL");
    await expect(openStripeHostedUrl("")).rejects.toThrow("Invalid Stripe URL");
    expect(open).not.toHaveBeenCalled();
  });

  it("opens an https checkout url in a web tab", async () => {
    const { openStripeCheckoutUrl } = await loadPlatform("web");
    await openStripeCheckoutUrl(" https://checkout.stripe.com/pay/x ");
    expect(open).toHaveBeenCalledWith("https://checkout.stripe.com/pay/x", "_blank", "noopener");
    expect(browserOpen).not.toHaveBeenCalled();
  });

  it("uses the in-app browser on native", async () => {
    const { openStripeHostedUrl } = await loadPlatform("android");
    await openStripeHostedUrl("https://checkout.stripe.com/pay/x");
    expect(browserOpen).toHaveBeenCalledWith({ url: "https://checkout.stripe.com/pay/x" });
    expect(open).not.toHaveBeenCalled();
  });
});

describe("nativeShareMedia", () => {
  const share = vi.fn<(data?: ShareData) => Promise<void>>();
  const canShare = vi.fn(() => true);
  const writeText = vi.fn(async () => undefined);

  function stubNavigator(overrides: Record<string, unknown>): void {
    vi.stubGlobal("navigator", { ...overrides });
  }

  beforeEach(() => {
    share.mockReset().mockResolvedValue(undefined);
    canShare.mockReset().mockReturnValue(true);
    writeText.mockReset().mockResolvedValue(undefined);
    nativeShare.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shares a file through the Web Share API when it is supported", async () => {
    stubNavigator({ share, canShare, clipboard: { writeText } });
    const { nativeShareMedia } = await loadPlatform("web");
    await expect(
      nativeShareMedia({ blob: new Blob(["x"], { type: "image/jpeg" }), title: "Clip", text: "Watch" }),
    ).resolves.toBe("shared");
    const data = share.mock.calls[0]?.[0];
    expect(data?.files?.[0]?.name).toBe("elixstar.jpg");
    expect(data?.title).toBe("Clip");
  });

  it("names a non-image blob as a webm recording", async () => {
    stubNavigator({ share, canShare, clipboard: { writeText } });
    const { nativeShareMedia } = await loadPlatform("web");
    await nativeShareMedia({ blob: new Blob(["x"], { type: "video/webm" }) });
    expect(share.mock.calls[0]?.[0]?.files?.[0]?.name).toBe("elixstar.webm");
  });

  it("reports a cancelled share when the user aborts", async () => {
    share.mockRejectedValue(new DOMException("cancelled", "AbortError"));
    stubNavigator({ share, canShare, clipboard: { writeText } });
    const { nativeShareMedia } = await loadPlatform("web");
    await expect(nativeShareMedia({ blob: new Blob(["x"], { type: "image/png" }) })).resolves.toBe("cancelled");
    expect(writeText).not.toHaveBeenCalled();
  });

  it("shares a url when there is no blob", async () => {
    stubNavigator({ share, clipboard: { writeText } });
    const { nativeShareMedia } = await loadPlatform("web");
    await expect(nativeShareMedia({ url: "https://example.com/v/1" })).resolves.toBe("shared");
    expect(share).toHaveBeenCalledWith({
      title: "Elix Star Live",
      text: "Made with Elix Star Live",
      url: "https://example.com/v/1",
    });
  });

  it("falls back to the url share when the file cannot be shared", async () => {
    canShare.mockReturnValue(false);
    stubNavigator({ share, canShare, clipboard: { writeText } });
    const { nativeShareMedia } = await loadPlatform("web");
    await expect(nativeShareMedia({ blob: new Blob(["x"], { type: "image/png" }) })).resolves.toBe("shared");
    expect(share.mock.calls[0]?.[0]).not.toHaveProperty("files");
  });

  it("uses the Capacitor share sheet on native", async () => {
    stubNavigator({ clipboard: { writeText } });
    const { nativeShareMedia } = await loadPlatform("ios");
    await expect(nativeShareMedia({ url: "https://example.com" })).resolves.toBe("shared");
    expect(nativeShare).toHaveBeenCalledWith({
      title: "Elix Star Live",
      text: "Made with Elix Star Live",
      url: "https://example.com",
      dialogTitle: "Elix Star Live",
    });
  });

  it("reports a cancelled native share sheet", async () => {
    nativeShare.mockRejectedValueOnce(new Error("Share canceled"));
    stubNavigator({ clipboard: { writeText } });
    const { nativeShareMedia } = await loadPlatform("ios");
    await expect(nativeShareMedia({ url: "https://example.com" })).resolves.toBe("cancelled");
  });

  it("copies the url when sharing is unavailable", async () => {
    stubNavigator({ clipboard: { writeText } });
    const { nativeShareMedia } = await loadPlatform("web");
    await expect(nativeShareMedia({ url: "https://example.com/v/2" })).resolves.toBe("copied");
    expect(writeText).toHaveBeenCalledWith("https://example.com/v/2");
  });

  it("reports unavailable when neither sharing nor the clipboard work", async () => {
    stubNavigator({ clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } });
    const { nativeShareMedia } = await loadPlatform("web");
    await expect(nativeShareMedia({ url: "https://example.com" })).resolves.toBe("unavailable");

    stubNavigator({});
    await expect(nativeShareMedia({ url: "https://example.com" })).resolves.toBe("unavailable");
  });
});

describe("nativeShareUrl", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is true when the url was shared or copied and false otherwise", async () => {
    const share = vi.fn<(data?: ShareData) => Promise<void>>().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { share });
    const { nativeShareUrl } = await loadPlatform("web");
    await expect(nativeShareUrl({ url: "https://example.com" })).resolves.toBe(true);

    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn(async () => undefined) } });
    await expect(nativeShareUrl({ url: "https://example.com" })).resolves.toBe(true);

    vi.stubGlobal("navigator", {});
    await expect(nativeShareUrl({ url: "https://example.com" })).resolves.toBe(false);
  });
});
