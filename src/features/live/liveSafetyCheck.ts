import { apiRequest } from "@/lib/apiClient";
import { isRecord } from "@/lib/isRecord";

export const LIVE_SAFETY_TICK_MS = 30_000;
export const LIVE_SAFETY_WARNING =
  "Your stream may violate our safety guidelines. Please avoid dangerous or illegal activity.";

export function frameFromLiveVideo(video: HTMLVideoElement | null): string | null {
  if (!video?.srcObject || video.readyState < 2) return null;
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) return null;
  const canvas = document.createElement("canvas");
  canvas.width = Math.min(width, 640);
  canvas.height = Math.min(height, (640 * height) / width);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
  const base64 = dataUrl.split(",")[1];
  return base64 || null;
}

export async function apiLiveSafetyCheck(input: {
  streamKey: string;
  imageBase64: string;
}): Promise<{ action: "none" | "warning"; message: string | null; error: string | null }> {
  const { data, error } = await apiRequest<unknown>("/api/live/moderation/check", {
    method: "POST",
    body: JSON.stringify({
      stream_key: input.streamKey,
      image_base64: input.imageBase64,
    }),
  });
  if (error) return { action: "none", message: null, error: error.message };
  if (!isRecord(data)) return { action: "none", message: null, error: null };
  if (data.action === "warning") {
    return {
      action: "warning",
      message: typeof data.message === "string" && data.message ? data.message : LIVE_SAFETY_WARNING,
      error: null,
    };
  }
  return { action: "none", message: null, error: null };
}
