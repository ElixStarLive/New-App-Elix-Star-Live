import type { CapturedCreateMedia, CapturedKind, CapturedOrientation, CapturedSource } from "@/features/camera/createCameraContract";
import { takeCapturedCreateMedia } from "@/features/camera/capturedMediaCache";
import { canonicalSoundId, normalizeUploadKind, validateIncomingMedia, type UploadKind } from "@shared/uploadContract";
import { apiCreateUploadSession, apiPublishUploadSession, putUploadBytes } from "./uploadApi";

export type UploadPhase = "idle" | "uploading" | "publishing" | "success" | "error";

export type UploadPublishState = {
  kind: UploadKind;
  media: CapturedCreateMedia | null;
  caption: string;
  hashtagsText: string;
  soundId: string | null;
  mutedPreview: boolean;
  phase: UploadPhase;
  progress: number | null;
  error: string | null;
  publishedId: string | null;
  processingStatus: "ready" | null;
};

export type UploadPublishDeps = {
  kind: UploadKind;
  takeCaptured?: typeof takeCapturedCreateMedia;
  createObjectUrl?: (blob: Blob) => string;
  revokeObjectUrl?: (url: string) => void;
  randomId?: () => string;
  createSession?: typeof apiCreateUploadSession;
  putBytes?: typeof putUploadBytes;
  publish?: typeof apiPublishUploadSession;
};

const INITIAL = (kind: UploadKind): UploadPublishState => ({
  kind,
  media: null,
  caption: "",
  hashtagsText: "",
  soundId: null,
  mutedPreview: true,
  phase: "idle",
  progress: null,
  error: null,
  publishedId: null,
  processingStatus: null,
});

function filenameFor(media: CapturedCreateMedia): string {
  const mime = media.mimeType || "";
  if (mime.includes("mp4")) return "clip.mp4";
  if (mime.includes("quicktime")) return "clip.mov";
  if (mime.includes("png")) return "clip.png";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "clip.jpg";
  if (mime.includes("webp")) return "clip.webp";
  if (media.kind === "image") return "clip.jpg";
  return "clip.webm";
}

export function createUploadPublishSession(deps: UploadPublishDeps) {
  const takeCaptured = deps.takeCaptured ?? takeCapturedCreateMedia;
  const createObjectUrl = deps.createObjectUrl ?? ((blob: Blob) => URL.createObjectURL(blob));
  const revokeObjectUrl = deps.revokeObjectUrl ?? ((url: string) => URL.revokeObjectURL(url));
  const randomId = deps.randomId ?? (() => crypto.randomUUID());
  const createSession = deps.createSession ?? apiCreateUploadSession;
  const putBytes = deps.putBytes ?? putUploadBytes;
  const publish = deps.publish ?? apiPublishUploadSession;

  let state = INITIAL(normalizeUploadKind(deps.kind));
  let idempotencyKey = randomId();
  let posting = false;
  let disposed = false;
  let abort: AbortController | null = null;
  const listeners = new Set<() => void>();

  const emit = (patch: Partial<UploadPublishState>) => {
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  };

  const releaseMedia = (media: CapturedCreateMedia | null) => {
    if (!media) return;
    try {
      revokeObjectUrl(media.objectUrl);
    } catch {
      /* ignore */
    }
  };

  const acceptMedia = (media: CapturedCreateMedia, replace = true) => {
    const check = validateIncomingMedia({
      kind: state.kind,
      contentType: media.mimeType,
      byteSize: media.blob.size,
      durationMs: media.durationMs,
    });
    if (!check.ok) {
      try {
        revokeObjectUrl(media.objectUrl);
      } catch {
        /* ignore */
      }
      emit({ error: check.error, phase: "error" });
      return false;
    }
    if (replace) releaseMedia(state.media);
    idempotencyKey = randomId();
    emit({
      media,
      soundId: canonicalSoundId(media.soundId) ?? state.soundId,
      error: null,
      phase: "idle",
      publishedId: null,
      processingStatus: null,
      progress: null,
    });
    return true;
  };

  async function post() {
    if (posting || disposed) return { ok: false as const, error: "busy" };
    if (state.phase === "success" && state.publishedId) {
      return { ok: true as const, id: state.publishedId };
    }
    posting = true;
    abort = new AbortController();
    const media = state.media;
    if (!media) {
      posting = false;
      abort = null;
      emit({ error: state.kind === "story" ? "No story media to upload. Record or choose a clip first." : "No video to upload. Record or choose a video first.", phase: "error" });
      return { ok: false as const, error: "no-media" };
    }
    const check = validateIncomingMedia({
      kind: state.kind,
      contentType: media.mimeType,
      byteSize: media.blob.size,
      durationMs: media.durationMs,
    });
    if (!check.ok) {
      posting = false;
      abort = null;
      emit({ error: check.error, phase: "error" });
      return { ok: false as const, error: check.error };
    }

    emit({ phase: "uploading", progress: null, error: null });
    try {
      const created = await createSession({
        idempotencyKey,
        kind: state.kind,
        contentType: media.mimeType,
        byteSize: media.blob.size,
        filename: filenameFor(media),
        durationMs: media.durationMs,
        width: media.width,
        height: media.height,
      });
      if (!created.data) {
        emit({ phase: "error", error: created.error || "Upload session was not created", progress: null });
        return { ok: false as const, error: created.error || "session", status: created.status };
      }
      await putBytes(created.data.sessionId, media.blob, media.mimeType, {
        signal: abort.signal,
        onProgress: (percent) => {
          if (!disposed && state.phase === "uploading") emit({ progress: percent });
        },
      });
      emit({ phase: "publishing", progress: 100 });
      const published = await publish(created.data.sessionId, {
        caption: state.caption,
        extraHashtags: state.hashtagsText,
        privacy: "public",
        soundId: state.soundId,
      });
      if (!published.data) {
        emit({ phase: "error", error: published.error || "Publish was not confirmed", progress: 100 });
        return { ok: false as const, error: published.error || "publish", status: published.status };
      }
      emit({
        phase: "success",
        publishedId: published.data.id,
        processingStatus: published.data.processingStatus,
        progress: 100,
        error: null,
      });
      return { ok: true as const, id: published.data.id, kind: published.data.kind };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload failed";
      emit({ phase: "error", error: message });
      return { ok: false as const, error: message };
    } finally {
      posting = false;
      abort = null;
    }
  }

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getState() {
      return state;
    },
    intake(fallbackSoundId?: string | null) {
      const cached = takeCaptured();
      if (cached) {
        acceptMedia(cached, false);
      }
      const soundId = canonicalSoundId(cached?.soundId ?? fallbackSoundId ?? state.soundId);
      if (soundId !== state.soundId) emit({ soundId });
    },
    acceptGalleryFile(file: File) {
      const mime = file.type || "application/octet-stream";
      const kind: CapturedKind = mime.startsWith("image/") ? "image" : "video";
      const objectUrl = createObjectUrl(file);
      const media: CapturedCreateMedia = {
        blob: file,
        objectUrl,
        mimeType: mime,
        kind,
        durationMs: null,
        width: null,
        height: null,
        orientation: "unknown" as CapturedOrientation,
        facing: "user",
        soundId: state.soundId,
        source: "gallery" as CapturedSource,
        originalVolume: 1,
        musicVolume: 0.7,
      };
      acceptMedia(media);
    },
    setCaption(caption: string) {
      emit({ caption });
    },
    setHashtagsText(hashtagsText: string) {
      emit({ hashtagsText });
    },
    setMutedPreview(mutedPreview: boolean) {
      emit({ mutedPreview });
    },
    clearError() {
      emit({ error: null, phase: state.publishedId ? "success" : "idle" });
    },
    post,
    retry() {
      if (state.phase === "success") return Promise.resolve({ ok: true as const, id: state.publishedId || "" });
      emit({ phase: "idle", error: null });
      return post();
    },
    cancelInFlight() {
      abort?.abort();
    },
    discard() {
      abort?.abort();
      releaseMedia(state.media);
      idempotencyKey = randomId();
      emit({ ...INITIAL(state.kind), soundId: state.soundId });
    },
    dispose() {
      disposed = true;
      abort?.abort();
      releaseMedia(state.media);
      state = INITIAL(state.kind);
      listeners.clear();
    },
  };
}

export type UploadPublishSession = ReturnType<typeof createUploadPublishSession>;
