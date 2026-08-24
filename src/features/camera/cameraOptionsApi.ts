import { isRecord } from "@/lib/isRecord";
import { apiRequest } from "@/lib/apiClient";
import type { CameraFilterOption, CameraSpeedOption, CameraStickerOption } from "@shared/cameraOptions";

async function fetchList<T>(path: string, parse: (raw: unknown) => T | null): Promise<T[]> {
  const { data, error } = await apiRequest<unknown>(path);
  if (error || !isRecord(data) || !Array.isArray(data.data)) return [];
  const next: T[] = [];
  for (const raw of data.data) {
    const item = parse(raw);
    if (item) next.push(item);
  }
  return next;
}

export async function apiFetchCameraFilters(): Promise<CameraFilterOption[]> {
  return fetchList("/api/camera-filters", (raw) => {
    if (!isRecord(raw) || typeof raw.id !== "string" || typeof raw.name !== "string") return null;
    const css = typeof raw.css === "string" ? raw.css : typeof raw.filter === "string" ? raw.filter : "none";
    return {
      id: raw.id,
      name: raw.name,
      color: typeof raw.color === "string" ? raw.color : "#3A3A3A",
      css,
    };
  });
}

export async function apiFetchSpeedOptions(): Promise<CameraSpeedOption[]> {
  return fetchList("/api/speed-options", (raw) => {
    if (!isRecord(raw) || typeof raw.value !== "number" || typeof raw.label !== "string") return null;
    return { value: raw.value, label: raw.label };
  });
}

export async function apiFetchStickerOptions(): Promise<CameraStickerOption[]> {
  return fetchList("/api/sticker-options", (raw) => {
    if (!isRecord(raw) || typeof raw.emoji !== "string") return null;
    return { emoji: raw.emoji };
  });
}
