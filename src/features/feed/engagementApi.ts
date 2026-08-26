import { apiRequest } from "@/lib/apiClient";
import { publishVideoCollection } from "@/lib/videoCollectionEvents";

export async function apiLikeVideo(videoId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await apiRequest<unknown>(`/api/videos/${encodeURIComponent(videoId)}/like`, {
    method: "POST",
  });
  if (error) return { ok: false, error: error.message };
  publishVideoCollection({ type: "liked", videoId, liked: true });
  return { ok: true };
}

export async function apiUnlikeVideo(videoId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await apiRequest<unknown>(`/api/videos/${encodeURIComponent(videoId)}/unlike`, {
    method: "POST",
  });
  if (error) return { ok: false, error: error.message };
  publishVideoCollection({ type: "liked", videoId, liked: false });
  return { ok: true };
}

export async function apiSaveVideo(videoId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await apiRequest<unknown>(`/api/videos/${encodeURIComponent(videoId)}/save`, {
    method: "POST",
  });
  if (error) return { ok: false, error: error.message };
  publishVideoCollection({ type: "saved", videoId, saved: true });
  return { ok: true };
}

export async function apiUnsaveVideo(videoId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await apiRequest<unknown>(`/api/videos/${encodeURIComponent(videoId)}/unsave`, {
    method: "POST",
  });
  if (error) return { ok: false, error: error.message };
  publishVideoCollection({ type: "saved", videoId, saved: false });
  return { ok: true };
}
