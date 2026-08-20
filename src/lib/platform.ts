import { Capacitor } from "@capacitor/core";

export const platform = {
  isNative: Capacitor.isNativePlatform(),
  isIOS: Capacitor.getPlatform() === "ios",
  isAndroid: Capacitor.getPlatform() === "android",
  isWeb: Capacitor.getPlatform() === "web",
  name: Capacitor.getPlatform() as "ios" | "android" | "web",
};

export function getPaymentMethod(): "apple-iap" | "google-play" | "web" {
  if (platform.isIOS) return "apple-iap";
  if (platform.isAndroid) return "google-play";
  return "web";
}

export function openExternalLink(url: string): void {
  if (platform.isNative) {
    window.open(url, "_system");
    return;
  }
  window.open(url, "_blank", "noopener");
}

export async function openStripeHostedUrl(url: string): Promise<void> {
  const safe = String(url || "").trim();
  if (!/^https:\/\//i.test(safe)) {
    throw new Error("Invalid Stripe URL");
  }
  if (platform.isNative) {
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({ url: safe });
    return;
  }
  window.open(safe, "_blank", "noopener");
}

export async function openStripeCheckoutUrl(url: string): Promise<void> {
  return openStripeHostedUrl(url);
}

type NativeShareResult = "shared" | "copied" | "cancelled" | "unavailable";

function isShareAbort(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { name?: string; message?: string };
  if (e.name === "AbortError") return true;
  const msg = (e.message || "").toLowerCase();
  return msg.includes("share canceled") || msg.includes("share cancelled") || msg.includes("abort");
}

export async function nativeShareMedia(opts: {
  title?: string;
  text?: string;
  url?: string;
  blob?: Blob | null;
  filename?: string;
}): Promise<NativeShareResult> {
  const title = opts.title || "Elix Star Live";
  const text = opts.text || "Made with Elix Star Live";
  const url = opts.url || "https://www.elixstarlive.co.uk";

  if (opts.blob && opts.blob.size > 0 && typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      const type = opts.blob.type || "application/octet-stream";
      const filename = opts.filename || (type.startsWith("image/") ? "elixstar.jpg" : "elixstar.webm");
      const file = new File([opts.blob], filename, { type });
      const data: ShareData = { files: [file], title, text };
      const can = typeof navigator.canShare !== "function" || navigator.canShare(data);
      if (can) {
        await navigator.share(data);
        return "shared";
      }
    } catch (err) {
      if (isShareAbort(err)) return "cancelled";
    }
  }

  if (platform.isNative) {
    try {
      const { Share } = await import("@capacitor/share");
      await Share.share({ title, text, url, dialogTitle: title });
      return "shared";
    } catch (err) {
      if (isShareAbort(err)) return "cancelled";
    }
  }

  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({ title, text, url });
      return "shared";
    } catch (err) {
      if (isShareAbort(err)) return "cancelled";
    }
  }

  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
      return "copied";
    }
  } catch {
    /* fall through */
  }

  return "unavailable";
}

export async function nativeShareUrl(opts: { title?: string; text?: string; url: string }): Promise<boolean> {
  const result = await nativeShareMedia({
    title: opts.title,
    text: opts.text,
    url: opts.url,
  });
  return result === "shared" || result === "copied";
}
