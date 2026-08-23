import type { FeedItem, FeedPage, UserPublic } from "@shared/contracts";
import { apiRequest, apiUploadForm } from "@/lib/apiClient";
import { isRecord } from "@/lib/isRecord";
import {
  apiFetchLikedFeed,
  apiFetchReposts,
  apiFetchSavedFeed,
  apiFetchStories,
  apiFetchUserVideos,
} from "@/features/feed/feedApi";
import { apiListShopItems, type ShopItem } from "@/features/shop/shopApi";
import { mapUserPublicPayload } from "@/features/profile/mapUserPublic";
import { useAuthStore } from "@/store/useAuthStore";

export type OwnProfileTab = "videos" | "shop" | "private" | "reposts" | "saved" | "liked";

export function ownProfileEmailLine(email: string | null | undefined, username: string): string {
  const trimmed = String(email ?? "").trim();
  if (trimmed.includes("@")) return `${trimmed.split("@")[0]}@`;
  const handle = username.replace(/^@+/, "");
  return handle ? `${handle}@` : "";
}

export async function apiFetchOwnProfile(): Promise<{
  profile: UserPublic | null;
  error: string | null;
  status?: number;
}> {
  // Live OLD production: GET /api/profiles/:userId (not /me stub userId:"me").
  const sessionUserId = useAuthStore.getState().user?.id?.trim() || "";
  if (sessionUserId) {
    const { data, error } = await apiRequest<unknown>(`/api/profiles/${encodeURIComponent(sessionUserId)}`);
    if (error) return { profile: null, error: error.message, status: error.status };
    const profile = mapUserPublicPayload(data);
    if (!profile) return { profile: null, error: "Invalid profile" };
    return { profile, error: null };
  }
  const { data, error } = await apiRequest<unknown>("/api/profiles/me");
  if (error) return { profile: null, error: error.message, status: error.status };
  const profile = mapUserPublicPayload(data);
  if (!profile) return { profile: null, error: "Invalid profile" };
  return { profile, error: null };
}

export async function apiUploadOwnAvatar(file: Blob, filename = "avatar.jpg"): Promise<{
  avatarUrl: string | null;
  error: string | null;
}> {
  const body = new FormData();
  body.append("file", file, filename);
  const { data, error } = await apiUploadForm<unknown>("/api/profiles/me/avatar", body);
  if (error) return { avatarUrl: null, error: error.message };
  if (!isRecord(data) || typeof data.avatarUrl !== "string") return { avatarUrl: null, error: "Avatar upload failed" };
  return { avatarUrl: data.avatarUrl, error: null };
}

export async function apiFetchOwnTabPage(
  tab: Exclude<OwnProfileTab, "shop">,
  userId: string,
  cursor?: string | null,
): Promise<{ page: FeedPage | null; error: string | null }> {
  if (tab === "videos") return apiFetchUserVideos(userId, "public", cursor);
  if (tab === "private") return apiFetchUserVideos(userId, "private", cursor);
  if (tab === "saved") return apiFetchSavedFeed(cursor);
  if (tab === "liked") return apiFetchLikedFeed(cursor);
  return apiFetchReposts(userId, cursor);
}

export async function apiFetchOwnShop(userId: string): Promise<{ items: ShopItem[]; error: string | null }> {
  return apiListShopItems(userId);
}

export async function apiOwnHasActiveStory(userId: string): Promise<boolean> {
  const res = await apiFetchStories();
  if (res.error) return false;
  return res.users.some((row) => row.userId === userId && row.stories.length > 0);
}

export type { FeedItem, ShopItem };
