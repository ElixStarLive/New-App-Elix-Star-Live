import { isRecord } from "@/lib/isRecord";
import type { CameraDuration } from "@/components/ElixCameraLayout";

export type CameraFacing = "user" | "environment";
export type CameraErrorKind = "permission" | "busy" | "unsupported" | "secure" | "notfound" | "unknown";
export type CapturedKind = "video" | "image";
export type CapturedSource = "camera" | "gallery";
export type CapturedOrientation = "portrait" | "landscape" | "unknown";

export type CapturedCreateMedia = {
  blob: Blob;
  objectUrl: string;
  mimeType: string;
  kind: CapturedKind;
  durationMs: number | null;
  width: number | null;
  height: number | null;
  orientation: CapturedOrientation;
  facing: CameraFacing;
  soundId: string | null;
  source: CapturedSource;
  originalVolume: number;
  musicVolume: number;
};

export type CreateSoundSelection = {
  soundId: string;
  title: string;
};

export const RECORDER_MIME_CANDIDATES = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
  "video/mp4",
] as const;

export function durationLimitMs(value: CameraDuration): number | null {
  if (value === "15s") return 15_000;
  if (value === "60s") return 60_000;
  if (value === "10m") return 600_000;
  return null;
}

export function pickRecorderMime(isTypeSupported: (type: string) => boolean): string | undefined {
  for (const type of RECORDER_MIME_CANDIDATES) {
    try {
      if (isTypeSupported(type)) return type;
    } catch {
      /* keep looking */
    }
  }
  return undefined;
}

export function orientationFromSize(width: number | null, height: number | null): CapturedOrientation {
  if (!width || !height) return "unknown";
  if (width === height) return "unknown";
  return width > height ? "landscape" : "portrait";
}

export function classifyCameraError(err: unknown): { message: string; kind: CameraErrorKind } {
  const name = err instanceof DOMException ? err.name : isRecord(err) && typeof err.name === "string" ? err.name : "";
  const message = err instanceof Error ? err.message : isRecord(err) && typeof err.message === "string" ? err.message : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return {
      message: "Camera permission denied. Allow camera access in Settings and tap Try Again.",
      kind: "permission",
    };
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return { message: "No camera found on this device.", kind: "notfound" };
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return {
      message: "Camera is in use by another app. Close other apps and tap Try Again.",
      kind: "busy",
    };
  }
  if (name === "NotSupportedError") {
    return { message: "Camera is not supported on this browser.", kind: "unsupported" };
  }
  return { message: message || "Camera unavailable", kind: "unknown" };
}

export function classifyMicrophoneError(err: unknown): string {
  const name = err instanceof DOMException ? err.name : isRecord(err) && typeof err.name === "string" ? err.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Microphone permission denied. Recording without mic.";
  }
  if (name === "NotFoundError") return "No microphone found. Recording without mic.";
  return "Microphone unavailable. Recording without mic.";
}

export function isSecureCameraContext(opts: {
  isSecureContext: boolean;
  protocol: string;
  hostname: string;
}): boolean {
  if (opts.isSecureContext) return true;
  if (opts.protocol === "https:") return true;
  const host = opts.hostname.toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
}

export function parseCreateSoundSelection(search: string, state: unknown): CreateSoundSelection | null {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const fromQuery = (params.get("soundId") || params.get("sound") || "").trim();
  const fromState =
    isRecord(state) && typeof state.soundId === "string" ? state.soundId.trim() : "";
  const soundId = fromQuery || fromState;
  if (!soundId || soundId === "original") return null;
  const title =
    isRecord(state) && typeof state.soundTitle === "string" && state.soundTitle.trim()
      ? state.soundTitle.trim()
      : "Sound";
  return { soundId, title };
}

export function isCreateSoundPick(state: unknown): boolean {
  if (!isRecord(state) || state.pickSound !== true) return false;
  const returnTo = typeof state.returnTo === "string" ? state.returnTo : "";
  return returnTo === "/create" || returnTo.startsWith("/create?");
}

export function createSoundPickState(): { returnTo: "/create"; pickSound: true } {
  return { returnTo: "/create", pickSound: true };
}

export function createPathWithSound(soundId: string, title?: string): {
  pathname: string;
  search: string;
  state: { soundId: string; soundTitle: string };
} {
  const id = soundId.trim();
  return {
    pathname: "/create",
    search: `?soundId=${encodeURIComponent(id)}`,
    state: { soundId: id, soundTitle: title?.trim() || "Sound" },
  };
}

export function capturedHandoffPayload(media: CapturedCreateMedia): {
  mimeType: string;
  kind: CapturedKind;
  durationMs: number | null;
  width: number | null;
  height: number | null;
  orientation: CapturedOrientation;
  soundId: string | null;
  source: CapturedSource;
} {
  return {
    mimeType: media.mimeType,
    kind: media.kind,
    durationMs: media.durationMs,
    width: media.width,
    height: media.height,
    orientation: media.orientation,
    soundId: media.soundId,
    source: media.source,
  };
}
