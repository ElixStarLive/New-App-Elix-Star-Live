import type { UserPublic } from "@shared/contracts";
import { followListResponseSchema } from "@shared/contracts";
import { apiFollow, apiUnfollow } from "@/features/feed/feedApi";
import { apiRequest } from "@/lib/apiClient";

export async function apiFetchFollowing(userId: string): Promise<{
  users: UserPublic[];
  error: string | null;
  status?: number;
}> {
  const { data, error } = await apiRequest<unknown>(
    `/api/profiles/${encodeURIComponent(userId)}/following`,
  );
  if (error) return { users: [], error: error.message, status: error.status };
  const parsed = followListResponseSchema.safeParse(data);
  if (!parsed.success) return { users: [], error: "Invalid follow list" };
  return { users: parsed.data.users, error: null };
}

export async function apiFollowFollowingRow(userId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  return apiFollow(userId);
}

export async function apiUnfollowFollowingRow(userId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  return apiUnfollow(userId);
}
