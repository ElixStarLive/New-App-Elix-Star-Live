/** Frozen PAGE-071 Admin Users labels. Ban/unban only — no child-page actions. */

export const ADMIN_USERS_TITLE = "User Management";
export const ADMIN_USERS_LOADING = "Loading...";
export const ADMIN_USERS_ERROR = "Failed to load users";
export const ADMIN_USERS_SEARCH_PLACEHOLDER = "Search users...";
export const ADMIN_USERS_BAN_CONFIRM = "Are you sure you want to ban this user? This action cannot be easily undone.";
export const ADMIN_USERS_UNBAN_CONFIRM = "Unban this user?";
export const ADMIN_USERS_BAN_SUCCESS = "User banned successfully";
export const ADMIN_USERS_BAN_FAILURE = "Failed to ban user";
export const ADMIN_USERS_UNBAN_SUCCESS = "User unbanned";
export const ADMIN_USERS_UNBAN_FAILURE = "Failed to unban user";
export const ADMIN_USERS_HOME = "/admin/users";
export const ADMIN_USERS_DEFAULT_AVATAR = "/royce/default-avatar.svg";
export const ADMIN_USERS_BAN_REASON = "Banned by admin";

export function formatAdminJoinedDate(value: string): string {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";
  return date.toLocaleDateString();
}
