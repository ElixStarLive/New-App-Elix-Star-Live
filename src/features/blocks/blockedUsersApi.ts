import { blockedUsersResponseSchema, unblockUserResponseSchema } from "@shared/contracts";
import { apiRequest } from "@/lib/apiClient";

export type BlockedUserRow = {
  blocked_user_id: string;
  username?: string;
  display_name?: string;
  avatar_url?: string;
  created_at?: string;
};

export type BlockedUsersApiFailure = {
  ok: false;
  error: string;
  sessionExpired: boolean;
};

export function isBlockedUsersSessionFailure(status: number, code?: string): boolean {
  return status === 401 && (code === "unauthenticated" || code === "session_expired");
}

function failure(error: { message: string; status: number; code?: string }, fallback: string): BlockedUsersApiFailure {
  return {
    ok: false,
    error: error.message || fallback,
    sessionExpired: isBlockedUsersSessionFailure(error.status, error.code),
  };
}

export async function apiListBlockedUsers(): Promise<
  { ok: true; rows: BlockedUserRow[] } | BlockedUsersApiFailure
> {
  const { data, error } = await apiRequest<unknown>("/api/blocked-users");
  if (error) return failure(error, "Failed to load blocked users");
  const parsed = blockedUsersResponseSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, error: "Failed to load blocked users", sessionExpired: false };
  }
  return {
    ok: true,
    rows: parsed.data.data.map((row) => ({
      blocked_user_id: row.blocked_user_id,
      ...(row.username ? { username: row.username } : {}),
      ...(row.display_name ? { display_name: row.display_name } : {}),
      ...(row.avatar_url ? { avatar_url: row.avatar_url } : {}),
      ...(row.created_at ? { created_at: row.created_at } : {}),
    })),
  };
}

export async function apiUnblockUser(
  blockedUserId: string,
): Promise<{ ok: true } | BlockedUsersApiFailure> {
  const { data, error } = await apiRequest<unknown>("/api/unblock-user", {
    method: "POST",
    body: JSON.stringify({ blockedUserId }),
  });
  if (error) return failure(error, "Failed to unblock user");
  const parsed = unblockUserResponseSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, error: "Failed to unblock user", sessionExpired: false };
  }
  return { ok: true };
}
