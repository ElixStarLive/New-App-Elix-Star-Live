import type { CapturedCreateMedia } from "./createCameraContract";

let cached: CapturedCreateMedia | null = null;

export function setCapturedCreateMedia(media: CapturedCreateMedia): void {
  if (cached && cached.objectUrl !== media.objectUrl) {
    URL.revokeObjectURL(cached.objectUrl);
  }
  cached = media;
}

export function peekCapturedCreateMedia(): CapturedCreateMedia | null {
  return cached;
}

/** PAGE-022 consumes once. Does not revoke; the consumer owns cleanup after upload/discard. */
export function takeCapturedCreateMedia(): CapturedCreateMedia | null {
  const next = cached;
  cached = null;
  return next;
}

export function discardCapturedCreateMedia(): void {
  if (cached) URL.revokeObjectURL(cached.objectUrl);
  cached = null;
}
