import type { BackgroundOption } from "./catalog";
import { combineLooks, isImageFile, isVideoFile } from "./looks";

export type AiStudioSnapshot = {
  videoUrl: string | null;
  bgUrl: string | null;
  playing: boolean;
  toolsOpen: boolean;
  filterCss: string;
  enhanceCss: string;
  combinedFilter: string | undefined;
  panelBackground: BackgroundOption | null;
  exporting: boolean;
};

type Listener = () => void;

export type ExportFrameResult =
  | { ok: true; blob: Blob }
  | { ok: false; reason: "no-video" | "canvas" | "encode" | "busy" };

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export function createAiStudioSession() {
  let videoUrl: string | null = null;
  let bgUrl: string | null = null;
  let playing = false;
  let toolsOpen = false;
  let filterCss = "none";
  let enhanceCss = "none";
  let panelBackground: BackgroundOption | null = null;
  let exporting = false;
  let videoEl: HTMLVideoElement | null = null;
  let canvasEl: HTMLCanvasElement | null = null;
  const listeners = new Set<Listener>();
  let cached: AiStudioSnapshot = {
    videoUrl: null,
    bgUrl: null,
    playing: false,
    toolsOpen: false,
    filterCss: "none",
    enhanceCss: "none",
    combinedFilter: undefined,
    panelBackground: null,
    exporting: false,
  };

  const snapshot = (): AiStudioSnapshot => cached;

  const notify = () => {
    cached = {
      videoUrl,
      bgUrl,
      playing,
      toolsOpen,
      filterCss,
      enhanceCss,
      combinedFilter: combineLooks(filterCss, enhanceCss),
      panelBackground,
      exporting,
    };
    for (const fn of listeners) fn();
  };

  const revoke = (url: string | null) => {
    if (url) URL.revokeObjectURL(url);
  };

  return {
    subscribe(fn: Listener) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    getSnapshot: snapshot,
    attachVideo(el: HTMLVideoElement | null) {
      videoEl = el;
    },
    attachCanvas(el: HTMLCanvasElement | null) {
      canvasEl = el;
    },
    setPlaying(next: boolean) {
      playing = next;
      notify();
    },
    setToolsOpen(open: boolean) {
      toolsOpen = open;
      notify();
    },
    setFilterCss(css: string) {
      filterCss = css || "none";
      notify();
    },
    setEnhanceCss(css: string) {
      enhanceCss = css || "none";
      notify();
    },
    setPanelBackground(option: BackgroundOption | null) {
      panelBackground = option && option.id !== "none" ? option : null;
      notify();
    },
    importVideo(file: File): { ok: true } | { ok: false; reason: "invalid" } {
      if (!isVideoFile(file)) return { ok: false, reason: "invalid" };
      revoke(videoUrl);
      videoUrl = URL.createObjectURL(file);
      playing = true;
      notify();
      return { ok: true };
    },
    importBackground(file: File): { ok: true } | { ok: false; reason: "invalid" } {
      if (!isImageFile(file)) return { ok: false, reason: "invalid" };
      revoke(bgUrl);
      bgUrl = URL.createObjectURL(file);
      notify();
      return { ok: true };
    },
    resetLooks() {
      filterCss = "none";
      enhanceCss = "none";
      notify();
    },
    async exportFrame(): Promise<ExportFrameResult> {
      if (exporting) return { ok: false, reason: "busy" };
      const video = videoEl;
      const canvas = canvasEl;
      if (!video || !videoUrl) return { ok: false, reason: "no-video" };
      if (!canvas) return { ok: false, reason: "canvas" };
      exporting = true;
      notify();
      try {
        canvas.width = video.videoWidth || 1080;
        canvas.height = video.videoHeight || 1920;
        const ctx = canvas.getContext("2d");
        if (!ctx) return { ok: false, reason: "canvas" };
        ctx.filter = "none";
        if (bgUrl) {
          const img = await loadImage(bgUrl);
          if (img) {
            const scale = Math.max(canvas.width / img.width, canvas.height / img.height);
            const w = img.width * scale;
            const h = img.height * scale;
            ctx.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
          }
        } else if (panelBackground?.kind === "color" || panelBackground?.kind === "gradient") {
          const style = panelBackground.value;
          if (panelBackground.kind === "color") {
            ctx.fillStyle = style;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
          }
        }
        const look = combineLooks(filterCss, enhanceCss);
        if (look) ctx.filter = look;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        ctx.filter = "none";
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.95));
        if (!blob) return { ok: false, reason: "encode" };
        return { ok: true, blob };
      } finally {
        exporting = false;
        notify();
      }
    },
    videoElement() {
      return videoEl;
    },
    dispose() {
      revoke(videoUrl);
      revoke(bgUrl);
      videoUrl = null;
      bgUrl = null;
      playing = false;
      toolsOpen = false;
      filterCss = "none";
      enhanceCss = "none";
      panelBackground = null;
      exporting = false;
      videoEl = null;
      canvasEl = null;
      notify();
    },
  };
}

export type AiStudioSession = ReturnType<typeof createAiStudioSession>;
