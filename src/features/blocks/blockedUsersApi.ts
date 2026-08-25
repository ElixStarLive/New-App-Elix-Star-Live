import { blockedUsersResponseSchema, unblockUserResponseSchema } from "@shared/contracts";
import type { BlockedUserRow as ContractBlockedUserRow } from "@shared/contracts";
import { apiRequest } from "@/lib/apiClient";

export type BlockedUserRow = ContractBlockedUserRow;

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
      blockedUserId: row.blockedUserId,
      ...(row.username ? { username: row.username } : {}),
      ...(row.displayName ? { displayName: row.displayName } : {}),
      ...(row.avatarUrl !== undefined ? { avatarUrl: row.avatarUrl } : {}),
      ...(row.createdAt ? { createdAt: row.createdAt } : {}),
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
