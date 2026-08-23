import type { UserPublic } from "@shared/contracts/auth";
import { followListResponseSchema } from "@shared/contracts/social";
import { apiRequest } from "@/lib/apiClient";
import { apiFollow, apiUnfollow } from "@/features/feed/feedApi";

export async function apiFetchFollowers(userId: string): Promise<{
  users: UserPublic[];
  error: string | null;
  status?: number;
}> {
  const { data, error } = await apiRequest<unknown>(
    `/api/profiles/${encodeURIComponent(userId)}/followers`,
  );
  if (error) return { users: [], error: error.message, status: error.status };
  const parsed = followListResponseSchema.safeParse(data);
  if (!parsed.success) return { users: [], error: "Invalid follow list" };
  return { users: parsed.data.users, error: null };
}

export async function apiFollowFollowerRow(userId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  return apiFollow(userId);
}

export async function apiUnfollowFollowerRow(userId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  return apiUnfollow(userId);
}
