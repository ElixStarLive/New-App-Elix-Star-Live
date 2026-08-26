import type { CameraDuration } from "@/components/ElixCameraLayout";
import {
  classifyCameraError,
  classifyMicrophoneError,
  durationLimitMs,
  isSecureCameraContext,
  orientationFromSize,
  pickRecorderMime,
  type CameraErrorKind,
  type CameraFacing,
  type CapturedCreateMedia,
  type CapturedKind,
} from "./createCameraContract";

type DeviceCaps = MediaTrackCapabilities & {
  torch?: boolean;
  zoom?: { min?: number; max?: number };
};

export type MediaRecorderLike = {
  state: string;
  ondataavailable: ((event: { data: Blob }) => void) | null;
  onstop: (() => void) | null;
  onstart: (() => void) | null;
  onerror: ((event: { error?: unknown }) => void) | null;
  start: (timeslice?: number) => void;
  stop: () => void;
};

export type CameraSessionState = {
  facing: CameraFacing;
  recording: boolean;
  attaching: boolean;
  error: string | null;
  errorKind: CameraErrorKind | null;
  flashOn: boolean;
  zoom: number;
  elapsedMs: number;
  countdown: number | null;
  timerSeconds: 0 | 3 | 10;
  duration: CameraDuration;
  clip: CapturedCreateMedia | null;
  micDenied: boolean;
  micDeniedMessage: string | null;
};

export type CameraSessionDeps = {
  getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  createRecorder: (stream: MediaStream, mimeType: string | undefined) => MediaRecorderLike;
  isTypeSupported: (type: string) => boolean;
  getVideoEl: () => HTMLVideoElement | null;
  now?: () => number;
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
  setIntervalFn?: typeof setInterval;
  clearIntervalFn?: typeof clearInterval;
  isSecureContext?: () => boolean;
  locationProtocol?: () => string;
  locationHostname?: () => string;
  createObjectUrl?: (blob: Blob) => string;
  revokeObjectUrl?: (url: string) => void;
};

const INITIAL: CameraSessionState = {
  facing: "user",
  recording: false,
  attaching: false,
  error: null,
  errorKind: null,
  flashOn: false,
  zoom: 1,
  elapsedMs: 0,
  countdown: null,
  timerSeconds: 0,
  duration: "60s",
  clip: null,
  micDenied: false,
  micDeniedMessage: null,
};

function stopTracks(stream: MediaStream | null): void {
  if (!stream) return;
  for (const track of stream.getTracks()) {
    try {
      track.stop();
    } catch {
      /* already ended */
    }
  }
}

function defaultCreateRecorder(stream: MediaStream, mimeType: string | undefined): MediaRecorderLike {
  if (typeof MediaRecorder === "undefined") {
    throw new Error("Recording not supported.");
  }
  return new MediaRecorder(stream, mimeType ? { mimeType } : undefined) as unknown as MediaRecorderLike;
}

export function createCameraSession(deps: CameraSessionDeps) {
  const now = deps.now ?? (() => Date.now());
  const setTimeoutFn = deps.setTimeoutFn ?? setTimeout;
  const clearTimeoutFn = deps.clearTimeoutFn ?? clearTimeout;
  const setIntervalFn = deps.setIntervalFn ?? setInterval;
  const clearIntervalFn = deps.clearIntervalFn ?? clearInterval;
  const createObjectUrl = deps.createObjectUrl ?? ((blob: Blob) => URL.createObjectURL(blob));
  const revokeObjectUrl = deps.revokeObjectUrl ?? ((url: string) => URL.revokeObjectURL(url));

  let state: CameraSessionState = { ...INITIAL };
  const listeners = new Set<() => void>();
  let generation = 0;
  let stream: MediaStream | null = null;
  let recorder: MediaRecorderLike | null = null;
  let chunks: Blob[] = [];
  let recorderMime: string | undefined;
  let startedAt = 0;
  let elapsedTimer: ReturnType<typeof setInterval> | null = null;
  let maxTimer: ReturnType<typeof setTimeout> | null = null;
  let countdownTimer: ReturnType<typeof setTimeout> | null = null;
  let lastVideoWidth: number | null = null;
  let lastVideoHeight: number | null = null;
  let handedOff = false;
  let stopping = false;

  function emit(): void {
    for (const listener of listeners) listener();
  }

  function patch(partial: Partial<CameraSessionState>): void {
    state = { ...state, ...partial };
    emit();
  }

  function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  function getState(): CameraSessionState {
    return state;
  }

  function clearTimers(): void {
    if (elapsedTimer != null) {
      clearIntervalFn(elapsedTimer);
      elapsedTimer = null;
    }
    if (maxTimer != null) {
      clearTimeoutFn(maxTimer);
      maxTimer = null;
    }
    if (countdownTimer != null) {
      clearTimeoutFn(countdownTimer);
      countdownTimer = null;
    }
  }

  function revokeClip(clip: CapturedCreateMedia | null): void {
    if (!clip || handedOff) return;
    revokeObjectUrl(clip.objectUrl);
  }

  function bindLivePreview(): void {
    const video = deps.getVideoEl();
    if (!video || !stream) return;
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    video.style.transform = state.facing === "user" ? "scaleX(-1)" : "none";
    void video.play().catch(() => undefined);
  }

  function bindReviewPreview(clip: CapturedCreateMedia): void {
    const video = deps.getVideoEl();
    if (!video) return;
    video.srcObject = null;
    if (clip.kind === "video") {
      video.src = clip.objectUrl;
      video.muted = false;
      void video.play().catch(() => undefined);
    } else {
      video.removeAttribute("src");
      video.load();
    }
  }

  function rememberSettings(): void {
    const track = stream?.getVideoTracks()[0];
    const settings = track?.getSettings?.();
    if (settings?.width) lastVideoWidth = settings.width;
    if (settings?.height) lastVideoHeight = settings.height;
  }

  function releaseStreamOnly(): void {
    const video = deps.getVideoEl();
    if (video) {
      video.srcObject = null;
    }
    stopTracks(stream);
    stream = null;
  }

  async function acquireStream(facing: CameraFacing): Promise<MediaStream> {
    let videoStream: MediaStream;
    try {
      videoStream = await deps.getUserMedia({
        video: { facingMode: facing },
        audio: false,
      });
    } catch {
      // OLD Create falls back when facingMode is rejected by the device/browser.
      videoStream = await deps.getUserMedia({ video: true, audio: false });
    }
    let micDenied = false;
    let micDeniedMessage: string | null = null;
    try {
      const audioStream = await deps.getUserMedia({ audio: true, video: false });
      for (const track of audioStream.getAudioTracks()) {
        videoStream.addTrack(track);
      }
    } catch (err) {
      micDenied = true;
      micDeniedMessage = classifyMicrophoneError(err);
    }
    patch({ micDenied, micDeniedMessage });
    return videoStream;
  }

  async function open(nextFacing: CameraFacing = state.facing): Promise<void> {
    const gen = ++generation;
    clearTimers();
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        /* ignore */
      }
    }
    recorder = null;
    chunks = [];
    stopping = false;
    releaseStreamOnly();
    patch({
      attaching: true,
      recording: false,
      elapsedMs: 0,
      countdown: null,
      flashOn: false,
      zoom: 1,
      facing: nextFacing,
      error: null,
      errorKind: null,
    });

    const secure = isSecureCameraContext({
      isSecureContext: deps.isSecureContext ? deps.isSecureContext() : typeof window !== "undefined" && window.isSecureContext,
      protocol: deps.locationProtocol ? deps.locationProtocol() : typeof window !== "undefined" ? window.location.protocol : "https:",
      hostname: deps.locationHostname ? deps.locationHostname() : typeof window !== "undefined" ? window.location.hostname : "localhost",
    });
    if (!secure) {
      if (gen !== generation) return;
      patch({
        attaching: false,
        error: "Camera requires HTTPS. Access via https:// or localhost.",
        errorKind: "secure",
      });
      return;
    }

    try {
      const next = await acquireStream(nextFacing);
      if (gen !== generation) {
        stopTracks(next);
        return;
      }
      if (next.getVideoTracks().length === 0) {
        stopTracks(next);
        patch({
          attaching: false,
          error: "Camera returned no video.",
          errorKind: "notfound",
        });
        return;
      }
      stream = next;
      rememberSettings();
      bindLivePreview();
      patch({ attaching: false, error: null, errorKind: null, facing: nextFacing });
    } catch (err) {
      if (gen !== generation) return;
      const classified = classifyCameraError(err);
      patch({ attaching: false, error: classified.message, errorKind: classified.kind });
    }
  }

  function finalizeClip(blob: Blob, kind: CapturedKind, durationMs: number | null, source: CapturedCreateMedia["source"]): CapturedCreateMedia {
    const video = deps.getVideoEl();
    const width = lastVideoWidth ?? (video?.videoWidth || null) ?? null;
    const height = lastVideoHeight ?? (video?.videoHeight || null) ?? null;
    const mimeType = blob.type || (kind === "image" ? "image/jpeg" : recorderMime || "video/webm");
    const objectUrl = createObjectUrl(blob);
    return {
      blob,
      objectUrl,
      mimeType,
      kind,
      durationMs,
      width,
      height,
      orientation: orientationFromSize(width, height),
      facing: state.facing,
      soundId: null,
      source,
      originalVolume: 1,
      musicVolume: 0.7,
    };
  }

  function startElapsed(limit: number | null): void {
    if (state.recording) return;
    clearTimers();
    startedAt = now();
    patch({ elapsedMs: 0, recording: true });
    elapsedTimer = setIntervalFn(() => {
      const elapsed = now() - startedAt;
      patch({ elapsedMs: elapsed });
    }, 250);
    if (limit && limit > 0) {
      maxTimer = setTimeoutFn(() => {
        void stopRecording();
      }, limit);
    }
  }

  function startRecording(): void {
    if (state.recording || stopping || state.attaching) return;
    if (state.duration === "PHOTO" || state.duration === "TEXT") return;
    if (!stream) {
      patch({ error: "Camera is not ready.", errorKind: "unknown" });
      return;
    }
    let rec: MediaRecorderLike;
    try {
      recorderMime = pickRecorderMime(deps.isTypeSupported);
      rec = deps.createRecorder(stream, recorderMime);
    } catch {
      patch({ error: "Recording not supported.", errorKind: "unsupported" });
      return;
    }
    chunks = [];
    stopping = false;
    recorder = rec;
    rec.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) chunks.push(event.data);
    };
    rec.onerror = () => {
      patch({ error: "Recording failed.", errorKind: "unknown", recording: false });
    };
    const recGeneration = generation;
    rec.onstop = () => {
      if (recGeneration !== generation) return;
      clearTimers();
      stopping = false;
      recorder = null;
      const elapsed = startedAt ? now() - startedAt : state.elapsedMs;
      if (chunks.length === 0) {
        patch({ recording: false, elapsedMs: 0, error: "Recording produced no media.", errorKind: "unknown" });
        return;
      }
      revokeClip(state.clip);
      handedOff = false;
      const blob = new Blob(chunks, { type: recorderMime || "video/webm" });
      chunks = [];
      releaseStreamOnly();
      const clip = finalizeClip(blob, "video", elapsed > 0 ? elapsed : null, "camera");
      bindReviewPreview(clip);
      patch({ recording: false, elapsedMs: elapsed, clip, countdown: null });
    };
    rec.onstart = () => {
      if (recorder !== rec) return;
      startElapsed(durationLimitMs(state.duration));
    };
    try {
      rec.start(250);
    } catch {
      recorder = null;
      patch({ error: "Recording could not start.", errorKind: "unsupported", recording: false });
      return;
    }
    if (rec.state === "recording" && !state.recording) {
      startElapsed(durationLimitMs(state.duration));
    }
  }

  async function stopRecording(): Promise<void> {
    if (stopping) return;
    if (!recorder || recorder.state === "inactive") {
      patch({ recording: false, countdown: null });
      return;
    }
    stopping = true;
    clearTimers();
    try {
      recorder.stop();
    } catch {
      stopping = false;
      patch({ recording: false, error: "Could not stop recording.", errorKind: "unknown" });
    }
  }

  function capturePhoto(): void {
    const video = deps.getVideoEl();
    if (!video) return;
    const width = video.videoWidth || lastVideoWidth || 720;
    const height = video.videoHeight || lastVideoHeight || 1280;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      patch({ error: "Photo capture is not supported.", errorKind: "unsupported" });
      return;
    }
    ctx.drawImage(video, 0, 0, width, height);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          patch({ error: "Photo capture failed.", errorKind: "unknown" });
          return;
        }
        revokeClip(state.clip);
        handedOff = false;
        lastVideoWidth = width;
        lastVideoHeight = height;
        releaseStreamOnly();
        const clip = finalizeClip(blob, "image", null, "camera");
        patch({ clip, recording: false, countdown: null });
      },
      "image/jpeg",
      0.92,
    );
  }

  function cancelCountdown(): void {
    if (countdownTimer != null) {
      clearTimeoutFn(countdownTimer);
      countdownTimer = null;
    }
    patch({ countdown: null });
  }

  function beginCountdownThen(action: () => void): void {
    const total = state.timerSeconds;
    if (total === 0) {
      action();
      return;
    }
    cancelCountdown();
    const started = now();
    patch({ countdown: total });
    const tick = () => {
      const left = total - Math.floor((now() - started) / 1000);
      if (left <= 0) {
        countdownTimer = null;
        patch({ countdown: null });
        action();
        return;
      }
      patch({ countdown: left });
      countdownTimer = setTimeoutFn(tick, 200);
    };
    countdownTimer = setTimeoutFn(tick, 200);
  }

  function shutter(): void {
    if (state.countdown != null) return;
    if (state.recording) {
      void stopRecording();
      return;
    }
    if (state.clip) return;
    if (state.duration === "TEXT") return;
    if (state.duration === "PHOTO") {
      beginCountdownThen(capturePhoto);
      return;
    }
    beginCountdownThen(startRecording);
  }

  async function flip(): Promise<void> {
    if (state.recording || state.countdown != null) return;
    if (state.clip) return;
    const next: CameraFacing = state.facing === "user" ? "environment" : "user";
    await open(next);
  }

  async function applyZoom(level: number): Promise<void> {
    const clamped = Math.max(1, Math.min(4, level));
    patch({ zoom: clamped });
    const track = stream?.getVideoTracks()[0];
    const caps = track?.getCapabilities?.() as DeviceCaps | undefined;
    const video = deps.getVideoEl();
    if (track && caps?.zoom) {
      const min = caps.zoom.min ?? 1;
      const max = caps.zoom.max ?? 4;
      const mapped = min + ((clamped - 1) / 3) * (max - min);
      await track.applyConstraints({ advanced: [{ zoom: mapped } as MediaTrackConstraintSet] }).catch(() => undefined);
      if (video) {
        video.style.transform = state.facing === "user" ? "scaleX(-1)" : "none";
      }
      return;
    }
    if (video) {
      const mirror = state.facing === "user" ? "scaleX(-1) " : "";
      video.style.transform = `${mirror}scale(${clamped})`;
    }
  }

  async function toggleFlash(): Promise<boolean> {
    const track = stream?.getVideoTracks()[0];
    const caps = track?.getCapabilities?.() as DeviceCaps | undefined;
    const next = !state.flashOn;
    if (!track || !caps?.torch) {
      patch({ flashOn: false });
      return false;
    }
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      patch({ flashOn: next });
      return true;
    } catch {
      patch({ flashOn: false });
      return false;
    }
  }

  function setDuration(duration: CameraDuration): void {
    if (state.recording) return;
    patch({ duration });
  }

  function cycleTimer(): void {
    if (state.recording) return;
    const next: 0 | 3 | 10 = state.timerSeconds === 0 ? 3 : state.timerSeconds === 3 ? 10 : 0;
    patch({ timerSeconds: next });
  }

  function retake(): void {
    cancelCountdown();
    clearTimers();
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        /* ignore */
      }
    }
    recorder = null;
    chunks = [];
    revokeClip(state.clip);
    handedOff = false;
    const video = deps.getVideoEl();
    if (video) {
      video.removeAttribute("src");
      video.load();
    }
    patch({ clip: null, recording: false, elapsedMs: 0, countdown: null, error: null, errorKind: null });
    void open(state.facing);
  }

  function acceptGalleryFile(file: File): void {
    if (state.recording) return;
    cancelCountdown();
    revokeClip(state.clip);
    handedOff = false;
    releaseStreamOnly();
    const kind: CapturedKind = file.type.startsWith("image/") ? "image" : "video";
    const clip = finalizeClip(file, kind, null, "gallery");
    bindReviewPreview(clip);
    patch({ clip, recording: false, countdown: null, error: null, errorKind: null });
  }

  function markHandedOff(): CapturedCreateMedia | null {
    if (!state.clip) return null;
    handedOff = true;
    return state.clip;
  }

  function onBackground(): void {
    if (state.countdown != null) cancelCountdown();
    if (state.recording) void stopRecording();
  }

  function onForeground(): void {
    if (state.clip || state.recording || state.attaching || state.countdown != null) return;
    const live = stream?.getVideoTracks().some((track) => track.readyState === "live");
    if (live) {
      bindLivePreview();
      return;
    }
    void open(state.facing);
  }

  function release(): void {
    generation += 1;
    cancelCountdown();
    clearTimers();
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        /* ignore */
      }
    }
    recorder = null;
    chunks = [];
    stopping = false;
    releaseStreamOnly();
    if (!handedOff) revokeClip(state.clip);
    patch({
      ...INITIAL,
      duration: state.duration,
      timerSeconds: state.timerSeconds,
      clip: handedOff ? state.clip : null,
    });
  }

  return {
    getState,
    subscribe,
    open,
    flip,
    shutter,
    stopRecording,
    retake,
    acceptGalleryFile,
    applyZoom,
    toggleFlash,
    setDuration,
    cycleTimer,
    cancelCountdown,
    markHandedOff,
    onBackground,
    onForeground,
    release,
    retry: () => open(state.facing),
  };
}

export type CreateCameraSession = ReturnType<typeof createCameraSession>;

export function browserCameraSessionDeps(getVideoEl: () => HTMLVideoElement | null): CameraSessionDeps {
  return {
    getUserMedia: (constraints) => navigator.mediaDevices.getUserMedia(constraints),
    createRecorder: defaultCreateRecorder,
    isTypeSupported: (type) => {
      try {
        return typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type);
      } catch {
        return false;
      }
    },
    getVideoEl,
  };
}
