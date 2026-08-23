import type { FeedVideo, UserPublic } from "@shared/contracts";
import type { FeedVideoPage } from "@/features/feed/feedApi";
import { userPublicSchema } from "@shared/contracts";
import { apiRequest } from "@/lib/apiClient";
import { isRecord } from "@/lib/isRecord";
import {
  apiFetchReposts,
  apiFetchStories,
  apiFetchUserLikedFeed,
  apiFetchUserSavedFeed,
  apiFetchUserVideos,
  apiFollow,
  apiUnfollow,
} from "@/features/feed/feedApi";
import { apiListShopItems, type ShopItem } from "@/features/shop/shopApi";

export type PublicProfileTab = "videos" | "shop" | "reposts" | "saved" | "liked";

export const PROFILE_USER_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isProfileUserId(value: string): boolean {
  return PROFILE_USER_ID_RE.test(value);
}

function parseProfile(data: unknown): UserPublic | null {
  const parsed = userPublicSchema.safeParse(isRecord(data) ? data.user : null);
  return parsed.success ? parsed.data : null;
}

export async function apiFetchPublicProfileById(userId: string): Promise<{
  profile: UserPublic | null;
  error: string | null;
  status?: number;
}> {
  const { data, error } = await apiRequest<unknown>(`/api/profiles/${encodeURIComponent(userId)}`);
  if (error) return { profile: null, error: error.message, status: error.status };
  const profile = parseProfile(data);
  if (!profile) return { profile: null, error: "Invalid profile" };
  return { profile, error: null };
}

export async function apiFetchPublicProfileByUsername(username: string): Promise<{
  profile: UserPublic | null;
  error: string | null;
  status?: number;
}> {
  const clean = username.replace(/^@+/, "");
  const { data, error } = await apiRequest<unknown>(
    `/api/profiles/by-username/${encodeURIComponent(clean)}`,
  );
  if (error) return { profile: null, error: error.message, status: error.status };
  const profile = parseProfile(data);
  if (!profile) return { profile: null, error: "Invalid profile" };
  return { profile, error: null };
}

export async function apiFetchPublicProfile(routeKey: string): Promise<{
  profile: UserPublic | null;
  error: string | null;
  status?: number;
}> {
  if (isProfileUserId(routeKey)) return apiFetchPublicProfileById(routeKey);
  return apiFetchPublicProfileByUsername(routeKey);
}

export async function apiRegisterPublicProfileView(userId: string): Promise<{
  uniqueViews: number | null;
  error: string | null;
}> {
  const { data, error } = await apiRequest<unknown>(`/api/profiles/${encodeURIComponent(userId)}/view`, {
    method: "POST",
    body: "{}",
  });
  if (error) return { uniqueViews: null, error: error.message };
  const uniqueViews = isRecord(data) && typeof data.uniqueViews === "number" ? data.uniqueViews : null;
  return { uniqueViews, error: null };
}

export async function apiBlockUser(userId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await apiRequest<unknown>(`/api/block/${encodeURIComponent(userId)}`, { method: "POST" });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function apiFollowPublicUser(userId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  return apiFollow(userId);
}

export async function apiUnfollowPublicUser(userId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  return apiUnfollow(userId);
}

export async function apiFetchPublicTabPage(
  tab: Exclude<PublicProfileTab, "shop">,
  userId: string,
  cursor?: string | null,
): Promise<{ page: FeedVideoPage | null; error: string | null }> {
  if (tab === "videos") return apiFetchUserVideos(userId, "public", cursor);
  if (tab === "saved") return apiFetchUserSavedFeed(userId, cursor);
  if (tab === "liked") return apiFetchUserLikedFeed(userId, cursor);
  return apiFetchReposts(userId, cursor);
}

export async function apiFetchPublicShop(userId: string): Promise<{ items: ShopItem[]; error: string | null }> {
  return apiListShopItems(userId);
}

export async function apiFetchPublicStories(userId: string): Promise<{
  stories: Array<{ id: string; mediaUrl: string; thumbnailUrl: string | null }>;
  error: string | null;
}> {
  const res = await apiFetchStories();
  if (res.error) return { stories: [], error: res.error };
  const row = res.users.find((user) => user.userId === userId);
  return { stories: row?.stories ?? [], error: null };
}

export type { FeedVideo, ShopItem };
