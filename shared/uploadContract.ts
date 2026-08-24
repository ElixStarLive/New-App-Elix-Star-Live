export const UPLOAD_MAX_BYTES = 500 * 1024 * 1024;
export const UPLOAD_CAPTION_MAX = 4000;
export const UPLOAD_MAX_DURATION_MS = 10 * 60 * 1000;

export type UploadKind = "video" | "story";
export type UploadPrivacy = "public" | "private";
export type MediaReadyStatus = "ready";

const VIDEO_MIME = new Set(["video/mp4", "video/webm", "video/quicktime"]);
const IMAGE_MIME = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value.trim());
}

export function normalizeUploadKind(raw: unknown): UploadKind {
  return raw === "story" ? "story" : "video";
}

export function normalizePrivacy(raw: unknown): UploadPrivacy {
  return raw === "private" ? "private" : "public";
}

export function baseMime(contentType: string): string {
  return contentType.split(";")[0]?.trim().toLowerCase() || "";
}

export function isVideoMime(contentType: string): boolean {
  const mime = baseMime(contentType);
  return VIDEO_MIME.has(mime) || mime.startsWith("video/");
}

export function isImageMime(contentType: string): boolean {
  const mime = baseMime(contentType);
  return IMAGE_MIME.has(mime) || mime.startsWith("image/");
}

export function extensionForMime(contentType: string, filename = ""): string {
  const mime = baseMime(contentType);
  if (mime.includes("mp4")) return "mp4";
  if (mime.includes("quicktime")) return "mov";
  if (mime.includes("webm")) return "webm";
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  const fromName = filename.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "";
  if (fromName && fromName.length <= 8) return fromName;
  if (mime.startsWith("image/")) return "jpg";
  if (mime.startsWith("video/")) return "mp4";
  return "bin";
}

export function validateIncomingMedia(input: {
  kind: UploadKind;
  contentType: string;
  byteSize: number;
  durationMs?: number | null;
}): { ok: true } | { ok: false; error: string } {
  if (!Number.isFinite(input.byteSize) || input.byteSize <= 0) {
    return { ok: false, error: input.kind === "story" ? "Story is empty. Record or choose a valid clip." : "Video is empty. Record or choose a valid video." };
  }
  if (input.byteSize > UPLOAD_MAX_BYTES) {
    return { ok: false, error: `File too large. Maximum size is ${UPLOAD_MAX_BYTES / 1024 / 1024} MB.` };
  }
  const mime = baseMime(input.contentType);
  if (input.kind === "story") {
    if (!isVideoMime(mime) && !isImageMime(mime)) {
      return { ok: false, error: "Invalid format. Use MP4, WebM, JPEG, or PNG." };
    }
  } else if (!isVideoMime(mime)) {
    return { ok: false, error: "Invalid format. Please use MP4 or WebM." };
  }
  if (input.durationMs != null && Number.isFinite(input.durationMs) && input.durationMs > UPLOAD_MAX_DURATION_MS) {
    return { ok: false, error: "Clip is longer than 10 minutes." };
  }
  return { ok: true };
}

export function normalizeCaption(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim();
}

export function canonicalSoundId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const id = raw.trim();
  if (!id || id === "original" || id === "none") return null;
  if (/^https?:\/\//i.test(id)) return null;
  if (id.includes("..") || id.includes("/") || id.includes("\\")) return null;
  if (id.length > 128) return null;
  return id;
}

export function ownedStoragePath(kind: UploadKind, userId: string, objectId: string, ext: string): string {
  const prefix = kind === "story" ? "stories" : "videos";
  const safeExt = ext.replace(/[^a-z0-9]/gi, "") || "bin";
  return `${prefix}/${userId}/${objectId}/original.${safeExt}`;
}

export function storagePathBelongsToUser(storagePath: string, userId: string): boolean {
  const segs = storagePath.replace(/^\/+/, "").split("/").filter(Boolean);
  if (segs.length < 3) return false;
  if (segs.some((seg) => seg === ".." || seg.includes("\\"))) return false;
  const prefix = segs[0]?.toLowerCase();
  if (prefix !== "videos" && prefix !== "stories") return false;
  return segs[1] === userId;
}
