import type { CSSProperties } from "react";
import type { BackgroundOption, EnhanceSettings } from "./catalog";
import { DEFAULT_ENHANCE } from "./catalog";

export function scaleFilterCss(css: string, intensityPercent: number): string {
  if (!css || css === "none") return "none";
  const intensity = Math.max(0, Math.min(1, intensityPercent / 100));
  return css
    .split(/\s+/)
    .map((part) => {
      const match = /^([\w-]+)\(([^)]+)\)$/.exec(part);
      if (!match) return part;
      const [, fn, raw] = match;
      const num = parseFloat(raw);
      if (!Number.isFinite(num)) return part;
      const cleanedUnit = raw.replace(/[-0-9.]+/, "");
      const base = fn === "brightness" || fn === "contrast" || fn === "saturate" ? 1 : 0;
      const adjusted = base + (num - base) * intensity;
      return `${fn}(${adjusted}${cleanedUnit})`;
    })
    .join(" ");
}

export function enhanceToCss(s: EnhanceSettings): string {
  const parts: string[] = [];
  if (s.brightness !== 0) parts.push(`brightness(${1 + s.brightness / 100})`);
  if (s.contrast !== 0) parts.push(`contrast(${1 + s.contrast / 100})`);
  if (s.saturation !== 0) parts.push(`saturate(${1 + s.saturation / 100})`);
  if (s.warmth > 0) parts.push(`sepia(${s.warmth / 200})`);
  if (s.warmth < 0) parts.push(`hue-rotate(${s.warmth / 5}deg)`);
  if (s.fade > 0) parts.push(`opacity(${1 - s.fade / 200})`);
  return parts.length > 0 ? parts.join(" ") : "none";
}

export function autoEnhanceFromFrame(source: HTMLVideoElement | HTMLImageElement): EnhanceSettings {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return { ...DEFAULT_ENHANCE };
  const sw = 100;
  const srcW = source instanceof HTMLVideoElement ? source.videoWidth : source.naturalWidth;
  const srcH = source instanceof HTMLVideoElement ? source.videoHeight : source.naturalHeight;
  if (!srcW || !srcH) return { ...DEFAULT_ENHANCE };
  const sh = Math.max(1, Math.round((srcH / srcW) * sw));
  canvas.width = sw;
  canvas.height = sh;
  ctx.drawImage(source, 0, 0, sw, sh);
  const data = ctx.getImageData(0, 0, sw, sh).data;
  let total = 0;
  let minLum = 255;
  let maxLum = 0;
  const pixels = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    total += data[i] + data[i + 1] + data[i + 2];
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    if (lum < minLum) minLum = lum;
    if (lum > maxLum) maxLum = lum;
  }
  const avgLum = total / (pixels * 3);
  const range = maxLum - minLum;
  return {
    brightness: avgLum < 100 ? 15 : avgLum > 180 ? -10 : 5,
    contrast: range < 150 ? 15 : range > 230 ? -5 : 5,
    saturation: 10,
    warmth: 5,
    sharpness: 20,
    vignette: 15,
    grain: 0,
    fade: 0,
  };
}

export function combineLooks(filterCss: string, enhanceCss: string): string | undefined {
  const parts = [filterCss, enhanceCss].filter((value) => value && value !== "none");
  return parts.length ? parts.join(" ") : undefined;
}

export function isVideoFile(file: File): boolean {
  return file.type.startsWith("video/") && file.size > 0;
}

export function isImageFile(file: File): boolean {
  return file.type.startsWith("image/") && file.size > 0;
}

export function panelBackgroundStyle(option: BackgroundOption | null): CSSProperties | undefined {
  if (!option || option.kind === "none") return undefined;
  if (option.kind === "color") return { background: option.value };
  if (option.kind === "gradient") return { background: option.value };
  return undefined;
}

export function panelBackgroundBlur(option: BackgroundOption | null): string | undefined {
  if (!option || option.kind !== "blur") return undefined;
  return `blur(${option.value})`;
}
