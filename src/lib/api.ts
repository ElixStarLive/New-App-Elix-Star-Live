import { Capacitor } from "@capacitor/core";

const APP_PRODUCTION_ORIGIN = "https://www.elixstarlive.co.uk";

function runtimeEnv(): Window["__ELIX_ENV"] {
  return typeof window !== "undefined" ? window.__ELIX_ENV : undefined;
}

function isLocalDev(): boolean {
  if (Capacitor.isNativePlatform()) return false;
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1";
}

function trimSlash(value: string): string {
  return value.replace(/\/$/, "");
}

function readEnvUrl(key: "VITE_API_URL" | "VITE_WS_URL" | "VITE_LIVEKIT_URL"): string {
  const fromVite = (import.meta.env[key] ?? "").toString().trim();
  const fromRuntime = (runtimeEnv()?.[key] ?? "").toString().trim();
  return trimSlash(fromVite || fromRuntime);
}

export function getApiBase(): string {
  if (Capacitor.isNativePlatform()) {
    const fromEnv = readEnvUrl("VITE_API_URL");
    if (fromEnv.startsWith("https://") || fromEnv.startsWith("http://")) {
      return fromEnv;
    }
    return trimSlash(APP_PRODUCTION_ORIGIN);
  }

  if (isLocalDev()) return "";

  const fromEnv = readEnvUrl("VITE_API_URL");
  return fromEnv;
}

export function getPublicWebOrigin(): string {
  if (Capacitor.isNativePlatform()) return getApiBase();
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return origin || APP_PRODUCTION_ORIGIN;
}

export function getLiveKitUrl(): string {
  const raw = readEnvUrl("VITE_LIVEKIT_URL");
  if (!raw) return "";
  if (raw.startsWith("http://")) return raw.replace("http://", "ws://");
  if (raw.startsWith("https://")) return raw.replace("https://", "wss://");
  return raw;
}

export function getWsUrl(): string {
  if (isLocalDev() && typeof window !== "undefined") {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${window.location.host}`;
  }

  let ws = readEnvUrl("VITE_WS_URL");
  if (!ws && Capacitor.isNativePlatform()) {
    ws = getApiBase();
  }
  if (!ws && typeof window !== "undefined") {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    ws = `${proto}//${window.location.host}`;
  }
  if (ws.startsWith("https://")) ws = ws.replace("https://", "wss://");
  else if (ws.startsWith("http://")) ws = ws.replace("http://", "ws://");
  if (!ws.startsWith("ws://localhost") && !ws.startsWith("ws://127.0.0.1") && ws.startsWith("ws://")) {
    ws = ws.replace("ws://", "wss://");
  }
  return ws;
}

export function apiUrl(path: string): string {
  const base = getApiBase();
  const p = path.startsWith("/") ? path : `/${path}`;
  return base ? `${base}${p}` : p;
}
